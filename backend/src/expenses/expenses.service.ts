import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDate, toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';
import type { ExpenseCreateDto, ExpenseListQueryDto, ExpenseUpdateDto } from './dto/expense.dto';

/** Mirrors the frontend Expense interface (src/shared/types/domain.ts:110). */
export interface ExpenseDto {
  id: string;
  transactionDate: string;
  periodId: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: 'fixed' | 'variable';
  description: string;
  amountUzs: string;
  paymentMethodId: string;
  paymentMethodName: string;
  departmentId: string;
  departmentName: string;
  responsibleUserId: string;
  responsibleUserName: string;
  enteredBy: string;
  enteredByName: string;
  comment: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExpenses {
  items: ExpenseDto[];
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
}

const ROW_SELECT = {
  id: true,
  transaction_date: true,
  accounting_period_id: true,
  branch_id: true,
  category_id: true,
  expense_type_snapshot: true,
  category_code_snapshot: true,
  category_name_snapshot: true,
  description: true,
  amount_uzs: true,
  payment_method_id: true,
  department_id: true,
  responsible_user_id: true,
  comment: true,
  entered_by: true,
  source_sheet: true,
  source_row: true,
  created_at: true,
  updated_at: true,
  branch: { select: { name: true } },
  payment_method: { select: { name: true } },
  department: { select: { name: true } },
} satisfies Prisma.expensesSelect;

type ExpenseRow = Prisma.expensesGetPayload<{ select: typeof ROW_SELECT }>;

/** A filter value of "all" or an empty string means "do not filter". */
function pick(value: string | undefined): string | undefined {
  return !value || value === 'all' ? undefined : value;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async list(user: AuthenticatedUser, query: ExpenseListQueryDto): Promise<PaginatedExpenses> {
    const where = this.scopedWhere(user, query);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const descending = (query.sort ?? 'transactionDate:desc').endsWith(':desc');

    const [total, rows] = await Promise.all([
      this.prisma.db.expenses.count({ where }),
      this.prisma.db.expenses.findMany({
        where,
        select: ROW_SELECT,
        orderBy: [
          { transaction_date: descending ? 'desc' : 'asc' },
          { created_at: descending ? 'desc' : 'asc' },
          { id: descending ? 'desc' : 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: await this.toDtos(rows),
      page,
      pageSize,
      total,
      nextCursor: page * pageSize < total ? String(page + 1) : null,
    };
  }

  async detail(user: AuthenticatedUser, id: string): Promise<ExpenseDto> {
    const row = await this.prisma.db.expenses.findUnique({ where: { id }, select: ROW_SELECT });
    if (!row) throw new ApiException(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (
      !user.permissions.includes('expense.view_all_branches') &&
      !user.branchScopes.includes(row.branch_id)
    )
      throw new ApiException(
        403,
        'BRANCH_SCOPE_DENIED',
        'Bu filial ma’lumotini ko‘rish huquqi yo‘q.',
      );
    const [dto] = await this.toDtos([row]);
    return dto!;
  }

  async create(
    user: AuthenticatedUser,
    idempotencyKey: string | undefined,
    input: ExpenseCreateDto,
  ): Promise<ExpenseDto> {
    if (!idempotencyKey || idempotencyKey !== input.idempotencyKey)
      throw new ApiException(
        422,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header va body mos bo‘lishi shart.',
      );

    const branchId = input.branchId ?? user.writeBranchScopes[0];
    if (!branchId || !user.writeBranchScopes.includes(branchId))
      throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');

    // Replaying the same key returns the original row instead of a duplicate.
    const replay = await this.prisma.db.expenses.findFirst({
      where: { idempotency_key: idempotencyKey, entered_by: user.id },
      select: ROW_SELECT,
    });
    if (replay) {
      const [dto] = await this.toDtos([replay]);
      return dto!;
    }

    await this.assertReferencesActive(input);

    const created = await this.prisma.withActor(this.actor.mint(user.id), async (tx) => {
      // Raw INSERT: accounting_period_id and the three category snapshots are
      // NOT NULL but populated by trg_expenses_derive_period_snapshot, which
      // Prisma's typed create() cannot express.
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO fincore.expenses (
          transaction_date, branch_id, category_id, description, amount_uzs,
          payment_method_id, department_id, responsible_user_id, comment,
          entered_by, idempotency_key
        ) VALUES (
          ${input.transactionDate}::date,
          ${branchId}::uuid,
          ${input.categoryId}::uuid,
          ${input.description},
          ${BigInt(input.amountUzs)},
          ${input.paymentMethodId}::uuid,
          ${input.departmentId}::uuid,
          ${input.responsibleUserId}::uuid,
          ${input.comment ?? null},
          ${user.id}::uuid,
          ${idempotencyKey}
        )
        RETURNING id
      `;
      return rows[0]!.id;
    }).catch((error: unknown) => {
      throw this.translateWriteError(error);
    });

    return this.detail(user, created);
  }

  async update(user: AuthenticatedUser, id: string, input: ExpenseUpdateDto): Promise<ExpenseDto> {
    const existing = await this.prisma.db.expenses.findUnique({
      where: { id },
      select: { id: true, branch_id: true },
    });
    if (!existing) throw new ApiException(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!user.writeBranchScopes.includes(existing.branch_id))
      throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');

    await this.assertReferencesActive(input);

    const data: Prisma.expensesUncheckedUpdateInput = {};
    if (input.transactionDate !== undefined) data.transaction_date = new Date(input.transactionDate);
    if (input.categoryId !== undefined) data.category_id = input.categoryId;
    if (input.description !== undefined) data.description = input.description;
    if (input.amountUzs !== undefined) data.amount_uzs = BigInt(input.amountUzs);
    if (input.paymentMethodId !== undefined) data.payment_method_id = input.paymentMethodId;
    if (input.departmentId !== undefined) data.department_id = input.departmentId;
    if (input.responsibleUserId !== undefined) data.responsible_user_id = input.responsibleUserId;
    if (input.comment !== undefined) data.comment = input.comment ?? null;

    if (Object.keys(data).length > 0)
      await this.prisma
        .withActor(this.actor.mint(user.id), (tx) => tx.expenses.update({ where: { id }, data }))
        .catch((error: unknown) => {
          throw this.translateWriteError(error);
        });

    return this.detail(user, id);
  }

  // -------------------------------------------------------------------------

  private scopedWhere(user: AuthenticatedUser, query: ExpenseListQueryDto): Prisma.expensesWhereInput {
    const branch = pick(query.branch);
    const readable = user.permissions.includes('expense.view_all_branches')
      ? undefined
      : user.branchScopes;

    const where: Prisma.expensesWhereInput = {};
    if (branch) where.branch_id = branch;
    else if (readable) where.branch_id = { in: readable };
    // A user with neither all-branch view nor any scope must see nothing.
    if (branch && readable && !readable.includes(branch)) where.branch_id = { in: [] };

    const categoryId = pick(query.categoryId);
    if (categoryId) where.category_id = categoryId;
    const expenseType = pick(query.expenseType);
    if (expenseType === 'fixed' || expenseType === 'variable')
      where.expense_type_snapshot = expenseType;
    const departmentId = pick(query.departmentId);
    if (departmentId) where.department_id = departmentId;
    const paymentMethodId = pick(query.paymentMethodId);
    if (paymentMethodId) where.payment_method_id = paymentMethodId;
    const responsibleUserId = pick(query.responsibleUserId);
    if (responsibleUserId) where.responsible_user_id = responsibleUserId;
    const enteredByUserId = pick(query.enteredByUserId);
    if (enteredByUserId) where.entered_by = enteredByUserId;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
    if (query.dateTo) dateFilter.lte = new Date(query.dateTo);
    if (query.year) {
      const year = Number(query.year);
      const month = query.month ? Number(query.month) : 0;
      const start = Date.UTC(year, month ? month - 1 : 0, 1);
      const end = month ? Date.UTC(year, month, 1) : Date.UTC(year + 1, 0, 1);
      const currentStart = dateFilter.gte instanceof Date ? dateFilter.gte.valueOf() : start;
      dateFilter.gte = new Date(Math.max(start, currentStart));
      dateFilter.lt = new Date(end);
    }
    if (Object.keys(dateFilter).length > 0) where.transaction_date = dateFilter;

    return where;
  }

  /** The mock rejects inactive or unknown references before writing; so do we. */
  private async assertReferencesActive(
    input: Partial<Pick<ExpenseCreateDto, 'categoryId' | 'paymentMethodId' | 'departmentId' | 'responsibleUserId'>>,
  ): Promise<void> {
    const checks: Array<Promise<boolean>> = [];
    if (input.categoryId)
      checks.push(
        this.prisma.db.expense_categories
          .count({ where: { id: input.categoryId, is_active: true } })
          .then((n) => n > 0),
      );
    if (input.paymentMethodId)
      checks.push(
        this.prisma.db.payment_methods
          .count({ where: { id: input.paymentMethodId, is_active: true } })
          .then((n) => n > 0),
      );
    if (input.departmentId)
      checks.push(
        this.prisma.db.departments
          .count({ where: { id: input.departmentId, is_active: true } })
          .then((n) => n > 0),
      );
    if (input.responsibleUserId)
      checks.push(
        this.prisma.db.users
          .count({ where: { id: input.responsibleUserId, status: 'active' } })
          .then((n) => n > 0),
      );

    if ((await Promise.all(checks)).some((ok) => !ok))
      throw new ApiException(
        422,
        'REFERENCE_INVALID',
        'Tanlangan ma’lumotlardan biri faol emas yoki topilmadi.',
      );
  }

  /** Turns the database's own guards into the contract's error codes. */
  private translateWriteError(error: unknown): unknown {
    const message = error instanceof Error ? error.message : String(error);
    if (/accounting period is closed|period is closed/i.test(message))
      return new ApiException(409, 'PERIOD_LOCKED', 'Yopilgan davrga yozuv qo‘shib bo‘lmaydi.');
    if (/actor context|signing key/i.test(message))
      return new ApiException(500, 'ACTOR_CONTEXT_INVALID', 'Server identifikatsiya konteksti noto‘g‘ri.');
    if (/violates check constraint|invalid input|out of range/i.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Kiritilgan qiymat qoidaga mos emas.');
    return error;
  }

  private async toDtos(rows: ExpenseRow[]): Promise<ExpenseDto[]> {
    const userIds = [...new Set(rows.flatMap((row) => [row.responsible_user_id, row.entered_by]))];
    const names = new Map(
      userIds.length === 0
        ? []
        : (
            await this.prisma.db.users.findMany({
              where: { id: { in: userIds } },
              select: { id: true, full_name: true },
            })
          ).map((user) => [user.id, user.full_name] as const),
    );

    return rows.map((row) => ({
      id: row.id,
      transactionDate: toIsoDate(row.transaction_date)!,
      periodId: row.accounting_period_id,
      branchId: row.branch_id,
      branchName: row.branch.name,
      categoryId: row.category_id,
      categoryCodeSnapshot: row.category_code_snapshot,
      categoryNameSnapshot: row.category_name_snapshot,
      expenseTypeSnapshot: row.expense_type_snapshot,
      description: row.description,
      amountUzs: toMoneyUzs(row.amount_uzs)!,
      paymentMethodId: row.payment_method_id,
      paymentMethodName: row.payment_method.name,
      departmentId: row.department_id,
      departmentName: row.department.name,
      responsibleUserId: row.responsible_user_id,
      responsibleUserName: names.get(row.responsible_user_id) ?? '',
      enteredBy: row.entered_by,
      enteredByName: names.get(row.entered_by) ?? '',
      comment: row.comment,
      sourceSheet: row.source_sheet,
      sourceRow: row.source_row,
      createdAt: toIsoDateTime(row.created_at)!,
      updatedAt: toIsoDateTime(row.updated_at)!,
    }));
  }
}
