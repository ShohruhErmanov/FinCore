import { z } from 'zod';

/**
 * The server-side event vocabulary. A client can never introduce an event type
 * or a payload shape: everything a notification can ever say about the system
 * is defined here, and the service refuses anything this file does not describe.
 *
 * PHASE 39 only defines the catalog. Wiring these into the business services
 * belongs to PHASE 41.
 */

export const NOTIFICATION_CHANNELS = ['telegram'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Branch-scoped events carry a branch id and are eventually delivered to people
 * who may read that branch; company-wide events carry none. The distinction is
 * recorded on the event so a later policy cannot reinterpret old history.
 */
export type EventScope = 'branch' | 'company';

/**
 * How careful delivery has to be with this event. PHASE 39 stores it; PHASE 40+
 * uses it to decide message detail. It is NOT an authorisation decision —
 * recipient permission is resolved server-side at fan-out time.
 */
export type EventSensitivity = 'low' | 'internal' | 'restricted';

// --- shared field shapes -----------------------------------------------------

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD kutilgan');
const isoDateTime = z.string().datetime({ offset: true });
/** Money stays an integer string end to end; a JS number would lose so'm. */
const moneyUzs = z.string().regex(/^\d+$/, 'butun so‘m string kutilgan');
const count = z.number().int().min(0);

export interface EventDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  aggregateType: string;
  scope: EventScope;
  sensitivity: EventSensitivity;
  /** Bumped when the recipient policy for this event type changes. */
  policyVersion: number;
  /** Bumped when the rendered message changes shape. */
  templateVersion: number;
  payload: S;
  /**
   * Logical identity of one occurrence. Always prefixed with the event type, so
   * two different types can never collide in the globally unique index.
   */
  dedupe: (payload: z.infer<S>) => string;
}

/**
 * Keeps each definition's payload/dedupe pair type-checked against each other
 * while erasing the generic, so the catalog is a uniform lookup table.
 */
const define = <S extends z.ZodTypeAny>(definition: EventDefinition<S>): EventDefinition =>
  definition as unknown as EventDefinition;

/**
 * Every payload schema is `.strict()`: an unexpected field is a rejection, not
 * something quietly stored. That is what keeps a caller from smuggling a phone
 * number, a salary figure or a token into notification history.
 */
export const EVENT_CATALOG = {
  'expense.created': define({
    aggregateType: 'expense',
    scope: 'branch',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        expenseId: uuid,
        branchId: uuid,
        amountUzs: moneyUzs,
        transactionDate: isoDate,
      })
      .strict(),
    dedupe: (p) => `expense.created:${p.expenseId}`,
  }),

  'expense.updated': define({
    aggregateType: 'expense',
    scope: 'branch',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        expenseId: uuid,
        branchId: uuid,
        amountUzs: moneyUzs,
        transactionDate: isoDate,
        // An expense can be edited repeatedly; the edit instant is what makes
        // each occurrence distinct.
        updatedAt: isoDateTime,
      })
      .strict(),
    dedupe: (p) => `expense.updated:${p.expenseId}:${p.updatedAt}`,
  }),

  'daily_revenue.recorded': define({
    aggregateType: 'daily_revenue',
    scope: 'branch',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        // The PHASE 19 logical id: daily-{branchId}-{YYYY-MM-DD}.
        dailyRevenueId: z.string().min(1).max(200),
        branchId: uuid,
        businessDate: isoDate,
        totalUzs: moneyUzs,
        /** How many of the three channels were non-zero — not the split itself. */
        channelCount: count.max(3),
      })
      .strict(),
    dedupe: (p) => `daily_revenue.recorded:${p.dailyRevenueId}`,
  }),

  'daily_revenue.replaced': define({
    aggregateType: 'daily_revenue',
    scope: 'branch',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        dailyRevenueId: z.string().min(1).max(200),
        branchId: uuid,
        businessDate: isoDate,
        totalUzs: moneyUzs,
        channelCount: count.max(3),
        // A day may be corrected more than once.
        replacedAt: isoDateTime,
      })
      .strict(),
    dedupe: (p) => `daily_revenue.replaced:${p.dailyRevenueId}:${p.replacedAt}`,
  }),

  'expense_import.completed': define({
    aggregateType: 'expense_import',
    scope: 'company',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        importId: z.string().min(1).max(200),
        imported: count,
        skipped: count,
        rejected: count,
      })
      .strict(),
    dedupe: (p) => `expense_import.completed:${p.importId}`,
  }),

  'budget_plan.changed': define({
    aggregateType: 'budget_plan',
    scope: 'company',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ periodId: uuid, lineCount: count, changedAt: isoDateTime }).strict(),
    dedupe: (p) => `budget_plan.changed:${p.periodId}:${p.changedAt}`,
  }),

  'revenue_plan.changed': define({
    aggregateType: 'revenue_plan',
    scope: 'company',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ periodId: uuid, lineCount: count, changedAt: isoDateTime }).strict(),
    dedupe: (p) => `revenue_plan.changed:${p.periodId}:${p.changedAt}`,
  }),

  // --- user / security events ------------------------------------------------
  // These carry an identity id and nothing else that could describe the person:
  // no name, phone, email, role or salary figure ever reaches the payload.

  'user.created': define({
    aggregateType: 'user',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ targetIdentityId: uuid, createdAt: isoDateTime }).strict(),
    dedupe: (p) => `user.created:${p.targetIdentityId}`,
  }),

  'user.access_changed': define({
    aggregateType: 'user',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ targetIdentityId: uuid, changedAt: isoDateTime }).strict(),
    dedupe: (p) => `user.access_changed:${p.targetIdentityId}:${p.changedAt}`,
  }),

  'user.status_changed': define({
    aggregateType: 'user',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    payload: z
      .object({
        targetIdentityId: uuid,
        status: z.enum(['active', 'inactive', 'blocked']),
        changedAt: isoDateTime,
      })
      .strict(),
    dedupe: (p) => `user.status_changed:${p.targetIdentityId}:${p.changedAt}`,
  }),

  'user.deleted': define({
    aggregateType: 'user',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    // Deliberately the identity id, never the deleted users.id: this is exactly
    // the row that outlives the account (PHASE 36).
    payload: z.object({ targetIdentityId: uuid, deletedAt: isoDateTime }).strict(),
    dedupe: (p) => `user.deleted:${p.targetIdentityId}`,
  }),

  'user.salary_changed': define({
    aggregateType: 'user',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    // No amount, old or new. That someone's pay changed is notifiable; what it
    // changed to is not something to scatter through delivery history.
    payload: z.object({ targetIdentityId: uuid, changedAt: isoDateTime }).strict(),
    dedupe: (p) => `user.salary_changed:${p.targetIdentityId}:${p.changedAt}`,
  }),

  'role.permissions_changed': define({
    aggregateType: 'role',
    scope: 'company',
    sensitivity: 'restricted',
    policyVersion: 1,
    templateVersion: 1,
    // The role code identifies which matrix row moved; the permission list
    // itself is not duplicated into notification history.
    payload: z
      .object({ roleCode: z.string().min(1).max(64), permissionCount: count, changedAt: isoDateTime })
      .strict(),
    dedupe: (p) => `role.permissions_changed:${p.roleCode}:${p.changedAt}`,
  }),

  // --- scheduled / derived events -------------------------------------------

  'daily_revenue.missing': define({
    aggregateType: 'daily_revenue',
    scope: 'branch',
    sensitivity: 'low',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ branchId: uuid, businessDate: isoDate }).strict(),
    // Naturally once per branch per day — a reminder scheduler that runs twice
    // cannot produce two events.
    dedupe: (p) => `daily_revenue.missing:${p.branchId}:${p.businessDate}`,
  }),

  'monthly_report.ready': define({
    aggregateType: 'accounting_period',
    scope: 'company',
    sensitivity: 'internal',
    policyVersion: 1,
    templateVersion: 1,
    payload: z.object({ periodId: uuid }).strict(),
    dedupe: (p) => `monthly_report.ready:${p.periodId}`,
  }),
} as const;

export type NotificationEventType = keyof typeof EVENT_CATALOG;

export const NOTIFICATION_EVENT_TYPES = Object.keys(EVENT_CATALOG) as NotificationEventType[];

export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return typeof value === 'string' && value in EVENT_CATALOG;
}

/**
 * Field names a notification payload must never contain, checked before the
 * per-type schema runs. The strict schemas already reject unknown keys; this is
 * the second lock, so a future definition cannot accidentally open the door.
 */
const FORBIDDEN_PAYLOAD_KEYS = [
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'sessiontoken',
  'session_token',
  'bottoken',
  'bot_token',
  'webhooksecret',
  'webhook_secret',
  'secret',
  'pepper',
  'chatid',
  'chat_id',
  'telegramuserid',
  'telegram_user_id',
  'phone',
  'email',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'passwordhash',
];

/** Walks the whole payload, not just its top level. */
export function findForbiddenPayloadKey(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenPayloadKey(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase())) return key;
    const hit = findForbiddenPayloadKey(nested, depth + 1);
    if (hit) return hit;
  }
  return null;
}
