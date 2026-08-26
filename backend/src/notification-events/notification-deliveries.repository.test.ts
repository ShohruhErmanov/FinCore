import { describe, expect, it } from 'vitest';
import type { PrismaService, PrismaTransaction } from '@/database';
import { NotificationDeliveriesRepository } from './notification-deliveries.repository';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ALI = '22222222-2222-4222-8222-222222222222';
const MADINA = '33333333-3333-4333-8333-333333333333';

type Status = 'pending' | 'processing' | 'retry' | 'delivered' | 'cancelled' | 'permanently_failed';

interface Row {
  id: string;
  event_id: string;
  recipient_identity_id: string;
  channel: string;
  status: Status;
  attempts: number;
  next_attempt_at: Date;
  lease_until: Date | null;
  lease_owner: string | null;
  last_error_code: string | null;
  provider_message_id: string | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  permanently_failed_at: Date | null;
}

const TERMINAL: Status[] = ['delivered', 'cancelled', 'permanently_failed'];

/**
 * Reproduces the delivery table's semantics: the UNIQUE index on
 * (event_id, recipient_identity_id, channel), the CHECK that attempts can never
 * go negative, the terminal-timestamp pairing, and — for the claim path — the
 * serialisation that FOR UPDATE SKIP LOCKED provides.
 *
 * The database-level guarantees themselves are asserted separately against
 * migration 011 in notification-outbox.schema.test.ts; migration 011 is not
 * applied, so they cannot be executed here.
 */
function makeDb() {
  const rows: Row[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  const insert = (values: unknown[]): Array<{ id: string }> => {
    const [eventId, recipientId, channel] = values as [string, string, string];
    const clash = rows.some(
      (r) =>
        r.event_id === eventId && r.recipient_identity_id === recipientId && r.channel === channel,
    );
    if (clash) return [];
    const row: Row = {
      id: `del-${rows.length + 1}`,
      event_id: eventId,
      recipient_identity_id: recipientId,
      channel,
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date(0),
      lease_until: null,
      lease_owner: null,
      last_error_code: null,
      provider_message_id: null,
      delivered_at: null,
      cancelled_at: null,
      permanently_failed_at: null,
    };
    rows.push(row);
    return [{ id: row.id }];
  };

  const claim = (values: unknown[]) => {
    const now = values[0] as Date;
    const limit = values[2] as number;
    const owner = values[3] as string;
    const leaseSeconds = values[5] as number;

    const eligible = rows
      .filter(
        (r) =>
          (['pending', 'retry'].includes(r.status) && r.next_attempt_at <= now) ||
          (r.status === 'processing' && r.lease_until !== null && r.lease_until <= now),
      )
      .sort((a, b) => a.next_attempt_at.getTime() - b.next_attempt_at.getTime())
      .slice(0, limit);

    return eligible.map((r) => {
      r.status = 'processing';
      r.lease_owner = owner;
      r.lease_until = new Date(now.getTime() + leaseSeconds * 1000);
      r.attempts += 1;
      if (r.attempts < 0) throw new Error('attempts >= 0 CHECK buzildi');
      return {
        id: r.id,
        eventId: r.event_id,
        recipientIdentityId: r.recipient_identity_id,
        channel: r.channel,
        attempts: r.attempts,
      };
    });
  };

  /** Guarded UPDATE: returns the affected row count, exactly like $executeRaw. */
  const transition = (sql: string, values: unknown[]): number => {
    const id = values.find((v) => typeof v === 'string' && v.startsWith('del-')) as string;
    const row = rows.find((r) => r.id === id);
    if (!row) return 0;

    // "AND lease_owner = $n" — a worker may only finalise its own lease.
    if (sql.includes('AND lease_owner =')) {
      const owner = values[values.length - 1] as string;
      if (row.lease_owner !== owner) return 0;
    }

    if (sql.includes("status = 'cancelled'")) {
      if (TERMINAL.includes(row.status)) return 0;
      row.status = 'cancelled';
      row.cancelled_at = new Date();
      row.last_error_code = values[0] as string;
    } else {
      // Every other transition requires the row to still be processing.
      if (row.status !== 'processing') return 0;
      if (sql.includes("status = 'delivered'")) {
        row.status = 'delivered';
        row.delivered_at = new Date();
        row.provider_message_id = (values[0] as string | null) ?? null;
        row.last_error_code = null;
      } else if (sql.includes("status = 'retry'")) {
        row.status = 'retry';
        row.next_attempt_at = values[0] as Date;
        row.last_error_code = values[1] as string;
      } else if (sql.includes("status = 'permanently_failed'")) {
        row.status = 'permanently_failed';
        row.permanently_failed_at = new Date();
        row.last_error_code = values[0] as string;
      } else return 0;
    }
    row.lease_owner = null;
    row.lease_until = null;
    return 1;
  };

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('INSERT INTO fincore.notification_deliveries')) return insert(values);
      if (sql.includes('FOR UPDATE SKIP LOCKED')) return claim(values);
      throw new Error(`kutilmagan SQL: ${sql.slice(0, 60)}`);
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) =>
      transition(strings.join(' '), values),
  };

  const prisma = {
    db: {
      ...tx,
      // Serialises callbacks, which is what SKIP LOCKED buys a second worker.
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => {
        const run = queue.then(() => fn(tx));
        queue = run.catch(() => undefined);
        return run;
      },
    },
  } as unknown as PrismaService;

  return { rows, prisma, tx: tx as unknown as PrismaTransaction };
}

describe('NotificationDeliveriesRepository — fan-out', () => {
  it('creates one row per recipient and channel', async () => {
    const db = makeDb();
    const repo = new NotificationDeliveriesRepository(db.prisma);

    const created = await repo.createDeliveries(db.tx, EVENT, [
      { recipientIdentityId: ALI, channel: 'telegram' },
      { recipientIdentityId: MADINA, channel: 'telegram' },
    ]);

    expect(created).toBe(2);
    expect(db.rows).toHaveLength(2);
  });

  it('refuses a duplicate (event, recipient, channel) instead of double-sending', async () => {
    const db = makeDb();
    const repo = new NotificationDeliveriesRepository(db.prisma);
    const target = [{ recipientIdentityId: ALI, channel: 'telegram' as const }];

    await repo.createDeliveries(db.tx, EVENT, target);
    const again = await repo.createDeliveries(db.tx, EVENT, target);

    expect(again).toBe(0);
    expect(db.rows).toHaveLength(1);
  });
});

describe('NotificationDeliveriesRepository — claiming', () => {
  async function seeded() {
    const db = makeDb();
    const repo = new NotificationDeliveriesRepository(db.prisma);
    await repo.createDeliveries(db.tx, EVENT, [
      { recipientIdentityId: ALI, channel: 'telegram' },
      { recipientIdentityId: MADINA, channel: 'telegram' },
    ]);
    return { db, repo };
  }

  it('claims due work and takes a lease', async () => {
    const { db, repo } = await seeded();
    const now = new Date('2026-08-20T10:00:00.000Z');

    const claimed = await repo.claim('worker-1', { limit: 10, leaseSeconds: 60, now });

    expect(claimed).toHaveLength(2);
    expect(claimed[0]!.attempts).toBe(1);
    expect(db.rows.every((r) => r.status === 'processing')).toBe(true);
    expect(db.rows.every((r) => r.lease_owner === 'worker-1')).toBe(true);
    expect(db.rows[0]!.lease_until).toEqual(new Date('2026-08-20T10:01:00.000Z'));
  });

  it('never claims a delivered, cancelled or permanently failed row', async () => {
    const { db, repo } = await seeded();
    const now = new Date('2026-08-20T10:00:00.000Z');
    await repo.claim('worker-1', { now });
    await repo.markDelivered(db.rows[0]!.id, 'worker-1', 'msg-1');
    await repo.markPermanentlyFailed(db.rows[1]!.id, 'worker-1', 'BLOCKED');

    // Far in the future: any claimable row would be due by now.
    const later = await repo.claim('worker-2', { now: new Date('2027-01-01T00:00:00.000Z') });

    expect(later).toHaveLength(0);
    expect(db.rows.map((r) => r.status)).toEqual(['delivered', 'permanently_failed']);
  });

  it('does not claim a cancelled row', async () => {
    const { db, repo } = await seeded();
    await repo.cancel(db.rows[0]!.id, 'RECIPIENT_UNLINKED');

    const claimed = await repo.claim('worker-1', { now: new Date('2027-01-01T00:00:00.000Z') });

    expect(claimed.map((c) => c.id)).toEqual([db.rows[1]!.id]);
  });

  it('leaves a retry alone until its next attempt is due', async () => {
    const { db, repo } = await seeded();
    const now = new Date('2026-08-20T10:00:00.000Z');
    await repo.claim('worker-1', { now });
    await repo.markRetry(db.rows[0]!.id, 'worker-1', 'TELEGRAM_HTTP_500', new Date('2026-08-20T10:05:00.000Z'));
    await repo.markDelivered(db.rows[1]!.id, 'worker-1');

    const tooEarly = await repo.claim('worker-1', { now: new Date('2026-08-20T10:04:00.000Z') });
    expect(tooEarly).toHaveLength(0);

    const due = await repo.claim('worker-1', { now: new Date('2026-08-20T10:05:00.000Z') });
    expect(due).toHaveLength(1);
    expect(due[0]!.attempts).toBe(2);
  });

  it('reclaims a row whose lease expired, so a dead worker does not strand it', async () => {
    const { db, repo } = await seeded();
    const now = new Date('2026-08-20T10:00:00.000Z');
    await repo.claim('worker-1', { leaseSeconds: 60, now });

    // Still inside the lease: another worker sees nothing.
    const held = await repo.claim('worker-2', { now: new Date('2026-08-20T10:00:30.000Z') });
    expect(held).toHaveLength(0);

    const afterExpiry = await repo.claim('worker-2', { now: new Date('2026-08-20T10:01:00.000Z') });
    expect(afterExpiry).toHaveLength(2);
    expect(db.rows.every((r) => r.lease_owner === 'worker-2')).toBe(true);
    expect(db.rows[0]!.attempts).toBe(2);
  });

  it('hands a row to only one of two workers claiming at once', async () => {
    const { db, repo } = await seeded();
    const now = new Date('2026-08-20T10:00:00.000Z');

    const [a, b] = await Promise.all([
      repo.claim('worker-1', { limit: 10, now }),
      repo.claim('worker-2', { limit: 10, now }),
    ]);

    const claimedIds = [...a, ...b].map((row) => row.id);
    expect(claimedIds).toHaveLength(2);
    expect(new Set(claimedIds).size).toBe(2);
    expect(db.rows.every((r) => r.attempts === 1)).toBe(true);
  });

  it('never lets attempts go negative', async () => {
    const { db, repo } = await seeded();
    await repo.claim('worker-1', { now: new Date('2026-08-20T10:00:00.000Z') });
    expect(db.rows.every((r) => r.attempts >= 0)).toBe(true);
  });
});

describe('NotificationDeliveriesRepository — state transitions', () => {
  async function claimed() {
    const db = makeDb();
    const repo = new NotificationDeliveriesRepository(db.prisma);
    await repo.createDeliveries(db.tx, EVENT, [{ recipientIdentityId: ALI, channel: 'telegram' }]);
    await repo.claim('worker-1', { now: new Date('2026-08-20T10:00:00.000Z') });
    return { db, repo, id: db.rows[0]!.id };
  }

  it('clears the lease when a delivery succeeds', async () => {
    const { db, repo, id } = await claimed();
    await repo.markDelivered(id, 'worker-1', 'tg-42');
    expect(db.rows[0]).toMatchObject({
      status: 'delivered',
      provider_message_id: 'tg-42',
      lease_owner: null,
      lease_until: null,
    });
    expect(db.rows[0]!.delivered_at).not.toBeNull();
  });

  it('refuses to deliver a row that is not being processed', async () => {
    const { repo, id } = await claimed();
    await repo.markDelivered(id, 'worker-1');
    await expect(repo.markDelivered(id, 'worker-1')).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
  });

  it('refuses to retry a row that already failed permanently', async () => {
    const { repo, id } = await claimed();
    await repo.markPermanentlyFailed(id, 'worker-1', 'BLOCKED');
    await expect(repo.markRetry(id, 'worker-1', 'X', new Date())).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
  });

  it('refuses to cancel an already terminal row', async () => {
    const { repo, id } = await claimed();
    await repo.markDelivered(id, 'worker-1');
    await expect(repo.cancel(id)).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
  });

  it('refuses to finalise a delivery leased by another worker', async () => {
    const { repo, id } = await claimed(); // held by worker-1
    await expect(repo.markDelivered(id, 'worker-2', 'tg-9')).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
    await expect(repo.markRetry(id, 'worker-2', 'X', new Date())).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
    await expect(repo.markPermanentlyFailed(id, 'worker-2', 'X')).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_STATE_INVALID',
    });
    // The rightful owner can still finish it.
    await expect(repo.markDelivered(id, 'worker-1', 'tg-9')).resolves.toBeUndefined();
  });

  it('cancels a pending row that was never claimed', async () => {
    const db = makeDb();
    const repo = new NotificationDeliveriesRepository(db.prisma);
    await repo.createDeliveries(db.tx, EVENT, [{ recipientIdentityId: ALI, channel: 'telegram' }]);

    await repo.cancel(db.rows[0]!.id, 'RECIPIENT_UNLINKED');

    expect(db.rows[0]!.status).toBe('cancelled');
    expect(db.rows[0]!.cancelled_at).not.toBeNull();
  });
});
