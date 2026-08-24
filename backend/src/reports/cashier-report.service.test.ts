import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { PrismaService } from '@/database';
import { CashierReportService } from './cashier-report.service';

const PERIOD_ID = '00000000-0000-4000-8000-000000000010';
const BRANCH_A = '00000000-0000-4000-8000-000000000020';
const BRANCH_B = '00000000-0000-4000-8000-000000000021';
const CASHIER_A = '00000000-0000-4000-8000-000000000030';
const CASHIER_B = '00000000-0000-4000-8000-000000000031';

function authenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: CASHIER_A,
    fullName: 'Cashier A',
    phone: '+998901234567',
    status: 'active',
    roles: [],
    permissions: ['reports.view_cashiers'],
    branchScopes: [BRANCH_A],
    writeBranchScopes: [BRANCH_A],
    fixedSalaryUzs: '10',
    lastLoginAt: null,
    ...overrides,
  };
}

function setupQueryResults(results: unknown[][]) {
  const queryRaw = vi.fn();
  for (const result of results) queryRaw.mockResolvedValueOnce(result);
  const accountingPeriods = {
    findUnique: vi.fn().mockResolvedValue({ id: PERIOD_ID, year: 2026, month: 8 }),
  };
  const prisma = {
    db: {
      accounting_periods: accountingPeriods,
      $queryRaw: queryRaw,
    },
  } as unknown as PrismaService;

  return {
    service: new CashierReportService(prisma),
    queryRaw,
    accountingPeriods,
  };
}

const branchRows = [
  {
    branch_id: BRANCH_A,
    branch_name: 'Chilonzor',
    planned_amount_uzs: 100n,
    actual_uzs: 70n,
  },
];

const rosterRows = [
  {
    branch_id: BRANCH_A,
    user_id: CASHIER_A,
    full_name: 'Cashier A',
    is_active: true,
  },
  {
    branch_id: BRANCH_A,
    user_id: CASHIER_B,
    full_name: 'Cashier B',
    is_active: true,
  },
];

describe('CashierReportService (PHASE 19)', () => {
  it('maps sanctioned-view actuals and salaries, retaining a cashier with zero transactions', async () => {
    const metrics = [
      { branch_id: BRANCH_A, user_id: CASHIER_A, total_uzs: 70n, salary: '10' },
      { branch_id: BRANCH_A, user_id: CASHIER_B, total_uzs: 0n, salary: '20' },
    ];
    const days = [{ branch_id: BRANCH_A, user_id: CASHIER_A, days: 2 }];
    const { service, queryRaw } = setupQueryResults([branchRows, rosterRows, metrics, days]);

    const result = await service.get(authenticatedUser(), PERIOD_ID, 'all');

    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      periodLabel: 'Avgust 2026',
      branchFilter: BRANCH_A,
      scope: 'all',
      total: {
        planUzs: '100',
        actualUzs: '70',
        varianceUzs: '-30',
        salaryTotalUzs: '30',
        activeCashierCount: 2,
      },
    });
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({
      branchId: BRANCH_A,
      planUzs: '100',
      actualUzs: '70',
      salaryTotalUzs: '30',
    });
    expect(result.branches[0]?.cashiers).toEqual([
      expect.objectContaining({
        userId: CASHIER_A,
        fixedSalaryUzs: '10',
        planUzs: '50',
        actualUzs: '70',
        varianceUzs: '20',
        daysWithEntry: 2,
      }),
      expect.objectContaining({
        userId: CASHIER_B,
        fixedSalaryUzs: '20',
        planUzs: '50',
        actualUzs: '0',
        varianceUzs: '-50',
        daysWithEntry: 0,
        salaryToRevenuePct: null,
      }),
    ]);
  });

  it('narrows own-performance permission to the requester without leaking another salary', async () => {
    const ownMetric = [
      { branch_id: BRANCH_A, user_id: CASHIER_A, total_uzs: 70n, salary: '10' },
    ];
    const ownDays = [{ branch_id: BRANCH_A, user_id: CASHIER_A, days: 1 }];
    const { service, queryRaw } = setupQueryResults([
      branchRows,
      rosterRows,
      ownMetric,
      ownDays,
    ]);
    const viewer = authenticatedUser({
      permissions: ['reports.view_own_performance'],
    });

    const result = await service.get(viewer, PERIOD_ID, BRANCH_A);

    expect(result.scope).toBe('own');
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]?.cashiers).toHaveLength(1);
    expect(result.branches[0]?.cashiers[0]).toMatchObject({
      userId: CASHIER_A,
      fixedSalaryUzs: '10',
      actualUzs: '70',
    });
    expect(result.total).toMatchObject({
      planUzs: '50',
      actualUzs: '70',
      salaryTotalUzs: '10',
      activeCashierCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(CASHIER_B);
    expect(JSON.stringify(result)).not.toContain('"fixedSalaryUzs":"20"');

    const metricQueryArguments = queryRaw.mock.calls[2] ?? [];
    expect(metricQueryArguments).toContain(CASHIER_A);
    expect(metricQueryArguments).not.toContain(CASHIER_B);
  });

  it('rejects a viewer lacking both cashier-report permissions before database reads', async () => {
    const { service, accountingPeriods, queryRaw } = setupQueryResults([]);

    await expect(
      service.get(authenticatedUser({ permissions: [] }), PERIOD_ID, 'all'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(accountingPeriods.findUnique).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope branch before executing financial report queries', async () => {
    const { service, accountingPeriods, queryRaw } = setupQueryResults([]);

    await expect(
      service.get(authenticatedUser(), PERIOD_ID, BRANCH_B),
    ).rejects.toMatchObject({ code: 'BRANCH_SCOPE_DENIED' });

    expect(accountingPeriods.findUnique).toHaveBeenCalledOnce();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns a stable empty report when the viewer has no visible branches', async () => {
    const { service, queryRaw } = setupQueryResults([]);

    const result = await service.get(
      authenticatedUser({ branchScopes: [], writeBranchScopes: [] }),
      PERIOD_ID,
      'all',
    );

    expect(queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({
      periodLabel: 'Avgust 2026',
      branchFilter: 'all',
      scope: 'all',
      branches: [],
      total: {
        planUzs: '0',
        actualUzs: '0',
        varianceUzs: '0',
        completionPct: null,
        salaryTotalUzs: '0',
        salaryToRevenuePct: null,
        activeCashierCount: 0,
      },
    });
  });
});
