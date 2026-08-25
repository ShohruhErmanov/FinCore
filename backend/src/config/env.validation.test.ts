import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const base = {
  SESSION_SECRET: 'x'.repeat(32),
  // Required since Phase 18.3: audited writes carry a signed actor token.
  ACTOR_SIGNING_KEY_ID: '00000000-0000-4000-8000-000000000001',
  ACTOR_SIGNING_KEY: 'y'.repeat(44),
};

describe('validateEnv', () => {
  it('applies documented defaults', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
    expect(env.SESSION_TTL_HOURS).toBe(12);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: 'qisqa' })).toThrow(/SESSION_SECRET/);
  });

  it('requires a session secret at all', () => {
    const { SESSION_SECRET: _omitted, ...without } = base;
    expect(() => validateEnv(without)).toThrow(/SESSION_SECRET/);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ ...base, FRONTEND_URL: 'https://*.fincore.uz' })).toThrow(/wildcard/);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://localhost/fincore' })).toThrow(
      /postgres/,
    );
  });

  it('accepts both postgres:// and postgresql://', () => {
    for (const url of ['postgres://u@h/db', 'postgresql://u@h/db'])
      expect(validateEnv({ ...base, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('coerces booleanish flags', () => {
    expect(validateEnv({ ...base, SWAGGER_ENABLED: '1' }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnv({ ...base, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  describe('production hardening', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u@h/db',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'false',
    };

    it('accepts a correctly hardened production config', () => {
      expect(validateEnv({ ...prod }).NODE_ENV).toBe('production');
    });

    it('requires DATABASE_URL', () => {
      const { DATABASE_URL: _omitted, ...without } = prod;
      expect(() => validateEnv(without)).toThrow(/DATABASE_URL is required in production/);
    });

    it('refuses an insecure cookie', () => {
      expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    });

    it('refuses to expose Swagger', () => {
      expect(() => validateEnv({ ...prod, SWAGGER_ENABLED: 'true' })).toThrow(/SWAGGER_ENABLED/);
    });
  });

  describe('Telegram (PHASE 38)', () => {
    const telegram = {
      TELEGRAM_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: '123456:AA-real-token',
      TELEGRAM_BOT_USERNAME: 'fincore_bot',
      TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(48),
      TELEGRAM_LINK_TOKEN_PEPPER: 'p'.repeat(48),
    };
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u@h/db',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'false',
    };

    it('is off by default, so development and test need no Telegram secrets', () => {
      const env = validateEnv({ ...base });
      expect(env.TELEGRAM_ENABLED).toBe(false);
      expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
      expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
      expect(env.TELEGRAM_LINK_TOKEN_TTL_MINUTES).toBe(10);
    });

    it('stays valid in production while it is switched off', () => {
      expect(() => validateEnv({ ...prod })).not.toThrow();
    });

    it('accepts a fully configured production integration', () => {
      const env = validateEnv({ ...prod, ...telegram });
      expect(env.TELEGRAM_ENABLED).toBe(true);
      expect(env.TELEGRAM_BOT_USERNAME).toBe('fincore_bot');
    });

    it.each([
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_USERNAME',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_LINK_TOKEN_PEPPER',
    ])('requires %s once the integration is enabled', (missing) => {
      const { [missing]: _omitted, ...rest } = telegram as Record<string, string>;
      expect(() => validateEnv({ ...prod, ...rest })).toThrow(new RegExp(missing));
    });

    it('refuses a webhook secret that is too short to be worth comparing', () => {
      expect(() =>
        validateEnv({ ...prod, ...telegram, TELEGRAM_WEBHOOK_SECRET: 'short' }),
      ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    });

    it('refuses a link pepper that is too short', () => {
      expect(() =>
        validateEnv({ ...prod, ...telegram, TELEGRAM_LINK_TOKEN_PEPPER: 'short' }),
      ).toThrow(/TELEGRAM_LINK_TOKEN_PEPPER/);
    });

    it('refuses a bot username Telegram would never issue', () => {
      expect(() =>
        validateEnv({ ...prod, ...telegram, TELEGRAM_BOT_USERNAME: '@no-dashes-allowed' }),
      ).toThrow(/TELEGRAM_BOT_USERNAME/);
    });
  });

  it('reports every problem at once, not just the first', () => {
    let message = '';
    try {
      validateEnv({ ...base, SESSION_SECRET: 'qisqa', FRONTEND_URL: 'not-a-url' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('FRONTEND_URL');
  });
});
