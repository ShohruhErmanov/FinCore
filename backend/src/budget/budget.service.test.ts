import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { BudgetService } from './budget.service';

const PERIOD = '20000000-0000-4000-8000-000000000008';
const VERSION = '21000000-0000-4000-8000-000000000008';
const SAYXUN = '10000000-0000-4000-8000-000000000001';
const XALQLAR = '10000000-0000-4000-8000-000000000002';
const RENT = '60000000-0000-4000-8000-000000000001';
const ACTOR = '30000000-0000-4000-8000-000000000001';

const director: AuthenticatedUser = {
  id: ACTOR,
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [],
  permissions: ['budget.view', 'budget.create_edit'],
  branchScopes: [SAYXUN, XALQLAR],
  writeBranchScopes: [SAYXUN, XALQLAR],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

describe('BudgetService — Budjet_tarixi parity', () => {
  it('oylarni alohida blokda, filial rejalari, nol/rejasiz farqi, jami va sabab bilan qaytaradi', async () => {
    const prisma = {
      db: {
        accounting_periods: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'jan', year: 2026, month: 1, status: 'closed' },
            { id: PERIOD, year: 2026, month: 8, status: 'open' },
          ]),
        },
        budget_versions: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: VERSION,
              period_id: PERIOD,
              revision_no: 2,
              status: 'approved',
              reason: 'Avgust tasdiqlangan budjeti',
              created_by: ACTOR,
              updated_at: new Date('2026-08-01T04:00:00.000Z'),
              lines: [
                {
                  branch_id: SAYXUN,
                  category_id: RENT,
                  expense_type_snapshot: 'fixed',
                  category_code_snapshot: 'RENT',
                  category_name_snapshot: 'Ijara (bino arendasi)',
                  planned_amount_uzs: 7_200_000n,
                  reason: 'Shartnoma summasi',
                  created_by: ACTOR,
                  updated_by: null,
                  updated_at: new Date('2026-08-01T04:00:00.000Z'),
                },
                {
                  branch_id: XALQLAR,
                  category_id: RENT,
                  expense_type_snapshot: 'fixed',
                  category_code_snapshot: 'RENT',
                  category_name_snapshot: 'Ijara (bino arendasi)',
                  planned_amount_uzs: 0n,
                  reason: 'Shartnoma summasi',
                  created_by: ACTOR,
                  updated_by: ACTOR,
                  updated_at: new Date('2026-08-02T04:00:00.000Z'),
                },
              ],
            },
          ]),
        },
        branches: {
          findMany: vi.fn().mockResolvedValue([
            { id: SAYXUN, code: 'SAYXUN', name: 'Sayxun', is_active: true },
            { id: XALQLAR, code: 'XALQLAR', name: 'Xalqlar do‘stligi', is_active: true },
          ]),
        },
        expense_categories: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: RENT,
              code: 'RENT',
              name: 'Ijara',
              expense_type: 'fixed',
              is_active: true,
              sort_order: 10,
            },
          ]),
        },
        user_identities: {
          findMany: vi.fn().mockResolvedValue([{ id: ACTOR, display_name: 'Direktor' }]),
        },
      },
    } as unknown as PrismaService;

    const service = new BudgetService(prisma, {} as ActorContextService);
    const result = await service.history(2026);

    expect(result.year).toBe(2026);
    expect(result.periods).toHaveLength(2);
    expect(result.periods[0]).toMatchObject({
      periodLabel: 'Yanvar 2026',
      budgetVersionId: null,
      totalPlannedAmountUzs: null,
    });
    expect(result.periods[0]?.rows[0]?.branches.every((line) => !line.hasPlan)).toBe(true);
    expect(result.periods[1]).toMatchObject({
      periodLabel: 'Avgust 2026',
      revisionNo: 2,
      versionStatus: 'approved',
      versionReason: 'Avgust tasdiqlangan budjeti',
      totalPlannedAmountUzs: '7200000',
      updatedByName: 'Direktor',
    });
    expect(result.periods[1]?.rows[0]).toMatchObject({
      categoryNameSnapshot: 'Ijara (bino arendasi)',
      totalPlannedAmountUzs: '7200000',
      reason: 'Shartnoma summasi',
      branches: [
        { branchName: 'Sayxun', plannedAmountUzs: '7200000', hasPlan: true },
        { branchName: 'Xalqlar do‘stligi', plannedAmountUzs: '0', hasPlan: true },
      ],
    });
  });

  it('izoh/sababni mavjud budget line bilan bir atomar save oqimida saqlaydi', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'line' });
    const tx = {
      budget_lines: {
        findFirst: vi.fn().mockResolvedValue({ id: 'line' }),
        update,
        deleteMany: vi.fn(),
      },
    };
    const versionFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: VERSION })
      .mockResolvedValueOnce({
        id: VERSION,
        updated_at: new Date('2026-08-03T04:00:00.000Z'),
        created_by: ACTOR,
        lines: [
          {
            id: 'line',
            branch_id: SAYXUN,
            category_id: RENT,
            planned_amount_uzs: 7_200_000n,
            reason: 'Ijara shartnomasi',
            updated_by: ACTOR,
          },
        ],
      });
    const prisma = {
      db: {
        accounting_periods: {
          findUnique: vi.fn().mockResolvedValue({
            id: PERIOD,
            year: 2026,
            month: 8,
            status: 'open',
          }),
        },
        budget_versions: { findFirst: versionFindFirst },
        branches: {
          findMany: vi.fn().mockResolvedValue([{ id: SAYXUN, name: 'Sayxun' }]),
        },
        expense_categories: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: RENT, code: 'RENT', name: 'Ijara', expense_type: 'fixed' }]),
        },
        expenses: { groupBy: vi.fn().mockResolvedValue([]) },
        users: { findUnique: vi.fn().mockResolvedValue({ full_name: 'Direktor' }) },
      },
      withActor: vi.fn(async (_token: string, callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const actor = {
      mint: vi.fn().mockReturnValue('actor-token'),
    } as unknown as ActorContextService;
    const service = new BudgetService(prisma, actor);

    const result = await service.saveLines(director, PERIOD, [
      {
        branchId: SAYXUN,
        categoryId: RENT,
        plannedAmountUzs: '7200000',
        reason: '  Ijara shartnomasi  ',
      },
    ]);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'line' },
      data: {
        planned_amount_uzs: 7_200_000n,
        reason: 'Ijara shartnomasi',
        updated_by: ACTOR,
      },
    });
    expect(result.lines[0]?.reason).toBe('Ijara shartnomasi');
  });
});
