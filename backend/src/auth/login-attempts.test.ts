import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@/database';
import { AuthService } from './auth.service';
import { LOGIN_FAILURE_WINDOW_MS, LoginAttempts, MAX_LOGIN_FAILURES } from './login-attempts';
import { hashPassword } from './password';

const LOCKED = { code: 'LOGIN_TEMPORARILY_LOCKED', status: 429 };

describe('LoginAttempts', () => {
  it('pauses a login after too many failures inside the window', () => {
    const attempts = new LoginAttempts();
    const now = 1_000_000;
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) attempts.recordFailure('+998901112233', now);
    expect(() => attempts.assertAllowed('+998901112233', now)).not.toThrow();

    attempts.recordFailure('+998901112233', now);
    expect(() => attempts.assertAllowed('+998901112233', now)).toThrowError(
      expect.objectContaining(LOCKED),
    );
    // Another login is unaffected.
    expect(() => attempts.assertAllowed('+998900000000', now)).not.toThrow();
  });

  it('lifts the pause once the failures leave the window', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) attempts.recordFailure('x', 0);
    expect(() => attempts.assertAllowed('x', LOGIN_FAILURE_WINDOW_MS - 1)).toThrow();
    expect(() => attempts.assertAllowed('x', LOGIN_FAILURE_WINDOW_MS)).not.toThrow();
  });

  it('clears the count on a correct password', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) attempts.recordFailure('x', 0);
    attempts.reset('x');
    expect(() => attempts.assertAllowed('x', 0)).not.toThrow();
  });
});

describe('AuthService.authenticate with the per-account brake', () => {
  async function service(known: boolean) {
    const passwordHash = await hashPassword('togri-parol-2026!');
    const findFirst = vi
      .fn()
      .mockResolvedValue(
        known ? { id: 'user-1', password_hash: passwordHash, status: 'active' } : null,
      );
    const prisma = {
      db: { users: { findFirst, update: vi.fn().mockResolvedValue({}) } },
    } as unknown as PrismaService;
    const attempts = new LoginAttempts();
    const auth = new AuthService(prisma, attempts);
    vi.spyOn(auth, 'getAuthenticatedUser').mockResolvedValue({ id: 'user-1' } as never);
    return { auth, findFirst };
  }

  it('locks a known login after repeated wrong passwords, even with the right one', async () => {
    const { auth, findFirst } = await service(true);
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++)
      await expect(auth.authenticate('+998 90 111 22 33', 'notogri-parol')).rejects.toMatchObject({
        status: 401,
      });

    findFirst.mockClear();
    await expect(auth.authenticate('+998901112233', 'togri-parol-2026!')).rejects.toMatchObject(
      LOCKED,
    );
    // Refused before the database or bcrypt is touched.
    expect(findFirst).not.toHaveBeenCalled();
  }, 30_000);

  it('locks an unknown login the same way, so the pause reveals nothing', async () => {
    const { auth } = await service(false);
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++)
      await expect(auth.authenticate('+998999999999', 'x')).rejects.toMatchObject({ status: 401 });
    await expect(auth.authenticate('+998999999999', 'x')).rejects.toMatchObject(LOCKED);
  }, 30_000);
});
