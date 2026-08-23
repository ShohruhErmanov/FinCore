import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@/config';
import { sessionCookieOptions } from './session.cookie';

const dev = { COOKIE_SECURE: false } as AppEnv;
const prod = { COOKIE_SECURE: true } as AppEnv;

describe('sessionCookieOptions', () => {
  it('always hides the cookie from JavaScript and signs it', () => {
    for (const env of [dev, prod]) {
      const options = sessionCookieOptions(env, 3600);
      expect(options.httpOnly).toBe(true);
      expect(options.signed).toBe(true);
      expect(options.path).toBe('/');
    }
  });

  it('uses SameSite=None with Secure so a cross-origin SPA can hold a session', () => {
    const options = sessionCookieOptions(prod, 3600);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('none');
  });

  it('falls back to SameSite=Lax over plain http, which browsers require', () => {
    const options = sessionCookieOptions(dev, 3600);
    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe('lax');
  });

  it('converts the ttl to milliseconds', () => {
    expect(sessionCookieOptions(dev, 3600).maxAge).toBe(3_600_000);
  });

  it('omits the domain entirely when none is configured', () => {
    expect('domain' in sessionCookieOptions(dev, 60)).toBe(false);
  });

  it('sets the domain when one is configured', () => {
    const env = { COOKIE_SECURE: true, COOKIE_DOMAIN: '.fincore.uz' } as AppEnv;
    expect(sessionCookieOptions(env, 60).domain).toBe('.fincore.uz');
  });

  it('produces clear-cookie options that still match the original attributes', () => {
    const set = sessionCookieOptions(prod, 3600);
    const clear = sessionCookieOptions(prod, 0);
    // A browser ignores a clear whose attributes differ from the set.
    expect(clear.sameSite).toBe(set.sameSite);
    expect(clear.secure).toBe(set.secure);
    expect(clear.path).toBe(set.path);
    expect(clear.maxAge).toBe(0);
  });
});
