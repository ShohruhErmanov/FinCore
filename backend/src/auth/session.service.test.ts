import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '@/config';
import { SessionService } from './session.service';

const env = { SESSION_TTL_HOURS: 12 } as AppEnv;

describe('SessionService', () => {
  let sessions: SessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    sessions = new SessionService(env);
  });

  afterEach(() => {
    sessions.onModuleDestroy();
    vi.useRealTimers();
  });

  it('resolves a session it just created', () => {
    const id = sessions.create('user-1');
    expect(sessions.resolve(id)).toBe('user-1');
  });

  it('issues an unguessable identifier that does not embed the user id', () => {
    const id = sessions.create('user-1');
    expect(id).not.toContain('user-1');
    expect(id.length).toBeGreaterThanOrEqual(43); // 32 random bytes, base64url
  });

  it('never reuses an identifier across logins', () => {
    const ids = new Set(Array.from({ length: 50 }, () => sessions.create('user-1')));
    expect(ids.size).toBe(50);
  });

  it('rejects an unknown identifier', () => {
    expect(sessions.resolve('soxta-qiymat')).toBeNull();
  });

  it('expires a session once its TTL passes', () => {
    const id = sessions.create('user-1');
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 - 1000);
    expect(sessions.resolve(id)).toBe('user-1');
    vi.advanceTimersByTime(2000);
    expect(sessions.resolve(id)).toBeNull();
  });

  it('makes logout actually revoke access', () => {
    const id = sessions.create('user-1');
    sessions.destroy(id);
    expect(sessions.resolve(id)).toBeNull();
  });

  it('can revoke every session of one user without touching others', () => {
    const first = sessions.create('user-1');
    const second = sessions.create('user-1');
    const other = sessions.create('user-2');
    sessions.destroyAllForUser('user-1');
    expect(sessions.resolve(first)).toBeNull();
    expect(sessions.resolve(second)).toBeNull();
    expect(sessions.resolve(other)).toBe('user-2');
  });

  it('reports its TTL in seconds for the cookie max-age', () => {
    expect(sessions.ttlSeconds).toBe(12 * 60 * 60);
  });

  it('drops every session on shutdown', () => {
    const id = sessions.create('user-1');
    sessions.onModuleDestroy();
    expect(sessions.resolve(id)).toBeNull();
  });
});
