import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { PrismaService } from '@/database';
import { DashboardService } from './dashboard.service';
import type { ReportsService } from './reports.service';

const PERIOD_ID = '00000000-0000-4000-8000-000000000010';
const BRANCH_ID = '00000000-0000-4000-8000-000000000020';

const user: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [
    {
      id: 'role-director',
      role: 'director',
      roleName: 'Direktor',
      branchId: null,
      branchName: null,
    },
  ],
  permissions: ['dashboard.view'],
  branchScopes: [BRANCH_ID],
  writeBranchScopes: [BRANCH_ID],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

function setup(annualRows: unknown[]) {
  const prisma = {
    db: {
      accounting_periods: {
        findUnique: vi.fn().mockResolvedValue({
          id: PERIOD_ID,
          year: 2026,
          month: 8,
          status: 'open',
          closed_at: null,
          closed_by: null,
        }),
      },
      branches: {
        findMany: vi.fn().mockResolvedValue([{ id: BRANCH_ID, name: 'Sayxun' }]),
      },
    },
  } as unknown as PrismaService;
  const reports = {
    scopeBranchIds: vi.fn().mockReturnValue([BRANCH_ID]),
    annualMonths: vi.fn().mockResolvedValue(annualRows),
  } as unknown as ReportsService;
  const service = new DashboardService(prisma, reports);
  const internal = service as unknown as {
    expenseTotals: () => Promise<{ planned: bigint; actual: bigint }>;
    revenueTotals: () => Promise<{ planned: bigint; actual: bigint }>;
    expenseByType: () => Promise<{ fixed: bigint; variable: bigint }>;
    perBranchTotals: () => Promise<Map<string, unknown>>;
    buildTrends: () => Promise<{ expense: []; revenue: [] }>;
    revenueBetween: () => Promise<{ current: bigint; previous: bigint }>;
    monthlyRevenue: () => Promise<{
      byMonth: Map<number, { actual: bigint; planned: bigint }>;
      previousYearTotal: bigint;
    }>;
    annualNetProfitByPaymentMethod: () => Promise<
      Array<{
        paymentMethodId: string;
        code: string;
        name: string;
        sortOrder: number;
        month: number;
        revenue: bigint;
        expense: bigint;
      }>
    >;
  };

  vi.spyOn(internal, 'expenseTotals').mockResolvedValue({ planned: 0n, actual: 0n });
  vi.spyOn(internal, 'revenueTotals').mockResolvedValue({ planned: 0n, actual: 0n });
  vi.spyOn(internal, 'expenseByType').mockResolvedValue({ fixed: 0n, variable: 0n });
  vi.spyOn(internal, 'perBranchTotals').mockResolvedValue(new Map());
  vi.spyOn(internal, 'buildTrends').mockResolvedValue({ expense: [], revenue: [] });
  vi.spyOn(internal, 'revenueBetween').mockResolvedValue({ current: 0n, previous: 0n });
  vi.spyOn(internal, 'monthlyRevenue').mockResolvedValue({
    byMonth: new Map(),
    previousYearTotal: 0n,
  });
  const profitQuery = vi.spyOn(internal, 'annualNetProfitByPaymentMethod').mockResolvedValue(
    annualRows.map((row) => {
      const value = row as { month: number; actual_uzs: bigint };
      return {
        paymentMethodId: '00000000-0000-4000-8000-000000000030',
        code: 'CASH',
        name: 'Naqd pul',
        sortOrder: 1,
        month: value.month,
        revenue: 0n,
        expense: value.actual_uzs,
      };
    }),
  );

  return { service, profitQuery };
}

describe('DashboardService annual Excel Xulosa metrics', () => {
  it('positive reja mavjud oylar bo‘yicha o‘rtacha rejani serverda hisoblaydi', async () => {
    const { service } = setup([
      { month: 1, expense_type: 'fixed', actual_uzs: 80n, planned_amount_uzs: 100n },
      { month: 1, expense_type: 'variable', actual_uzs: 20n, planned_amount_uzs: 200n },
      { month: 2, expense_type: 'fixed', actual_uzs: 50n, planned_amount_uzs: 0n },
      { month: 3, expense_type: 'fixed', actual_uzs: 10n, planned_amount_uzs: 300n },
    ]);

    const result = await service.get(user, PERIOD_ID, BRANCH_ID, 'monthly');

    expect(result.annual).toMatchObject({
      totalPlanUzs: '600',
      averagePlannedMonthlyUzs: '300',
      averagePlanMonthsCount: 2,
    });
    expect(result.annualNetProfit!.paymentMethods[0]).toMatchObject({
      code: 'CASH',
      revenueUzs: '0',
      expenseUzs: '160',
      netProfitUzs: '-160',
      sharePct: 100,
    });
    expect(result.annualNetProfit!.paymentMethodMonths).toHaveLength(12);
  });

  it('reja kiritilgan oy bo‘lmasa nol va zero denominator qaytaradi', async () => {
    const { service } = setup([
      { month: 1, expense_type: 'fixed', actual_uzs: 10n, planned_amount_uzs: 0n },
    ]);

    const result = await service.get(user, PERIOD_ID, BRANCH_ID, 'monthly');

    expect(result.annual).toMatchObject({
      averagePlannedMonthlyUzs: '0',
      averagePlanMonthsCount: 0,
    });
  });
});

describe('DashboardService — company net-profit access', () => {
  const withRoles = (...roles: string[]): AuthenticatedUser => ({
    ...user,
    roles: roles.map((role, index) => ({
      id: `role-${index}`,
      role,
      roleName: role,
      branchId: role === 'cashier' ? BRANCH_ID : null,
      branchName: role === 'cashier' ? 'Sayxun' : null,
    })),
  });

  it('omits every net-profit aggregate for a pure Cashier and skips the profit query', async () => {
    const { service, profitQuery } = setup([]);

    const result = await service.get(withRoles('cashier'), PERIOD_ID, BRANCH_ID, 'monthly');
    const wire = JSON.stringify(result);

    expect(result).not.toHaveProperty('annualNetProfit');
    expect(profitQuery).not.toHaveBeenCalled();
    expect(wire).not.toMatch(
      /netProfit|net_profit|profitMargin|profitPercentage|cashNetProfit|cardNetProfit|bankNetProfit/i,
    );
  });

  it.each([
    ['Director', ['director']],
    ['Business Owner', ['business_owner']],
    ['Finance Manager', ['finance_manager']],
    ['Finance Manager + Cashier', ['finance_manager', 'cashier']],
  ])('keeps %s access unchanged', async (_label, roles) => {
    const { service, profitQuery } = setup([]);

    const result = await service.get(withRoles(...roles), PERIOD_ID, BRANCH_ID, 'monthly');

    expect(result.annualNetProfit).toBeDefined();
    expect(profitQuery).toHaveBeenCalledOnce();
  });
});

describe('DashboardService annual payment-method source', () => {
  it('loads the full year in one aggregate query and keeps BigInt values exact', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        payment_method_id: '00000000-0000-4000-8000-000000000030',
        code: 'CASH',
        name: 'Naqd pul',
        sort_order: 1,
        month: 8,
        revenue_uzs: 9_007_199_254_740_993n,
        expense_uzs: 1n,
      },
    ]);
    const prisma = { db: { $queryRaw: queryRaw } } as unknown as PrismaService;
    const service = new DashboardService(prisma, {} as ReportsService);

    const result = await (
      service as unknown as {
        annualNetProfitByPaymentMethod: (
          year: number,
          branchIds: string[],
        ) => Promise<Array<{ month: number; revenue: bigint; expense: bigint; code: string }>>;
      }
    ).annualNetProfitByPaymentMethod(2026, [BRANCH_ID]);

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(result).toEqual([
      expect.objectContaining({
        month: 8,
        code: 'CASH',
        revenue: 9_007_199_254_740_993n,
        expense: 1n,
      }),
    ]);
  });
});
