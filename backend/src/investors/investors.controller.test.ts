import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { InvestorsController } from './investors.controller';
import type { InvestorsService } from './investors.service';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const PROFILE_ID = '00000000-0000-4000-8000-0000000000a1';

function user(permissions: string[]): AuthenticatedUser {
  return {
    id: ACTOR_ID,
    fullName: 'Test',
    phone: '+998900000000',
    status: 'active',
    roles: [],
    permissions,
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  } as AuthenticatedUser;
}

function contextFor(actor: AuthenticatedUser, handler: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => InvestorsController,
    switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
  } as unknown as ExecutionContext;
}

const guard = () => new PermissionsGuard(new Reflector());

describe('GET /investors/me permission', () => {
  const handler = InvestorsController.prototype.mine;

  it('lets an investor holding investor.view_own through to their own profile', async () => {
    const service = { mine: vi.fn().mockResolvedValue({ id: PROFILE_ID }) } as unknown as InvestorsService;
    const controller = new InvestorsController(service);
    const actor = user(['investor.view_own']);

    expect(guard().canActivate(contextFor(actor, handler))).toBe(true);
    await controller.mine(actor);
    // The caller is the only input: no id comes from the request.
    expect(service.mine).toHaveBeenCalledWith(actor);
  });

  it('denies a caller without investor.view_own before the service runs', () => {
    const service = { mine: vi.fn() } as unknown as InvestorsService;
    new InvestorsController(service);

    expect(() => guard().canActivate(contextFor(user([]), handler))).toThrowError();
    expect(service.mine).not.toHaveBeenCalled();
  });

  it.each([
    ['Director (view_all + manage, no view_own)', ['investor.view_all', 'investor.manage']],
    ['Finance Manager', ['expense.view_all_branches', 'budget.create_edit']],
    ['Cashier', ['expense.create', 'revenue.create']],
  ])('denies %s — /me is the investor’s own endpoint', (_label, permissions) => {
    expect(() => guard().canActivate(contextFor(user(permissions), handler))).toThrowError();
  });

  it('reports the missing permission by name', () => {
    try {
      guard().canActivate(contextFor(user([]), handler));
      throw new Error('guard should have thrown');
    } catch (error) {
      expect(JSON.stringify(error)).toContain('investor.view_own');
    }
  });
});

describe('investor endpoint permission matrix', () => {
  const cases: Array<[string, unknown, string]> = [
    ['POST /investors', InvestorsController.prototype.create, 'investor.manage'],
    ['PATCH /investors/:id', InvestorsController.prototype.update, 'investor.manage'],
    ['PUT /investors/:id/entitlements', InvestorsController.prototype.setEntitlement, 'investor.manage'],
    ['POST /investors/:id/payments', InvestorsController.prototype.recordPayment, 'investor.manage'],
    ['POST /investors/:id/payments/:paymentId/reverse', InvestorsController.prototype.reversePayment, 'investor.manage'],
  ];

  it.each(cases)('%s requires %s', (_label, handler, required) => {
    expect(guard().canActivate(contextFor(user([required]), handler))).toBe(true);
    expect(() => guard().canActivate(contextFor(user(['investor.view_own']), handler))).toThrowError();
  });

  it('leaves GET /investors and GET /investors/:id to the service (OR-shaped rules)', () => {
    // No decorator: the guard must not block, because the rule is either
    // view_all, or view_own for the caller's own id — which only the service
    // can evaluate.
    expect(guard().canActivate(contextFor(user([]), InvestorsController.prototype.list))).toBe(true);
    expect(guard().canActivate(contextFor(user([]), InvestorsController.prototype.dashboard))).toBe(true);
  });
});
