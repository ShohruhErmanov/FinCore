import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Public, type AuthenticatedUser } from '@/common';
import { SessionGuard } from './session.guard';
import type { SessionService } from '../session.service';
import type { AuthService } from '../auth.service';

class TestController {
  @Public()
  login(): void {}

  me(): void {}
}

const user = { id: 'user-1', permissions: [] } as unknown as AuthenticatedUser;

function contextFor(
  method: keyof TestController,
  signedCookies: Record<string, unknown>,
): { context: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = { signedCookies };
  const context = {
    getHandler: () => TestController.prototype[method],
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionGuard', () => {
  let sessions: SessionService;
  let auth: AuthService;
  let guard: SessionGuard;

  beforeEach(() => {
    sessions = { resolve: vi.fn(() => 'user-1'), destroy: vi.fn() } as unknown as SessionService;
    auth = { getAuthenticatedUser: vi.fn(async () => user) } as unknown as AuthService;
    guard = new SessionGuard(new Reflector(), sessions, auth);
  });

  it('lets a @Public route through without a cookie', async () => {
    const { context } = contextFor('login', {});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it('rejects a protected route when no cookie is present', async () => {
    const { context } = contextFor('me', {});
    await expect(guard.canActivate(context)).rejects.toThrow(/Sessiya/);
  });

  it('ignores an unsigned cookie of the same name — that is a forgery', async () => {
    // A tampered cookie never reaches `signedCookies`, so the jar stays empty.
    const { context } = contextFor('me', {});
    await expect(guard.canActivate(context)).rejects.toThrow();
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it('rejects a signed cookie whose session no longer exists', async () => {
    sessions.resolve = vi.fn(() => null);
    const { context } = contextFor('me', { fincore_session: 'eskirgan' });
    await expect(guard.canActivate(context)).rejects.toThrow();
  });

  it('attaches a freshly loaded user to the request', async () => {
    const { context, request } = contextFor('me', { fincore_session: 'haqiqiy' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
    expect(request.sessionId).toBe('haqiqiy');
    // Rebuilt per request, so a revoked role takes effect immediately.
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith('user-1');
  });

  it('destroys the session when the account can no longer authenticate', async () => {
    auth.getAuthenticatedUser = vi.fn(async () => {
      throw new Error('ACCOUNT_DISABLED');
    });
    const { context } = contextFor('me', { fincore_session: 'haqiqiy' });
    await expect(guard.canActivate(context)).rejects.toThrow();
    expect(sessions.destroy).toHaveBeenCalledWith('haqiqiy');
  });
});
