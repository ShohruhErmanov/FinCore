import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '@/common';
import type { PrismaTransaction } from '@/database';
import {
  EVENT_CATALOG,
  findForbiddenPayloadKey,
  isNotificationEventType,
  type EventDefinition,
  type NotificationEventType,
} from './event-catalog';

export interface NotificationEventInput {
  eventType: NotificationEventType;
  /** Business key of the thing that changed. */
  aggregateId: string;
  /** Required for a branch-scoped type, forbidden for a company-wide one. */
  branchId?: string | null;
  /** fincore.user_identities(id). Omit when the system raised the event itself. */
  actorIdentityId?: string | null;
  payload: unknown;
  occurredAt?: Date;
  /** Earliest moment delivery may happen; defaults to occurredAt. */
  availableAt?: Date;
}

export interface NotificationEventRef {
  id: string;
  /** True when this exact logical event already existed and nothing was written. */
  deduplicated: boolean;
}

/**
 * Writes immutable notification events.
 *
 * The whole point is the transaction: `createInTransaction` takes the caller's
 * existing Prisma transaction client, so the event is written by the same
 * transaction as the business mutation. If that transaction rolls back, the
 * event disappears with it — there is no separate connection and no nested
 * transaction that could commit on its own.
 *
 * There is deliberately no HTTP surface. Events come from trusted backend
 * service code only; a client can neither raise one nor influence its shape.
 */
@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  async createInTransaction(
    tx: PrismaTransaction,
    input: NotificationEventInput,
  ): Promise<NotificationEventRef> {
    const definition = this.requireDefinition(input.eventType);
    const payload = this.validatePayload(input.eventType, definition, input.payload);

    this.assertScope(input.eventType, definition, input.branchId ?? null);

    const dedupeKey = definition.dedupe(payload);
    const occurredAt = input.occurredAt ?? new Date();
    const availableAt = input.availableAt ?? occurredAt;

    // ON CONFLICT DO NOTHING rather than catching a unique violation: inside an
    // interactive transaction a failed statement would abort the caller's whole
    // business transaction, which is exactly what must not happen here.
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO fincore.notification_events (
        event_type, aggregate_type, aggregate_id, branch_id, actor_identity_id,
        payload, dedupe_key, policy_version, template_version, occurred_at, available_at
      ) VALUES (
        ${input.eventType},
        ${definition.aggregateType},
        ${input.aggregateId},
        ${input.branchId ?? null}::uuid,
        ${input.actorIdentityId ?? null}::uuid,
        ${JSON.stringify(payload)}::jsonb,
        ${dedupeKey},
        ${definition.policyVersion},
        ${definition.templateVersion},
        ${occurredAt},
        ${availableAt}
      )
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id::text AS id
    `;

    if (inserted[0]) return { id: inserted[0].id, deduplicated: false };

    // Someone already raised this exact logical event — return the original.
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM fincore.notification_events WHERE dedupe_key = ${dedupeKey}
    `;
    if (!existing[0])
      throw new ApiException(
        500,
        'NOTIFICATION_EVENT_WRITE_FAILED',
        'Bildirishnoma hodisasini yozib bo‘lmadi.',
      );

    // No payload in this line: it is a notification event, but still business data.
    this.logger.debug(`Takroriy hodisa e'tiborga olinmadi: ${input.eventType}`);
    return { id: existing[0].id, deduplicated: true };
  }

  // ------------------------------------------------------------- internals --

  private requireDefinition(eventType: string): EventDefinition {
    if (!isNotificationEventType(eventType))
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_TYPE_UNKNOWN',
        'Noma’lum bildirishnoma hodisasi turi.',
        { eventType },
      );
    return EVENT_CATALOG[eventType];
  }

  private validatePayload(
    eventType: NotificationEventType,
    definition: EventDefinition,
    payload: unknown,
  ): Record<string, unknown> {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_PAYLOAD_INVALID',
        'Hodisa payload’i obyekt bo‘lishi kerak.',
        { eventType },
      );

    // Checked before the schema so the reason is precise: a secret-shaped field
    // is refused as a secret, not merely as an unknown key.
    const forbidden = findForbiddenPayloadKey(payload);
    if (forbidden)
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_PAYLOAD_FORBIDDEN_FIELD',
        'Hodisa payload’ida maxfiy maydon bo‘lishi mumkin emas.',
        { eventType, field: forbidden },
      );

    const parsed = definition.payload.safeParse(payload);
    if (!parsed.success)
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_PAYLOAD_INVALID',
        'Hodisa payload’i katalogdagi shaklga mos emas.',
        {
          eventType,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      );
    return parsed.data as Record<string, unknown>;
  }

  private assertScope(
    eventType: NotificationEventType,
    definition: EventDefinition,
    branchId: string | null,
  ): void {
    if (definition.scope === 'branch' && !branchId)
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_SCOPE_INVALID',
        'Filialga bog‘liq hodisa uchun branchId majburiy.',
        { eventType },
      );
    if (definition.scope === 'company' && branchId)
      throw new ApiException(
        422,
        'NOTIFICATION_EVENT_SCOPE_INVALID',
        'Kompaniya darajasidagi hodisa filialga bog‘lanmaydi.',
        { eventType },
      );
  }
}
