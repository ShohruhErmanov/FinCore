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
  roles: [],
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
  };

  vi.spyOn(internal, 'expenseTotals').mockResolvedValue({ planned: 0n, actual: 0n });
  vi.spyOn(internal, 'revenueTotals').mockResolvedValue({ planned: 0n, actual: 0n });
  vi.spyOn(internal, 'expenseByType').mockResolvedValue({ fixed: 0n, variable: 0n });
  vi.spyOn(internal, 'perBranchTotals').mockResolvedValue(new Map());
  vi.spyOn(internal, 'buildTrends').mockResolvedValue({ expense: [], revenue: [] });

  return service;
}

describe('DashboardService annual Excel Xulosa metrics', () => {
  it('positive reja mavjud oylar bo‘yicha o‘rtacha rejani serverda hisoblaydi', async () => {
    const service = setup([
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
  });

  it('reja kiritilgan oy bo‘lmasa nol va zero denominator qaytaradi', async () => {
    const service = setup([
      { month: 1, expense_type: 'fixed', actual_uzs: 10n, planned_amount_uzs: 0n },
    ]);

    const result = await service.get(user, PERIOD_ID, BRANCH_ID, 'monthly');

    expect(result.annual).toMatchObject({
      averagePlannedMonthlyUzs: '0',
      averagePlanMonthsCount: 0,
    });
  });
});
