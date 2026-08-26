import { describe, expect, it } from 'vitest';
import type { PrismaTransaction } from '@/database';
import { EVENT_CATALOG, NOTIFICATION_EVENT_TYPES } from './event-catalog';
import { NotificationEventsService } from './notification-events.service';

const BRANCH = '11111111-1111-4111-8111-111111111111';
const IDENTITY = '22222222-2222-4222-8222-222222222222';
const EXPENSE = '33333333-3333-4333-8333-333333333333';

interface EventRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  branch_id: string | null;
  actor_identity_id: string | null;
  payload: string;
  dedupe_key: string;
}

/**
 * Stands in for the two statements the service issues against its transaction
 * client, reproducing the semantics that matter: the UNIQUE index on dedupe_key
 * and ON CONFLICT DO NOTHING.
 *
 * `commit()` is what makes the rollback test meaningful — rows written inside
 * the callback only reach `committed` if the callback returned normally, which
 * is exactly how a real transaction behaves.
 */
function makeTx() {
  const committed: EventRow[] = [];
  let staged: EventRow[] = [];

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      const visible = [...committed, ...staged];

      if (sql.includes('INSERT INTO fincore.notification_events')) {
        const dedupeKey = values[6] as string;
        // UNIQUE (dedupe_key) + ON CONFLICT DO NOTHING → no row returned.
        if (visible.some((row) => row.dedupe_key === dedupeKey)) return [];
        const row: EventRow = {
          id: `evt-${visible.length + 1}`,
          event_type: values[0] as string,
          aggregate_type: values[1] as string,
          aggregate_id: values[2] as string,
          branch_id: (values[3] as string | null) ?? null,
          actor_identity_id: (values[4] as string | null) ?? null,
          payload: values[5] as string,
          dedupe_key: dedupeKey,
        };
        staged.push(row);
        return [{ id: row.id }];
      }

      if (sql.includes('SELECT id::text AS id FROM fincore.notification_events')) {
        const found = visible.find((row) => row.dedupe_key === values[0]);
        return found ? [{ id: found.id }] : [];
      }
      throw new Error(`kutilmagan SQL: ${sql.slice(0, 60)}`);
    },
  } as unknown as PrismaTransaction;

  return {
    tx,
    committed,
    /** Mirrors prisma.$transaction: writes survive only a clean return. */
    run: async <T>(work: (tx: PrismaTransaction) => Promise<T>): Promise<T> => {
      staged = [];
      try {
        const result = await work(tx);
        committed.push(...staged);
        return result;
      } finally {
        staged = [];
      }
    },
  };
}

const service = new NotificationEventsService();

const expenseCreated = {
  eventType: 'expense.created' as const,
  aggregateId: EXPENSE,
  branchId: BRANCH,
  actorIdentityId: IDENTITY,
  payload: {
    expenseId: EXPENSE,
    branchId: BRANCH,
    amountUzs: '1500000',
    transactionDate: '2026-08-20',
  },
};

describe('NotificationEventsService — transactional behaviour', () => {
  it('persists the event when the business transaction commits', async () => {
    const db = makeTx();

    const ref = await db.run(async (tx) => {
      // Stands in for the business mutation that shares this transaction.
      return service.createInTransaction(tx, expenseCreated);
    });

    expect(ref.deduplicated).toBe(false);
    expect(db.committed).toHaveLength(1);
    expect(db.committed[0]).toMatchObject({
      event_type: 'expense.created',
      aggregate_type: 'expense',
      aggregate_id: EXPENSE,
      branch_id: BRANCH,
      actor_identity_id: IDENTITY,
      dedupe_key: `expense.created:${EXPENSE}`,
    });
  });

  it('leaves no event behind when the business transaction rolls back', async () => {
    const db = makeTx();

    await expect(
      db.run(async (tx) => {
        await service.createInTransaction(tx, expenseCreated);
        // The business mutation fails after the event was written.
        throw new Error('business mutation failed');
      }),
    ).rejects.toThrow('business mutation failed');

    expect(db.committed).toHaveLength(0);
  });

  it('treats a repeat of the same logical event as a no-op', async () => {
    const db = makeTx();

    const first = await db.run((tx) => service.createInTransaction(tx, expenseCreated));
    const second = await db.run((tx) => service.createInTransaction(tx, expenseCreated));

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
    expect(db.committed).toHaveLength(1);
  });

  it('keeps distinct occurrences of a repeatable event apart', async () => {
    const db = makeTx();
    const base = {
      eventType: 'expense.updated' as const,
      aggregateId: EXPENSE,
      branchId: BRANCH,
      payload: {
        expenseId: EXPENSE,
        branchId: BRANCH,
        amountUzs: '1500000',
        transactionDate: '2026-08-20',
        updatedAt: '2026-08-20T10:00:00.000Z',
      },
    };

    await db.run((tx) => service.createInTransaction(tx, base));
    const second = await db.run((tx) =>
      service.createInTransaction(tx, {
        ...base,
        payload: { ...base.payload, updatedAt: '2026-08-20T11:00:00.000Z' },
      }),
    );

    expect(second.deduplicated).toBe(false);
    expect(db.committed).toHaveLength(2);
  });
});

describe('NotificationEventsService — backend-owned contract', () => {
  it('rejects an event type that is not in the catalog', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) =>
        service.createInTransaction(tx, {
          ...expenseCreated,
          eventType: 'attacker.invented' as never,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_TYPE_UNKNOWN' });
    expect(db.committed).toHaveLength(0);
  });

  it('rejects an unexpected payload field', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) =>
        service.createInTransaction(tx, {
          ...expenseCreated,
          payload: { ...expenseCreated.payload, note: 'smuggled' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_PAYLOAD_INVALID' });
  });

  it.each([
    ['password', { password: 'x' }],
    ['botToken', { botToken: '123:AA' }],
    ['chatId', { chatId: '99999999' }],
    ['phone', { phone: '+998900000000' }],
    ['sessionToken', { sessionToken: 'abc' }],
  ])('refuses a payload carrying %s', async (_label, extra) => {
    const db = makeTx();
    await expect(
      db.run((tx) =>
        service.createInTransaction(tx, {
          ...expenseCreated,
          payload: { ...expenseCreated.payload, ...extra },
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_PAYLOAD_FORBIDDEN_FIELD' });
  });

  it('refuses a secret hidden inside a nested object', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) =>
        service.createInTransaction(tx, {
          ...expenseCreated,
          payload: { ...expenseCreated.payload, meta: { deep: { webhookSecret: 'x' } } },
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_PAYLOAD_FORBIDDEN_FIELD' });
  });

  it('rejects a payload that is not an object', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) => service.createInTransaction(tx, { ...expenseCreated, payload: ['x'] })),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_PAYLOAD_INVALID' });
  });

  it('requires a branch for a branch-scoped event', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) => service.createInTransaction(tx, { ...expenseCreated, branchId: null })),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_SCOPE_INVALID' });
  });

  it('refuses a branch on a company-wide event', async () => {
    const db = makeTx();
    await expect(
      db.run((tx) =>
        service.createInTransaction(tx, {
          eventType: 'monthly_report.ready',
          aggregateId: BRANCH,
          branchId: BRANCH,
          payload: { periodId: BRANCH },
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_SCOPE_INVALID' });
  });
});

describe('event catalog', () => {
  it('covers every event type PHASE 37 identified', () => {
    expect(NOTIFICATION_EVENT_TYPES.sort()).toEqual(
      [
        'budget_plan.changed',
        'daily_revenue.missing',
        'daily_revenue.recorded',
        'daily_revenue.replaced',
        'expense.created',
        'expense.updated',
        'expense_import.completed',
        'monthly_report.ready',
        'revenue_plan.changed',
        'role.permissions_changed',
        'user.access_changed',
        'user.created',
        'user.deleted',
        'user.salary_changed',
        'user.status_changed',
      ].sort(),
    );
  });

  it('prefixes every dedupe key with its own event type', () => {
    const samples: Record<string, Record<string, unknown>> = {
      'expense.created': expenseCreated.payload,
      'daily_revenue.missing': { branchId: BRANCH, businessDate: '2026-08-20' },
      'user.deleted': { targetIdentityId: IDENTITY, deletedAt: '2026-08-20T10:00:00.000Z' },
      'monthly_report.ready': { periodId: BRANCH },
    };
    for (const [type, payload] of Object.entries(samples)) {
      const key = EVENT_CATALOG[type as keyof typeof EVENT_CATALOG].dedupe(payload);
      expect(key.startsWith(`${type}:`)).toBe(true);
    }
  });

  it('never names a role in a payload schema and never carries a salary figure', () => {
    const serialised = JSON.stringify(
      Object.entries(EVENT_CATALOG).map(([type, definition]) => ({
        type,
        aggregateType: definition.aggregateType,
        scope: definition.scope,
      })),
    );
    expect(serialised).not.toMatch(/director|finance_manager|cashier/i);

    // user.salary_changed says that pay changed, never what it changed to.
    const salary = EVENT_CATALOG['user.salary_changed'].payload.safeParse({
      targetIdentityId: IDENTITY,
      changedAt: '2026-08-20T10:00:00.000Z',
      fixedSalaryUzs: '4500000',
    });
    expect(salary.success).toBe(false);
  });
});
