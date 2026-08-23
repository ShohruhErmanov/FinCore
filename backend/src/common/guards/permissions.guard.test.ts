import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

// Real decorators on a real class, so the test exercises the metadata path the
// framework actually uses rather than a hand-built stub.
class TestController {
  @RequirePermissions('expense.create')
  createExpense(): void {}

  @RequirePermissions('expense.create', 'expense.edit')
  editExpense(): void {}

  open(): void {}
}

function contextFor(method: keyof TestController, permissions: string[] | null): ExecutionContext {
  const user = permissions === null ? undefined : ({ permissions } as AuthenticatedUser);
  return {
    getHandler: () => TestController.prototype[method],
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('lets an undecorated route through', () => {
    expect(guard.canActivate(contextFor('open', []))).toBe(true);
  });

  it('allows a user holding the required permission', () => {
    expect(guard.canActivate(contextFor('createExpense', ['expense.create']))).toBe(true);
  });

  it('requires every listed permission, not just one', () => {
    expect(() => guard.canActivate(contextFor('editExpense', ['expense.create']))).toThrow();
    expect(guard.canActivate(contextFor('editExpense', ['expense.create', 'expense.edit']))).toBe(true);
  });

  it('names the missing permissions in the error details', () => {
    try {
      guard.canActivate(contextFor('editExpense', ['expense.create']));
      expect.unreachable('guard should have thrown');
    } catch (error) {
      const body = (error as { getResponse(): { code: string; details: { missingPermissions: string[] } } }).getResponse();
      expect(body.code).toBe('FORBIDDEN');
      expect(body.details.missingPermissions).toEqual(['expense.edit']);
    }
  });

  it('rejects with 403, not 401, when the request has no user', () => {
    try {
      guard.canActivate(contextFor('createExpense', null));
      expect.unreachable('guard should have thrown');
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(403);
    }
  });
});
