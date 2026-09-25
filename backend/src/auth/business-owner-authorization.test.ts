import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { AdminController } from '@/admin/admin.controller';
import { AuditController } from '@/audit/audit.controller';
import { BudgetController } from '@/budget/budget.controller';
import { DailyRevenuesController } from '@/daily-revenues/daily-revenues.controller';
import { DailyRevenuesService } from '@/daily-revenues/daily-revenues.service';
import { ExpensesController } from '@/expenses/expenses.controller';
import { InvestorPayoutsController } from '@/investors/investor-payouts.controller';
import { InvestorsController } from '@/investors/investors.controller';
import { MasterDataController } from '@/master-data/master-data.controller';
import { ReportsController } from '@/reports/reports.controller';

const OWNER_PERMISSIONS = [
  'dashboard.view',
  'expense.view_own_branch',
  'expense.view_all_branches',
  'budget.view',
  'revenue.view_own_branch',
  'revenue.view_all_branches',
  'reports.view',
  'investor.view_all',
  'audit.view',
];

function owner(): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-0000000000b0',
    fullName: 'Biznes egasi',
    phone: '+998900000000',
    status: 'active',
    roles: [
      {
        id: 'owner-role',
        role: 'business_owner',
        roleName: 'Biznes egasi',
        branchId: null,
        branchName: null,
      },
    ],
    permissions: OWNER_PERMISSIONS,
    branchScopes: ['00000000-0000-4000-8000-000000000001'],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

function canReach(controller: new (...args: never[]) => object, method: string): boolean {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') throw new Error(`${controller.name}.${method} yo‘q`);
  const actor = owner();
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
  } as unknown as ExecutionContext;

  try {
    return new PermissionsGuard(new Reflector()).canActivate(context);
  } catch {
    return false;
  }
}

describe('Business Owner real endpoint authorization', () => {
  it('opens the executive dashboard, analytics and reports', () => {
    expect(canReach(ReportsController, 'getDashboard')).toBe(true);
    expect(canReach(ReportsController, 'getExpensePlan')).toBe(true);
    expect(canReach(ReportsController, 'getExpenseAnalytics')).toBe(true);
    expect(canReach(ReportsController, 'getMonthly')).toBe(true);
    expect(canReach(ReportsController, 'getBranchComparison')).toBe(true);
  });

  it('opens revenue, expense and budget reads', () => {
    // Revenue read is service-enforced because own/all is an OR rule; the
    // owner holds both read permissions and all active branch scopes.
    expect(canReach(DailyRevenuesController, 'list')).toBe(true);
    expect(canReach(DailyRevenuesController, 'detail')).toBe(true);
    expect(canReach(ExpensesController, 'list')).toBe(true);
    expect(canReach(ExpensesController, 'detail')).toBe(true);
    expect(canReach(BudgetController, 'history')).toBe(true);
    expect(canReach(BudgetController, 'get')).toBe(true);
  });

  it('opens investor reads, payout queue, branches and redacted audit', () => {
    // Investor list/detail are also service-enforced OR rules; view_all is in
    // OWNER_PERMISSIONS and is asserted exactly by migration 020.
    expect(canReach(InvestorsController, 'list')).toBe(true);
    expect(canReach(InvestorsController, 'dashboard')).toBe(true);
    expect(canReach(InvestorPayoutsController, 'queue')).toBe(true);
    expect(canReach(MasterDataController, 'branches')).toBe(true);
    expect(canReach(AuditController, 'list')).toBe(true);
  });

  it('blocks every transactional and administrative mutation', () => {
    for (const [controller, method] of [
      [DailyRevenuesController, 'create'],
      [ExpensesController, 'create'],
      [ExpensesController, 'update'],
      [BudgetController, 'saveLines'],
      [InvestorsController, 'create'],
      [InvestorsController, 'update'],
      [InvestorsController, 'setEntitlement'],
      [InvestorsController, 'recordPayment'],
      [InvestorPayoutsController, 'create'],
      [InvestorPayoutsController, 'decide'],
      [InvestorPayoutsController, 'pay'],
      [AdminController, 'create'],
      [AdminController, 'updateStatus'],
      [AdminController, 'deleteUser'],
      [AdminController, 'replacePermissions'],
      [MasterDataController, 'createMaster'],
      [MasterDataController, 'updateMaster'],
    ] as const)
      expect(canReach(controller, method)).toBe(false);
  });

  it('blocks the service-enforced revenue update rule too', async () => {
    const service = new DailyRevenuesService({} as never, {} as never);

    await expect(service.update(owner(), 'revenue-id', {} as never)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
