import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { PrismaService } from '@/database';
import { ReportsService } from './reports.service';

const BRANCH_A = '00000000-0000-4000-8000-000000000020';
const BRANCH_B = '00000000-0000-4000-8000-000000000021';
const CATEGORY_FIXED = '00000000-0000-4000-8000-000000000030';
const CATEGORY_VARIABLE = '00000000-0000-4000-8000-000000000031';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    fullName: 'Direktor',
    phone: '+998900000000',
    status: 'active',
    roles: [],
    permissions: ['reports.view'],
    branchScopes: [BRANCH_A, BRANCH_B],
    writeBranchScopes: [BRANCH_A, BRANCH_B],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

function setup() {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce([
      {
        year: 2026,
        branch_id: BRANCH_A,
        category_id: CATEGORY_FIXED,
        category_name: 'Ijara',
        expense_type: 'fixed',
        month: 1,
        actual_uzs: 80n,
        planned_amount_uzs: 100n,
      },
      {
        year: 2026,
        branch_id: BRANCH_B,
        category_id: CATEGORY_FIXED,
        category_name: 'Ijara',
        expense_type: 'fixed',
        month: 1,
        actual_uzs: 20n,
        planned_amount_uzs: 50n,
      },
      {
        year: 2026,
        branch_id: BRANCH_A,
        category_id: CATEGORY_FIXED,
        category_name: 'Ijara',
        expense_type: 'fixed',
        month: 2,
        actual_uzs: 10n,
        planned_amount_uzs: null,
      },
      {
        year: 2026,
        branch_id: BRANCH_A,
        category_id: CATEGORY_VARIABLE,
        category_name: 'Reklama',
        expense_type: 'variable',
        month: 1,
        actual_uzs: 220n,
        planned_amount_uzs: 200n,
      },
    ])
    .mockResolvedValueOnce([
      { category_id: CATEGORY_FIXED, month: 1, n: 2n },
      { category_id: CATEGORY_FIXED, month: 2, n: 1n },
      { category_id: CATEGORY_VARIABLE, month: 1, n: 1n },
    ]);
  const findMany = vi.fn().mockResolvedValue([
    {
      id: CATEGORY_VARIABLE,
      code: 'VARIABLE',
      name: 'Reklama',
      expense_type: 'variable',
      sort_order: 20,
    },
    {
      id: CATEGORY_FIXED,
      code: 'FIXED',
      name: 'Ijara',
      expense_type: 'fixed',
      sort_order: 10,
    },
  ]);
  const prisma = {
    db: {
      $queryRaw: queryRaw,
      expense_categories: { findMany },
    },
  } as unknown as PrismaService;
  return { service: new ReportsService(prisma), queryRaw, findMany };
}

describe('ReportsService — Oylik hisobot', () => {
  it('tasdiqlangan view natijasini filiallar bo‘yicha yig‘ib, 12 oy va yillik jami qaytaradi', async () => {
    const { service, queryRaw, findMany } = setup();

    const result = await service.monthly(user(), 2026, 'all');

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledOnce();
    expect(result.rows.map((row) => row.category.code)).toEqual(['FIXED', 'VARIABLE']);
    expect(result.rows[0]?.months).toHaveLength(12);
    expect(result.rows[0]?.months[0]).toMatchObject({
      month: 1,
      planActual: {
        plannedAmountUzs: '150',
        actualAmountUzs: '100',
        varianceUzs: '50',
      },
      transactionCount: 2,
    });
    expect(result.rows[0]?.annual).toMatchObject({
      plannedAmountUzs: '150',
      actualAmountUzs: '110',
      varianceUzs: '40',
      transactionCount: 3,
    });
    expect(result.totals).toMatchObject({
      fixed: { plannedAmountUzs: '150', actualAmountUzs: '110', varianceUzs: '40' },
      variable: { plannedAmountUzs: '200', actualAmountUzs: '220', varianceUzs: '-20' },
      overall: { plannedAmountUzs: '350', actualAmountUzs: '330', varianceUzs: '20' },
    });
    expect(result.averagePolicy.denominator).toBe(2);
  });

  it('ruxsat doirasidan tashqaridagi filial uchun ma’lumot o‘qimaydi', async () => {
    const { service, queryRaw, findMany } = setup();

    const result = await service.monthly(user({ branchScopes: [BRANCH_A] }), 2026, BRANCH_B);

    expect(result.rows).toEqual([]);
    expect(result.branchFilter).toBe(BRANCH_B);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
