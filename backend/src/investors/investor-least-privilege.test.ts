import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import type { AuthenticatedUser } from '@/common';
import { BudgetController } from '@/budget/budget.controller';
import { DailyRevenuesController } from '@/daily-revenues/daily-revenues.controller';
import { ExpensesController } from '@/expenses/expenses.controller';
import { CashierReportService } from '@/reports/cashier-report.service';
import { DailyRevenuesService } from '@/daily-revenues/daily-revenues.service';
import { InvestorPayoutsController } from './investor-payouts.controller';
import { InvestorsController } from './investors.controller';
import { ReportsController } from '@/reports/reports.controller';

/**
 * The investor role's capability surface, checked against the real decorators.
 *
 * PHASE 49.5 trimmed the role to least privilege. These run the actual
 * PermissionsGuard over the actual controller handlers, so a decorator that is
 * later loosened fails here rather than quietly widening what an investor can
 * open. Grepping for permission names would not catch that.
 */

/** Exactly what migration 017 leaves the role holding. */
const INVESTOR_PERMISSIONS = ['investor.view_own', 'investor.settlement.request'];

const DIRECTOR_PERMISSIONS = [
  'dashboard.view',
  'investor.view_all',
  'investor.manage',
  'investor.settlement.approve',
  'investor.settlement.pay',
  'revenue.view_all_branches',
  'revenue.view_own_branch',
  'reports.view',
  'expense.view_all_branches',
  'budget.view',
];

function user(permissions: string[]): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    fullName: 'Sinov',
    phone: '+998901112233',
    status: 'active',
    roles: [],
    permissions,
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  };
}

/** Runs the real guard against a real controller method. */
function canReach(
  controller: new (...args: never[]) => object,
  method: string,
  permissions: string[],
): boolean {
  const guard = new PermissionsGuard(new Reflector());
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') throw new Error(`${controller.name}.${method} yo‘q`);

  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: user(permissions) }) }),
  } as unknown as ExecutionContext;

  try {
    return guard.canActivate(context);
  } catch {
    return false;
  }
}

const asInvestor = (controller: new (...args: never[]) => object, method: string) =>
  canReach(controller, method, INVESTOR_PERMISSIONS);
const asDirector = (controller: new (...args: never[]) => object, method: string) =>
  canReach(controller, method, DIRECTOR_PERMISSIONS);

describe('Investor least privilege — what the role may open', () => {
  it('reaches its own investor profile', () => {
    expect(asInvestor(InvestorsController, 'mine')).toBe(true);
  });

  it('reaches its own share, monthly and annual alike', () => {
    // One endpoint serves both periods, so this covers the annual view too.
    expect(asInvestor(InvestorPayoutsController, 'mine')).toBe(true);
  });

  it('may raise and withdraw a payout request', () => {
    expect(asInvestor(InvestorPayoutsController, 'create')).toBe(true);
    expect(asInvestor(InvestorPayoutsController, 'cancel')).toBe(true);
  });
});

describe('Investor least privilege — what the role may not open', () => {
  it('cannot open the dashboard', () => {
    expect(asInvestor(ReportsController, 'getDashboard')).toBe(false);
  });

  it('cannot open expense analytics or the expense plan', () => {
    expect(asInvestor(ReportsController, 'getExpensePlan')).toBe(false);
    expect(asInvestor(ReportsController, 'getExpenseAnalytics')).toBe(false);
  });

  it('cannot open the expense ledger', () => {
    expect(asInvestor(ExpensesController, 'list')).toBe(false);
  });

  it('cannot open budgets', () => {
    expect(asInvestor(BudgetController, 'history')).toBe(false);
  });

  it('cannot decide or pay a payout — not even their own', () => {
    expect(asInvestor(InvestorPayoutsController, 'decide')).toBe(false);
    expect(asInvestor(InvestorPayoutsController, 'pay')).toBe(false);
    expect(asInvestor(InvestorPayoutsController, 'queue')).toBe(false);
  });
});

/**
 * The revenue ledger and the cashier report carry no @RequirePermissions: their
 * rules are OR-shaped, so the services enforce them. Testing only the guard
 * would claim a block that the guard does not provide.
 */
describe('Investor least privilege — the service-enforced screens', () => {
  /** Nothing is queried: the permission check runs before any database work. */
  const dailyRevenues = () =>
    new DailyRevenuesService({} as never, {} as never);

  it('refuses an investor the daily revenue ledger', async () => {
    await expect(
      dailyRevenues().list(user(INVESTOR_PERMISSIONS), {} as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an investor a single revenue transaction', async () => {
    await expect(
      dailyRevenues().detail(user(INVESTOR_PERMISSIONS), 'any-id'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('still lets a cashier read their own branch', async () => {
    // The trim must not have narrowed the rule itself, only the investor grant.
    await expect(
      dailyRevenues().list(user(['revenue.view_own_branch']), {} as never),
    ).rejects.not.toMatchObject({ status: 403 });
  });

  it('refuses an investor the cashier performance report', async () => {
    const service = new CashierReportService({} as never);
    await expect(
      service.get(user(INVESTOR_PERMISSIONS), 'period-1', undefined),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('Investor least privilege — the director is untouched', () => {
  it('still reaches the dashboard and the expense screens', () => {
    expect(asDirector(ReportsController, 'getDashboard')).toBe(true);
    expect(asDirector(ReportsController, 'getExpensePlan')).toBe(true);
    expect(asDirector(ReportsController, 'getExpenseAnalytics')).toBe(true);
  });

  it('still reaches the daily revenue ledger', () => {
    expect(asDirector(DailyRevenuesController, 'list')).toBe(true);
  });

  it('still decides and pays payouts', () => {
    expect(asDirector(InvestorPayoutsController, 'decide')).toBe(true);
    expect(asDirector(InvestorPayoutsController, 'pay')).toBe(true);
    expect(asDirector(InvestorPayoutsController, 'queue')).toBe(true);
  });
});
