import { describe, expect, it, vi } from 'vitest';
import { ApiException, type AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService, PrismaTransaction } from '@/database';
import { ExpensesService } from './expenses.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BRANCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXPENSE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_METHOD_ID = '44444444-4444-4444-8444-444444444444';
const DEPARTMENT_ID = '55555555-5555-4555-8555-555555555555';
const RESPONSIBLE_USER_ID = '66666666-6666-4666-8666-666666666666';
const ACTOR_ID = '77777777-7777-4777-8777-777777777777';
const PERIOD_ID = '88888888-8888-4888-8888-888888888888';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: ACTOR_ID,
    fullName: 'Actor',
    phone: '+998900000000',
    status: 'active',
    roles: [],
    permissions: ['expense.create', 'expense.edit'],
    branchScopes: [BRANCH_ID],
    writeBranchScopes: [BRANCH_ID],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    transaction_date: new Date('2026-08-20T00:00:00.000Z'),
    accounting_period_id: PERIOD_ID,
    branch_id: BRANCH_ID,
    category_id: CATEGORY_ID,
    expense_type_snapshot: 'variable',
    category_code_snapshot: 'OPS',
    category_name_snapshot: 'Operations',
    description: 'Controlled expense',
    amount_uzs: 100n,
    payment_method_id: PAYMENT_METHOD_ID,
    department_id: DEPARTMENT_ID,
    responsible_user_id: RESPONSIBLE_USER_ID,
    comment: null,
    entered_by: ACTOR_ID,
    source_sheet: null,
    source_row: null,
    created_at: new Date('2026-08-20T05:00:00.000Z'),
    updated_at: new Date('2026-08-20T05:00:00.000Z'),
    branch: { name: 'Active branch' },
    payment_method: { name: 'Cash' },
    department: { name: 'Finance' },
    ...overrides,
  };
}

function input(branchId = BRANCH_ID) {
  return {
    transactionDate: '2026-08-20',
    branchId,
    categoryId: CATEGORY_ID,
    description: 'Controlled expense',
    amountUzs: '100',
    paymentMethodId: PAYMENT_METHOD_ID,
    departmentId: DEPARTMENT_ID,
    responsibleUserId: RESPONSIBLE_USER_ID,
    idempotencyKey: 'expense-key',
  };
}

function expectApiCode(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).getStatus()).toBe(status);
  expect((error as ApiException).code).toBe(code);
}

function harness() {
  const expenseFindFirst = vi.fn(async () => null);
  const expenseFindUnique = vi.fn(async () => expenseRow());
  const branchFindUnique = vi.fn(async () => ({ is_active: true }));
  const categoryCount = vi.fn(async () => 1);
  const paymentMethodCount = vi.fn(async () => 1);
  const departmentCount = vi.fn(async () => 1);
  const userCount = vi.fn(async () => 1);
  const userFindMany = vi.fn(async () => [
    { id: ACTOR_ID, full_name: 'Actor' },
    { id: RESPONSIBLE_USER_ID, full_name: 'Responsible user' },
  ]);
  const txQueryRaw = vi.fn(async () => [{ id: EXPENSE_ID }]);
  const txExpenseUpdate = vi.fn(async () => ({ id: EXPENSE_ID }));
  const tx = {
    $queryRaw: txQueryRaw,
    expenses: { update: txExpenseUpdate },
  } as unknown as PrismaTransaction;
  const withActor = vi.fn(
    async (_token: string, work: (client: PrismaTransaction) => Promise<unknown>) => work(tx),
  );
  const prisma = {
    db: {
      expenses: { findFirst: expenseFindFirst, findUnique: expenseFindUnique },
      branches: { findUnique: branchFindUnique },
      expense_categories: { count: categoryCount },
      payment_methods: { count: paymentMethodCount },
      departments: { count: departmentCount },
      users: { count: userCount, findMany: userFindMany },
    },
    withActor,
  } as unknown as PrismaService;
  const mint = vi.fn(() => 'signed-actor-token');
  const actor = { mint } as unknown as ActorContextService;

  return {
    service: new ExpensesService(prisma, actor),
    expenseFindFirst,
    expenseFindUnique,
    branchFindUnique,
    categoryCount,
    withActor,
    mint,
  };
}

describe('ExpensesService branch write guards', () => {
  it('creates on an active branch inside current write scope', async () => {
    const test = harness();

    await expect(test.service.create(user(), 'expense-key', input())).resolves.toMatchObject({
      id: EXPENSE_ID,
      branchId: BRANCH_ID,
    });

    expect(test.branchFindUnique).toHaveBeenCalledWith({
      where: { id: BRANCH_ID },
      select: { is_active: true },
    });
    expect(test.withActor).toHaveBeenCalledTimes(1);
    expect(test.mint).toHaveBeenCalledWith(ACTOR_ID);
  });

  it('rejects a create outside current write scope before database lookup', async () => {
    const test = harness();

    await test.service
      .create(user(), 'expense-key', input(OTHER_BRANCH_ID))
      .then(() => expect.unreachable('out-of-scope branch must reject the write'))
      .catch((error: unknown) => expectApiCode(error, 403, 'BRANCH_SCOPE_DENIED'));

    expect(test.expenseFindFirst).not.toHaveBeenCalled();
    expect(test.branchFindUnique).not.toHaveBeenCalled();
    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('rejects an inactive branch on create before reference checks or actor transaction', async () => {
    const test = harness();
    test.branchFindUnique.mockResolvedValueOnce({ is_active: false });

    await test.service
      .create(user(), 'expense-key', input())
      .then(() => expect.unreachable('inactive branch must reject the write'))
      .catch((error: unknown) => expectApiCode(error, 422, 'REFERENCE_INVALID'));

    expect(test.categoryCount).not.toHaveBeenCalled();
    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('rejects an inactive branch on update before changing the expense', async () => {
    const test = harness();
    test.expenseFindUnique.mockResolvedValueOnce(expenseRow());
    test.branchFindUnique.mockResolvedValueOnce({ is_active: false });

    await test.service
      .update(user(), EXPENSE_ID, { comment: 'Updated' })
      .then(() => expect.unreachable('inactive branch must reject the edit'))
      .catch((error: unknown) => expectApiCode(error, 422, 'REFERENCE_INVALID'));

    expect(test.withActor).not.toHaveBeenCalled();
  });
});
