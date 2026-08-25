import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService, PrismaTransaction } from '@/database';
import type { ImportExpenseRowDto } from './dto/import.dto';
import { ImportsService } from './imports.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BRANCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_METHOD_ID = '33333333-3333-4333-8333-333333333333';
const DEPARTMENT_ID = '44444444-4444-4444-8444-444444444444';
const RESPONSIBLE_USER_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: ACTOR_ID,
    fullName: 'Actor',
    phone: '+998900000000',
    status: 'active',
    roles: [],
    permissions: ['import.run'],
    branchScopes: [BRANCH_ID],
    writeBranchScopes: [BRANCH_ID],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

function row(overrides: Partial<ImportExpenseRowDto> = {}): ImportExpenseRowDto {
  return {
    sourceSheet: 'Smoke import',
    sourceRow: 2,
    transactionDate: '2026-08-20',
    branchId: BRANCH_ID,
    categoryId: CATEGORY_ID,
    description: 'Controlled import row',
    amountUzs: '100',
    paymentMethodId: PAYMENT_METHOD_ID,
    departmentId: DEPARTMENT_ID,
    responsibleUserId: RESPONSIBLE_USER_ID,
    ...overrides,
  };
}

function harness(branches: Array<{ id: string; name: string }> = [{ id: BRANCH_ID, name: 'Active branch' }]) {
  const branchFindMany = vi.fn(async () => branches);
  const expenseFindMany = vi.fn(async () => []);
  const txExecuteRaw = vi.fn(async () => 1);
  const tx = { $executeRaw: txExecuteRaw } as unknown as PrismaTransaction;
  const withActor = vi.fn(
    async (_token: string, work: (client: PrismaTransaction) => Promise<unknown>) => work(tx),
  );
  const prisma = {
    db: {
      branches: { findMany: branchFindMany },
      expense_categories: { findMany: vi.fn(async () => [{ id: CATEGORY_ID }]) },
      payment_methods: { findMany: vi.fn(async () => [{ id: PAYMENT_METHOD_ID }]) },
      departments: { findMany: vi.fn(async () => [{ id: DEPARTMENT_ID }]) },
      users: { findMany: vi.fn(async () => [{ id: RESPONSIBLE_USER_ID }]) },
      accounting_periods: { findMany: vi.fn(async () => []) },
      expenses: { findMany: expenseFindMany },
    },
    withActor,
  } as unknown as PrismaService;
  const mint = vi.fn(() => 'signed-actor-token');
  const actor = { mint } as unknown as ActorContextService;

  return {
    service: new ImportsService(prisma, actor),
    branchFindMany,
    txExecuteRaw,
    withActor,
    mint,
  };
}

describe('ImportsService branch write guards', () => {
  it('imports an active branch row inside current write scope', async () => {
    const test = harness();

    await expect(test.service.importExpenses(user(), [row()])).resolves.toEqual({
      imported: 1,
      skipped: 0,
      totalUzs: '100',
      rejected: [],
    });

    expect(test.branchFindMany).toHaveBeenCalledWith({
      where: { is_active: true },
      select: { id: true, name: true },
    });
    expect(test.txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(test.withActor).toHaveBeenCalledTimes(1);
    expect(test.mint).toHaveBeenCalledWith(ACTOR_ID);
  });

  it('rejects an active branch row outside current write scope', async () => {
    const test = harness();

    await expect(
      test.service.importExpenses(
        user({ writeBranchScopes: [OTHER_BRANCH_ID] }),
        [row()],
      ),
    ).resolves.toMatchObject({
      imported: 0,
      skipped: 0,
      totalUzs: '0',
      rejected: [{ sourceSheet: 'Smoke import', sourceRow: 2 }],
    });

    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('rejects an inactive branch because branch references include active rows only', async () => {
    const test = harness([]);

    await expect(test.service.importExpenses(user(), [row()])).resolves.toMatchObject({
      imported: 0,
      skipped: 0,
      totalUzs: '0',
      rejected: [{ sourceSheet: 'Smoke import', sourceRow: 2 }],
    });

    expect(test.branchFindMany).toHaveBeenCalledWith({
      where: { is_active: true },
      select: { id: true, name: true },
    });
    expect(test.withActor).not.toHaveBeenCalled();
  });
});
