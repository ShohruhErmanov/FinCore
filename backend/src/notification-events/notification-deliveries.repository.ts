import { Injectable } from '@nestjs/common';
import { ApiException } from '@/common';
import { PrismaService, type PrismaTransaction } from '@/database';
import type { NotificationChannel } from './event-catalog';

export interface DeliveryTarget {
  /** fincore.user_identities(id) — never users(id), so history outlives the account. */
  recipientIdentityId: string;
  channel: NotificationChannel;
}

export interface ClaimedDelivery {
  id: string;
  eventId: string;
  recipientIdentityId: string;
  channel: NotificationChannel;
  attempts: number;
}

/** Terminal states can never be claimed again, by construction of every query below. */
const TERMINAL = ['delivered', 'cancelled', 'permanently_failed'] as const;

/**
 * Outbox primitives for the PHASE 40 worker.
 *
 * PHASE 39 provides only the mechanics — claiming, leasing and state
 * transitions. There is no loop, no scheduler and no provider call here; a
 * worker will drive these methods.
 */
@Injectable()
export class NotificationDeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fan-out. Runs in the caller's transaction so delivery rows appear with the
   * event, and re-running it is a no-op rather than a second message.
   */
  async createDeliveries(
    tx: PrismaTransaction,
    eventId: string,
    targets: DeliveryTarget[],
  ): Promise<number> {
    let created = 0;
    for (const target of targets) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO fincore.notification_deliveries (event_id, recipient_identity_id, channel)
        VALUES (${eventId}::uuid, ${target.recipientIdentityId}::uuid, ${target.channel}::fincore.notification_channel)
        ON CONFLICT (event_id, recipient_identity_id, channel) DO NOTHING
        RETURNING id::text AS id
      `;
      if (rows[0]) created += 1;
    }
    return created;
  }

  /**
   * Takes up to `limit` rows and marks them processing under a lease.
   *
   * Two properties matter here:
   *   * FOR UPDATE SKIP LOCKED — a second worker running the same statement
   *     walks past rows this one is holding instead of blocking on them, so
   *     the same delivery is never handed to two workers;
   *   * the predicate lists only claimable states, so delivered, cancelled and
   *     permanently_failed rows are invisible to the scan.
   *
   * A `processing` row whose lease has expired is claimable again — that is how
   * work recovers from a worker that died mid-send.
   */
  async claim(
    leaseOwner: string,
    options: { limit?: number; leaseSeconds?: number; now?: Date } = {},
  ): Promise<ClaimedDelivery[]> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const leaseSeconds = Math.min(Math.max(options.leaseSeconds ?? 60, 5), 3600);
    const now = options.now ?? new Date();

    return this.prisma.db.$transaction(async (tx) =>
      tx.$queryRaw<ClaimedDelivery[]>`
        WITH claimable AS (
          SELECT id
          FROM fincore.notification_deliveries
          WHERE (
                  status IN ('pending', 'retry')
                  AND next_attempt_at <= ${now}
                )
             OR (
                  -- expired lease: the previous owner never finished
                  status = 'processing'
                  AND lease_until IS NOT NULL
                  AND lease_until <= ${now}
                )
          ORDER BY next_attempt_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE fincore.notification_deliveries AS d
        SET status = 'processing',
            lease_owner = ${leaseOwner},
            lease_until = ${now} + make_interval(secs => ${leaseSeconds}),
            attempts = d.attempts + 1
        FROM claimable
        WHERE d.id = claimable.id
        RETURNING d.id::text                    AS "id",
                  d.event_id::text              AS "eventId",
                  d.recipient_identity_id::text AS "recipientIdentityId",
                  d.channel::text               AS "channel",
                  d.attempts                    AS "attempts"
      `,
    );
  }

  /** Success. Clears the lease and freezes the row in a terminal state. */
  async markDelivered(id: string, providerMessageId: string | null = null): Promise<void> {
    await this.transition(
      id,
      this.prisma.db.$executeRaw`
        UPDATE fincore.notification_deliveries
        SET status = 'delivered',
            delivered_at = now(),
            provider_message_id = ${providerMessageId},
            last_error_code = NULL,
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = ${id}::uuid AND status = 'processing'
      `,
    );
  }

  /** Recoverable failure: back to the queue, not due again until nextAttemptAt. */
  async markRetry(id: string, errorCode: string, nextAttemptAt: Date): Promise<void> {
    await this.transition(
      id,
      this.prisma.db.$executeRaw`
        UPDATE fincore.notification_deliveries
        SET status = 'retry',
            next_attempt_at = ${nextAttemptAt},
            last_error_code = ${errorCode},
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = ${id}::uuid AND status = 'processing'
      `,
    );
  }

  /** Unrecoverable failure — no further attempt will ever be made. */
  async markPermanentlyFailed(id: string, errorCode: string): Promise<void> {
    await this.transition(
      id,
      this.prisma.db.$executeRaw`
        UPDATE fincore.notification_deliveries
        SET status = 'permanently_failed',
            permanently_failed_at = now(),
            last_error_code = ${errorCode},
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = ${id}::uuid AND status = 'processing'
      `,
    );
  }

  /**
   * Withdraws work that should no longer be delivered — for example after the
   * recipient unlinked. Allowed from any non-terminal state, including while
   * another worker holds a lease: the claim it holds becomes a no-op because
   * every transition above requires status = 'processing'.
   */
  async cancel(id: string, reasonCode = 'CANCELLED'): Promise<void> {
    await this.transition(
      id,
      this.prisma.db.$executeRaw`
        UPDATE fincore.notification_deliveries
        SET status = 'cancelled',
            cancelled_at = now(),
            last_error_code = ${reasonCode},
            lease_owner = NULL,
            lease_until = NULL
        WHERE id = ${id}::uuid AND status NOT IN ('delivered', 'cancelled', 'permanently_failed')
      `,
    );
  }

  /** Rows a worker is holding right now — used by PHASE 40 diagnostics. */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.prisma.db.$queryRaw<Array<{ status: string; n: bigint }>>`
      SELECT status::text AS status, count(*)::bigint AS n
      FROM fincore.notification_deliveries GROUP BY status
    `;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]));
  }

  /**
   * A guarded UPDATE affects zero rows when the row was already terminal or was
   * taken over by another worker. That is not a crash, but it must not look
   * like success either.
   */
  private async transition(id: string, work: Promise<number> | number): Promise<void> {
    const affected = await work;
    if (affected === 0)
      throw new ApiException(
        409,
        'NOTIFICATION_DELIVERY_STATE_INVALID',
        'Yetkazish holati bu o‘tishga ruxsat bermaydi.',
        { deliveryId: id, terminal: [...TERMINAL] },
      );
  }
}
