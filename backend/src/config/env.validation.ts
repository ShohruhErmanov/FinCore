import { z } from 'zod';

/**
 * Environment contract, validated once at startup. A misconfigured process must
 * fail loudly here rather than surface later as a confusing runtime error.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * .env.example ships placeholders like __KAMIDA_32_BELGILI_TASODIFIY_QIYMAT__.
 * Some are long enough to pass a length check, so a copied-but-unedited file
 * would boot with a secret anyone can read on GitHub. Refuse them outright.
 */
const notPlaceholder = (value: string) => !/^__.*__$/.test(value.trim());
const PLACEHOLDER_MESSAGE = 'still the .env.example placeholder — generate a real random value';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /**
     * Interface the API listens on. Loopback by default: on a laptop on shared
     * Wi-Fi, an API bound to every interface is reachable by the whole network.
     * Behind a reverse proxy on the same host this stays 127.0.0.1; set 0.0.0.0
     * only when another machine must reach the process directly.
     */
    HOST: z.string().min(1).default('127.0.0.1'),
    /**
     * Number of reverse-proxy hops to trust for the client address. 0 (the
     * default) trusts none. Behind nginx set 1 — otherwise every request seems
     * to come from the proxy, and one client's login throttle locks out all.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /**
     * Optional outside production so the foundation boots and /health can report
     * `NOT CONFIGURED` before a database exists. Required in production.
     */
    DATABASE_URL: z
      .string()
      .refine(
        (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
        'DATABASE_URL must be a postgres:// or postgresql:// connection string',
      )
      .optional(),

    /** Exact origin allowed by CORS. Wildcards are rejected: the frontend sends credentials. */
    FRONTEND_URL: z
      .string()
      .url('FRONTEND_URL must be an absolute URL, e.g. http://localhost:5173')
      .refine((value) => !value.includes('*'), 'FRONTEND_URL must not contain a wildcard')
      .refine((value) => {
        try {
          const url = new URL(value);
          return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
        } catch {
          return false;
        }
      }, 'FRONTEND_URL must contain only an origin (no credentials, path, query or hash)')
      .transform((value) => new URL(value).origin)
      .default('http://localhost:5173'),

    /** Signs the session cookie. Rotating it invalidates every live session. */
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters')
      .refine(notPlaceholder, `SESSION_SECRET is ${PLACEHOLDER_MESSAGE}`),

    COOKIE_DOMAIN: z.string().min(1).optional(),
    COOKIE_SECURE: booleanish.default('false'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),

    SWAGGER_ENABLED: booleanish.default('false'),

    /**
     * Global request budget per client. The login route applies its own much
     * stricter override (see AuthController) rather than a second global
     * limiter — every configured throttler is evaluated on every route, so an
     * "auth" limiter would be drained by ordinary traffic.
     */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),

    /**
     * Signs the per-request actor token the database checks before accepting an
     * audited write. Must match a live row in fincore._actor_signing_keys —
     * create one with `npm run init:actor-key`.
     */
    ACTOR_SIGNING_KEY_ID: z.string().uuid('ACTOR_SIGNING_KEY_ID must be a UUID'),
    ACTOR_SIGNING_KEY: z
      .string()
      .min(32, 'ACTOR_SIGNING_KEY must be the base64 of at least 24 random bytes')
      .refine(notPlaceholder, `ACTOR_SIGNING_KEY is ${PLACEHOLDER_MESSAGE}`),
    /** Only has to outlive a single transaction. */
    ACTOR_TOKEN_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(60),

    /**
     * Telegram integration. Off by default so development and test never reach
     * the network and never need real credentials. Every secret below lives
     * ONLY here — never in fincore.system_settings, never in an API response,
     * never in a log line or audit payload.
     */
    TELEGRAM_ENABLED: booleanish.default('false'),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    /** Without the leading @ — used to build https://t.me/<username>?start=… */
    TELEGRAM_BOT_USERNAME: z
      .string()
      .regex(/^[A-Za-z0-9_]{5,32}$/, 'TELEGRAM_BOT_USERNAME must be 5-32 chars of A-Z, 0-9 or _')
      .optional(),
    /** Compared against X-Telegram-Bot-Api-Secret-Token on every webhook call. */
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .min(32, 'TELEGRAM_WEBHOOK_SECRET must be at least 32 characters')
      .refine(notPlaceholder, `TELEGRAM_WEBHOOK_SECRET is ${PLACEHOLDER_MESSAGE}`)
      .optional(),
    /** HMAC key for link tokens: the raw token is never stored, only its digest. */
    TELEGRAM_LINK_TOKEN_PEPPER: z
      .string()
      .min(32, 'TELEGRAM_LINK_TOKEN_PEPPER must be at least 32 characters')
      .refine(notPlaceholder, `TELEGRAM_LINK_TOKEN_PEPPER is ${PLACEHOLDER_MESSAGE}`)
      .optional(),
    /** Deep links are short-lived by design; a stale link must not stay usable. */
    TELEGRAM_LINK_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),

    /**
     * PHASE 40 outbox worker. Off by default: a deployment that has not opted in
     * writes notification events but never delivers them, which is the safe
     * state for development, tests and any instance that should not send.
     */
    NOTIFICATION_WORKER_ENABLED: booleanish.default('false'),
    /** Bounded polling — never a tight loop. */
    NOTIFICATION_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(15_000),
    NOTIFICATION_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Must outlast one batch, or a slow worker loses its own rows. */
    NOTIFICATION_WORKER_LEASE_SECONDS: z.coerce.number().int().min(5).max(3_600).default(120),
    /** Attempts are counted by the claim itself; this caps them. */
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    NOTIFICATION_RETRY_BASE_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
    NOTIFICATION_RETRY_MAX_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(3_600_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.DATABASE_URL)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is required in production',
        });
      if (!env.COOKIE_SECURE)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production (session cookie is sent cross-site)',
        });
      if (env.SWAGGER_ENABLED)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWAGGER_ENABLED'],
          message: 'SWAGGER_ENABLED must be false in production',
        });
      if (new URL(env.FRONTEND_URL).protocol !== 'https:')
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['FRONTEND_URL'],
          message: 'FRONTEND_URL must use https:// in production',
        });
    }

    // Checked whenever the integration is switched on, not only in production:
    // an enabled-but-unconfigured Telegram would fail at the first webhook,
    // long after the misconfiguration was introduced.
    if (env.TELEGRAM_ENABLED)
      for (const key of [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_BOT_USERNAME',
        'TELEGRAM_WEBHOOK_SECRET',
        'TELEGRAM_LINK_TOKEN_PEPPER',
      ] as const)
        if (!env[key])
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when TELEGRAM_ENABLED=true`,
          });

    // Telegram is the only delivery channel, so a worker without it would spin
    // and permanently fail everything it picked up.
    if (env.NOTIFICATION_WORKER_ENABLED && !env.TELEGRAM_ENABLED)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NOTIFICATION_WORKER_ENABLED'],
        message: 'NOTIFICATION_WORKER_ENABLED requires TELEGRAM_ENABLED=true',
      });

    if (env.NOTIFICATION_RETRY_MAX_MS < env.NOTIFICATION_RETRY_BASE_MS)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NOTIFICATION_RETRY_MAX_MS'],
        message: 'NOTIFICATION_RETRY_MAX_MS must be >= NOTIFICATION_RETRY_BASE_MS',
      });
  });

export type AppEnv = z.infer<typeof schema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Thrown before the Nest logger exists, so the message must stand on its own.
  throw new Error(
    `FinCore backend cannot start — invalid environment configuration:\n${details}\n` +
      'See backend/.env.example for the expected values.',
  );
}
