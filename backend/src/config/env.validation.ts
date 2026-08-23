import { z } from 'zod';

/**
 * Environment contract, validated once at startup. A misconfigured process must
 * fail loudly here rather than surface later as a confusing runtime error.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

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
      .default('http://localhost:5173'),

    /** Signs the session cookie. Rotating it invalidates every live session. */
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

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
      .min(32, 'ACTOR_SIGNING_KEY must be the base64 of at least 24 random bytes'),
    /** Only has to outlive a single transaction. */
    ACTOR_TOKEN_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
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
    }
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
