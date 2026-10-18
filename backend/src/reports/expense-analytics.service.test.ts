import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { PrismaService } from '@/database';
import { ExpenseAnalyticsService } from './expense-analytics.service';
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

describe('ExpenseAnalyticsService — expense plan', () => {
  function analyticsSetup(
    branchIds: string[],
    rows: Array<{
      branch_id: string;
      branch_name: string;
      expense_type_snapshot: 'fixed' | 'variable' | null;
      planned_amount_uzs: bigint;
      line_count: number;
    }>,
  ) {
    const queryRaw = vi.fn().mockResolvedValue(rows);
    const prisma = {
      db: {
        accounting_periods: {
          findUnique: vi.fn().mockResolvedValue({ id: PERIOD_ID, year: 2026, month: 8 }),
        },
        $queryRaw: queryRaw,
      },
    } as unknown as PrismaService;
    const reports = {
      scopeBranchIds: vi.fn().mockReturnValue(branchIds),
    } as unknown as ReportsService;
    return {
      service: new ExpenseAnalyticsService(prisma, reports),
      queryRaw,
      scopeBranchIds: reports.scopeBranchIds as ReturnType<typeof vi.fn>,
    };
  }

  it('fixed/variable rejalarning filiallar va umumiy jamini BigInt aniqligida hisoblaydi', async () => {
    const branchB = '00000000-0000-4000-8000-000000000021';
    const { service, queryRaw, scopeBranchIds } = analyticsSetup(
      [BRANCH_ID, branchB],
      [
        {
          branch_id: BRANCH_ID,
          branch_name: 'Sayxun',
          expense_type_snapshot: 'fixed',
          planned_amount_uzs: 9_007_199_254_740_993n,
          line_count: 2,
        },
        {
          branch_id: BRANCH_ID,
          branch_name: 'Sayxun',
          expense_type_snapshot: 'variable',
          planned_amount_uzs: 7n,
          line_count: 1,
        },
        {
          branch_id: branchB,
          branch_name: 'Xalqlar do‘stligi',
          expense_type_snapshot: 'fixed',
          planned_amount_uzs: 10n,
          line_count: 1,
        },
        {
          branch_id: branchB,
          branch_name: 'Xalqlar do‘stligi',
          expense_type_snapshot: 'variable',
          planned_amount_uzs: 20n,
          line_count: 1,
        },
      ],
    );

    const result = await service.getExpensePlanAnalytics(user, PERIOD_ID, 'all');

    expect(scopeBranchIds).toHaveBeenCalledWith(user, 'all');
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      hasPlan: true,
      summary: {
        fixedPlanUzs: '9007199254741003',
        variablePlanUzs: '27',
        totalPlanUzs: '9007199254741030',
        branchCount: 2,
      },
    });
    expect(result.branches).toEqual([
      {
        branchId: BRANCH_ID,
        branchName: 'Sayxun',
        hasPlan: true,
        fixedPlanUzs: '9007199254740993',
        variablePlanUzs: '7',
        totalPlanUzs: '9007199254741000',
      },
      {
        branchId: branchB,
        branchName: 'Xalqlar do‘stligi',
        hasPlan: true,
        fixedPlanUzs: '10',
        variablePlanUzs: '20',
        totalPlanUzs: '30',
      },
    ]);
  });

  it('scope tashqarisidagi filial uchun query bajarmaydi va ma’lumot chiqarmaydi', async () => {
    const { service, queryRaw } = analyticsSetup([], []);

    const result = await service.getExpensePlanAnalytics(user, PERIOD_ID, 'outside-branch');

    expect(queryRaw).not.toHaveBeenCalled();
    expect(result.hasPlan).toBe(false);
    expect(result.branches).toEqual([]);
    expect(result.summary).toEqual({
      fixedPlanUzs: '0',
      variablePlanUzs: '0',
      totalPlanUzs: '0',
      branchCount: 0,
    });
  });

  it('faol filial bor, lekin applicable reja yo‘q bo‘lsa empty holatini saqlaydi', async () => {
    const { service } = analyticsSetup(
      [BRANCH_ID],
      [
        {
          branch_id: BRANCH_ID,
          branch_name: 'Sayxun',
          expense_type_snapshot: null,
          planned_amount_uzs: 0n,
          line_count: 0,
        },
      ],
    );

    const result = await service.getExpensePlanAnalytics(user, PERIOD_ID, BRANCH_ID);

    expect(result.hasPlan).toBe(false);
    expect(result.branches[0]).toMatchObject({
      branchId: BRANCH_ID,
      hasPlan: false,
      fixedPlanUzs: '0',
      variablePlanUzs: '0',
      totalPlanUzs: '0',
    });
  });
});

describe('ExpenseAnalyticsService — total expenses', () => {
  const branchB = '00000000-0000-4000-8000-000000000021';
  const cashId = '00000000-0000-4000-8000-000000000031';
  const cardId = '00000000-0000-4000-8000-000000000032';

  function expenseAnalyticsSetup(branchIds: string[]) {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          branch_id: BRANCH_ID,
          expense_type_snapshot: 'fixed',
          payment_method_id: cashId,
          amount_uzs: 9_007_199_254_740_993n,
          transaction_count: 2,
        },
        {
          branch_id: BRANCH_ID,
          expense_type_snapshot: 'variable',
          payment_method_id: cardId,
          amount_uzs: 7n,
          transaction_count: 1,
        },
        {
          branch_id: branchB,
          expense_type_snapshot: 'variable',
          payment_method_id: cashId,
          amount_uzs: 20n,
          transaction_count: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          category_id: 'cat-1',
          category_code_snapshot: 'RENT',
          category_name_snapshot: 'Ijara',
          expense_type_snapshot: 'fixed',
          amount_uzs: 9_007_199_254_740_993n,
          transaction_count: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'expense-1',
          transaction_date: '2026-08-31',
          description: 'Ijara to‘lovi',
          category_name_snapshot: 'Ijara',
          branch_name: 'Sayxun',
          amount_uzs: 9_007_199_254_740_993n,
          expense_type_snapshot: 'fixed',
          payment_method_name: 'Naqd pul',
        },
      ])
      .mockResolvedValueOnce([{ planned_amount_uzs: 10_000_000_000_000_000n, line_count: 4 }]);
    const prisma = {
      db: {
        accounting_periods: {
          findUnique: vi.fn().mockResolvedValue({ id: PERIOD_ID, year: 2026, month: 8 }),
        },
        branches: {
          findMany: vi.fn().mockResolvedValue([
            { id: BRANCH_ID, name: 'Sayxun' },
            { id: branchB, name: 'Xalqlar do‘stligi' },
          ]),
        },
        payment_methods: {
          findMany: vi.fn().mockResolvedValue([
            { id: cashId, code: 'CASH', name: 'Naqd pul', sort_order: 10, is_active: true },
            { id: cardId, code: 'CARD', name: 'Plastik karta', sort_order: 20, is_active: true },
          ]),
        },
        $queryRaw: queryRaw,
      },
    } as unknown as PrismaService;
    const reports = {
      scopeBranchIds: vi.fn().mockReturnValue(branchIds),
    } as unknown as ReportsService;
    return {
      service: new ExpenseAnalyticsService(prisma, reports),
      queryRaw,
      scopeBranchIds: reports.scopeBranchIds as ReturnType<typeof vi.fn>,
    };
  }

  it('bitta scoped query to‘plamida tur, to‘lov, filial, kategoriya va recent natijalarni hisoblaydi', async () => {
    const { service, queryRaw, scopeBranchIds } = expenseAnalyticsSetup([BRANCH_ID, branchB]);

    const result = await service.getExpenseAnalytics(
      user,
      PERIOD_ID,
      '2026-08-01',
      '2026-08-31',
      'all',
    );

    expect(scopeBranchIds).toHaveBeenCalledWith(user, 'all');
    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      hasData: true,
      planComparison: {
        periodId: PERIOD_ID,
        periodLabel: 'Avgust 2026',
        hasPlan: true,
        plannedAmountUzs: '10000000000000000',
        actualAmountUzs: '9007199254741020',
        varianceUzs: '992800745258980',
        completionPct: 90.07,
      },
      summary: {
        totalAmountUzs: '9007199254741020',
        transactionCount: 4,
        fixed: { amountUzs: '9007199254740993', transactionCount: 2 },
        variable: { amountUzs: '27', transactionCount: 2 },
      },
    });
    expect(result.paymentMethods.map(({ code, amountUzs }) => ({ code, amountUzs }))).toEqual([
      { code: 'CASH', amountUzs: '9007199254741013' },
      { code: 'CARD', amountUzs: '7' },
    ]);
    expect(result.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: BRANCH_ID,
          fixedAmountUzs: '9007199254740993',
          variableAmountUzs: '7',
          totalAmountUzs: '9007199254741000',
        }),
        expect.objectContaining({
          branchId: branchB,
          fixedAmountUzs: '0',
          variableAmountUzs: '20',
          totalAmountUzs: '20',
        }),
      ]),
    );
    expect(result.categories[0]).toMatchObject({ categoryNameSnapshot: 'Ijara' });
    expect(result.recentExpenses[0]).toMatchObject({
      id: 'expense-1',
      amountUzs: '9007199254740993',
    });
  });

  it('scope bo‘sh bo‘lsa bazaga query yubormaydi va bo‘sh analytics qaytaradi', async () => {
    const { service, queryRaw } = expenseAnalyticsSetup([]);

    const result = await service.getExpenseAnalytics(
      user,
      PERIOD_ID,
      '2026-08-01',
      '2026-08-31',
      'outside-branch',
    );

    expect(queryRaw).not.toHaveBeenCalled();
    expect(result).toMatchObject({ hasData: false, branches: [], categories: [] });
  });

  it('teskari sana oralig‘ini querydan oldin rad etadi', async () => {
    const { service, queryRaw } = expenseAnalyticsSetup([BRANCH_ID]);

    await expect(
      service.getExpenseAnalytics(user, PERIOD_ID, '2026-09-01', '2026-08-31', 'all'),
    ).rejects.toThrow('Boshlanish sanasi');
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
