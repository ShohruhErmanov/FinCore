import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@/config';
import { CsrfGuard } from './csrf.guard';

const guard = new CsrfGuard({ FRONTEND_URL: 'https://app.fincore.uz' } as AppEnv);

function context(input: {
  method: string;
  origin?: string;
  referer?: string;
  hasSession?: boolean;
}): ExecutionContext {
  const headers: Record<string, string | undefined> = {
    origin: input.origin,
    referer: input.referer,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: input.method,
        get: (name: string) => headers[name.toLowerCase()],
        signedCookies: input.hasSession ? { fincore_session: 'opaque-session-id' } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function expectDenied(action: () => unknown): void {
  try {
    action();
    expect.unreachable('guard should have rejected the request');
  } catch (error) {
    const exception = error as { getStatus(): number; getResponse(): { code: string } };
    expect(exception.getStatus()).toBe(403);
    expect(exception.getResponse().code).toBe('CSRF_ORIGIN_DENIED');
  }
}

describe('CsrfGuard', () => {
  it('allows safe reads without source metadata', () => {
    expect(guard.canActivate(context({ method: 'GET', hasSession: true }))).toBe(true);
  });

  it('allows an unsafe browser request from the configured frontend origin', () => {
    expect(
      guard.canActivate(
        context({ method: 'POST', origin: 'https://app.fincore.uz', hasSession: true }),
      ),
    ).toBe(true);
  });

  it('accepts a same-origin Referer when Origin is unavailable', () => {
    expect(
      guard.canActivate(
        context({
          method: 'PATCH',
          referer: 'https://app.fincore.uz/users/123',
          hasSession: true,
        }),
      ),
    ).toBe(true);
  });

  it('rejects a foreign browser origin', () => {
    expectDenied(() =>
      guard.canActivate(
        context({ method: 'POST', origin: 'https://attacker.example', hasSession: true }),
      ),
    );
  });

  it('rejects opaque or malformed origins', () => {
    expectDenied(() =>
      guard.canActivate(context({ method: 'POST', origin: 'null', hasSession: true })),
    );
  });

  it('rejects an unsafe cookie-authenticated request with no browser source', () => {
    expectDenied(() => guard.canActivate(context({ method: 'DELETE', hasSession: true })));
  });

  it('allows a sessionless server-to-server request without browser source metadata', () => {
    expect(guard.canActivate(context({ method: 'POST' }))).toBe(true);
  });
});
