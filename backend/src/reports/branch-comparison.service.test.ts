import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { PrismaService } from '@/database';
import { ReportsService } from './reports.service';

const SAYXUN = '00000000-0000-4000-8000-000000000020';
const XALQLAR = '00000000-0000-4000-8000-000000000021';

const director: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000010',
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [],
  permissions: ['reports.view'],
  branchScopes: [SAYXUN, XALQLAR],
  writeBranchScopes: [SAYXUN, XALQLAR],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

describe('ReportsService — Filiallar taqqoslash', () => {
  it('har bir filialning oylik/yillik fakt va rejasini hamda markaz jamini serverda hisoblaydi', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          year: 2026,
          month: 8,
          branch_id: SAYXUN,
          branch_name: 'Sayxun',
          actual_uzs: 37_986_500n,
          planned_amount_uzs: 14_400_000n,
        },
        {
          year: 2026,
          month: 8,
          branch_id: XALQLAR,
          branch_name: 'Xalqlar do‘stligi',
          actual_uzs: 22_371_400n,
          planned_amount_uzs: 40_000_000n,
        },
      ])
      .mockResolvedValueOnce([
        {
          year: 2026,
          month: 8,
          branch_id: SAYXUN,
          branch_name: 'Sayxun',
          category_id: 'cat-rent',
          category_name: 'Ijara',
          expense_type: 'fixed',
          actual_uzs: 7_100_000n,
          planned_amount_uzs: 7_200_000n,
          has_plan: true,
        },
        {
          year: 2026,
          month: 8,
          branch_id: XALQLAR,
          branch_name: 'Xalqlar do‘stligi',
          category_id: 'cat-rent',
          category_name: 'Ijara',
          expense_type: 'fixed',
          actual_uzs: 16_680_000n,
          planned_amount_uzs: 20_000_000n,
          has_plan: true,
        },
        {
          year: 2026,
          month: 8,
          branch_id: SAYXUN,
          branch_name: 'Sayxun',
          category_id: 'cat-other',
          category_name: 'Boshqa',
          expense_type: 'variable',
          actual_uzs: 30_886_500n,
          planned_amount_uzs: 7_200_000n,
          has_plan: true,
        },
        {
          year: 2026,
          month: 8,
          branch_id: XALQLAR,
          branch_name: 'Xalqlar do‘stligi',
          category_id: 'cat-other',
          category_name: 'Boshqa',
          expense_type: 'variable',
          actual_uzs: 5_691_400n,
          planned_amount_uzs: 20_000_000n,
          has_plan: true,
        },
      ]);
    const findMany = vi.fn().mockResolvedValue([
      { id: SAYXUN, code: 'SAYXUN', name: 'Sayxun' },
      { id: XALQLAR, code: 'XALQLAR', name: 'Xalqlar do‘stligi' },
    ]);
    const findCategories = vi.fn().mockResolvedValue([
      { id: 'cat-rent', code: 'RENT', name: 'Ijara', expense_type: 'fixed', sort_order: 1 },
      { id: 'cat-other', code: 'OTHER', name: 'Boshqa', expense_type: 'variable', sort_order: 2 },
    ]);
    const prisma = {
      db: {
        $queryRaw: queryRaw,
        branches: { findMany },
        expense_categories: { findMany: findCategories },
      },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).branchComparison(director, 2026, 8);

    expect(result.months).toHaveLength(12);
    expect(result.months[7]?.branches).toMatchObject([
      {
        branch: { id: SAYXUN, name: 'Sayxun' },
        expense: {
          plannedAmountUzs: '14400000',
          actualAmountUzs: '37986500',
          varianceUzs: '-23586500',
          completionPercent: 263.8,
        },
      },
      {
        branch: { id: XALQLAR, name: 'Xalqlar do‘stligi' },
        expense: {
          plannedAmountUzs: '40000000',
          actualAmountUzs: '22371400',
          varianceUzs: '17628600',
          completionPercent: 55.93,
        },
      },
    ]);
    expect(result.months[7]?.total.expense).toMatchObject({
      plannedAmountUzs: '54400000',
      actualAmountUzs: '60357900',
      varianceUzs: '-5957900',
      completionPercent: 110.95,
    });
    expect(result.annual).toMatchObject({
      branches: [
        {
          branch: { id: SAYXUN },
          expense: { plannedAmountUzs: '14400000', actualAmountUzs: '37986500' },
        },
        {
          branch: { id: XALQLAR },
          expense: { plannedAmountUzs: '40000000', actualAmountUzs: '22371400' },
        },
      ],
      total: { expense: { plannedAmountUzs: '54400000', actualAmountUzs: '60357900' } },
    });
    expect(result.selectedMonth).toMatchObject({
      month: 8,
      label: 'Avgust',
      rows: [
        {
          category: { id: 'cat-rent', expenseTypeSnapshot: 'fixed' },
          branches: [
            {
              expense: {
                plannedAmountUzs: '7200000',
                actualAmountUzs: '7100000',
                varianceUzs: '100000',
              },
            },
            {
              expense: {
                plannedAmountUzs: '20000000',
                actualAmountUzs: '16680000',
                varianceUzs: '3320000',
              },
            },
          ],
          total: { expense: { plannedAmountUzs: '27200000', actualAmountUzs: '23780000' } },
        },
        { category: { id: 'cat-other', expenseTypeSnapshot: 'variable' } },
      ],
      branches: [
        {
          branch: { id: SAYXUN },
          expense: { plannedAmountUzs: '14400000', actualAmountUzs: '37986500' },
        },
        {
          branch: { id: XALQLAR },
          expense: { plannedAmountUzs: '40000000', actualAmountUzs: '22371400' },
        },
      ],
      total: {
        expense: {
          plannedAmountUzs: '54400000',
          actualAmountUzs: '60357900',
          completionPercent: 110.95,
        },
      },
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [SAYXUN, XALQLAR] } } }),
    );
    expect(findCategories).toHaveBeenCalledOnce();
  });

  it('o‘qish scope’i bo‘lmasa hech qanday moliyaviy query bajarmaydi', async () => {
    const queryRaw = vi.fn();
    const findMany = vi.fn();
    const prisma = {
      db: { $queryRaw: queryRaw, branches: { findMany } },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).branchComparison(
      { ...director, branchScopes: [] },
      2026,
    );

    expect(result.months).toEqual([]);
    expect(result.annual.branches).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('navbar orqali tanlangan ruxsatsiz filial uchun moliyaviy query bajarmaydi', async () => {
    const queryRaw = vi.fn();
    const findMany = vi.fn();
    const prisma = {
      db: { $queryRaw: queryRaw, branches: { findMany } },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).branchComparison(
      director,
      2026,
      8,
      '00000000-0000-4000-8000-000000000099',
    );

    expect(result.selectedMonth.branches).toEqual([]);
    expect(result.months).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('navbar orqali tanlangan ruxsatli filialni hisobot scope’iga qo‘llaydi', async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const findMany = vi.fn().mockResolvedValue([{ id: SAYXUN, code: 'SAYXUN', name: 'Sayxun' }]);
    const findCategories = vi.fn().mockResolvedValue([]);
    const prisma = {
      db: {
        $queryRaw: queryRaw,
        branches: { findMany },
        expense_categories: { findMany: findCategories },
      },
    } as unknown as PrismaService;

    const result = await new ReportsService(prisma).branchComparison(director, 2026, 8, SAYXUN);

    expect(result.selectedMonth.branches.map((item) => item.branch.id)).toEqual([SAYXUN]);
    expect(result.annual.branches.map((item) => item.branch.id)).toEqual([SAYXUN]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [SAYXUN] } } }),
    );
  });
});
