import type { CookieOptions } from 'express';
import type { AppEnv } from '@/config';

export const SESSION_COOKIE = 'fincore_session';

/**
 * httpOnly keeps the identifier away from JavaScript (so XSS cannot steal it),
 * signed makes tampering detectable, and `sameSite: none` is required whenever
 * the SPA is served from a different origin than the API — which browsers only
 * allow together with `secure`.
 */
export function sessionCookieOptions(env: AppEnv, maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    signed: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}
