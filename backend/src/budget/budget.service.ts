import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';
import type { BudgetLineInputDto } from './dto/budget.dto';

/** Mirrors the frontend BudgetLine / BudgetPlan (src/shared/types/domain.ts:205). */
export interface BudgetLineDto {
  id: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: 'fixed' | 'variable';
  plannedAmountUzs: string | null;
  actualAmountUzs: string;
  varianceUzs: string | null;
  hasPlan: boolean;
}

export interface BudgetPlanDto {
  id: string;
  periodId: string;
  periodLabel: string;
  updatedAt: string;
  updatedByName: string;
  lines: BudgetLineDto[];
}

const MONTHS_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async get(periodId: string): Promise<BudgetPlanDto> {
    const period = await this.requirePeriod(periodId);
    return this.build(period);
  }

  async saveLines(
    user: AuthenticatedUser,
    periodId: string,
    lines: BudgetLineInputDto[],
  ): Promise<BudgetPlanDto> {
    const period = await this.requirePeriod(periodId);
    if (period.status === 'closed')
      throw new ApiException(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tahrirlanmaydi.');

    const version = await this.ensureDraftVersion(user, periodId);

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        for (const line of lines) {
          if (line.plannedAmountUzs === null) {
            // Clearing a cell removes the plan entirely — that is what
            // hasPlan:false means, and it is not the same as planning zero.
            await tx.budget_lines.deleteMany({
              where: {
                version_id: version.id,
                branch_id: line.branchId,
                category_id: line.categoryId,
              },
            });
            continue;
          }

          const amount = BigInt(line.plannedAmountUzs);
          const existing = await tx.budget_lines.findFirst({
            where: {
              version_id: version.id,
              branch_id: line.branchId,
              category_id: line.categoryId,
            },
            select: { id: true },
          });

          if (existing) {
            await tx.budget_lines.update({
              where: { id: existing.id },
              data: { planned_amount_uzs: amount, updated_by: user.id },
            });
          } else {
            // Raw INSERT: the three snapshot columns are NOT NULL but filled by
            // trg_budget_lines_derive_snapshot, which Prisma's create() cannot express.
            await tx.$executeRaw`
              INSERT INTO fincore.budget_lines
                (version_id, branch_id, category_id, planned_amount_uzs, created_by)
              VALUES (
                ${version.id}::uuid, ${line.branchId}::uuid, ${line.categoryId}::uuid,
                ${amount}, ${user.id}::uuid
              )
            `;
          }
        }
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.build(period);
  }

  // -------------------------------------------------------------------------

  private async requirePeriod(periodId: string) {
    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true, status: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return period;
  }

  /**
   * Lines may only be written while their version is `draft`
   * (trg_budget_lines_guard), and the frontend has no approval workflow, so a
   * single draft revision per period is the whole model.
   */
  private async ensureDraftVersion(user: AuthenticatedUser, periodId: string) {
    const existing = await this.prisma.db.budget_versions.findFirst({
      where: { period_id: periodId, status: 'draft' },
      select: { id: true },
      orderBy: { revision_no: 'desc' },
    });
    if (existing) return existing;

    const last = await this.prisma.db.budget_versions.findFirst({
      where: { period_id: periodId },
      select: { revision_no: true },
      orderBy: { revision_no: 'desc' },
    });

    return this.prisma.withActor(this.actor.mint(user.id), (tx) =>
      tx.budget_versions.create({
        data: {
          period_id: periodId,
          revision_no: (last?.revision_no ?? 0) + 1,
          created_by: user.id,
          // Applicable AND draft: the frontend has no approval step, so a saved
          // plan is immediately the operative one, while `draft` keeps it
          // editable (trg_budget_lines_guard). This is what makes the plan
          // visible to v_applicable_budget_line and therefore to the reports.
          is_applicable: true,
        },
        select: { id: true },
      }),
    );
  }

  /**
   * Every active category × every branch, so the grid always renders a full
   * matrix — a cell with no saved line is "no plan", not "planned zero".
   */
  private async build(period: {
    id: string;
    year: number;
    month: number;
    status: string;
  }): Promise<BudgetPlanDto> {
    const [branches, categories, version, actuals] = await Promise.all([
      this.prisma.db.branches.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.db.expense_categories.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true, expense_type: true },
        orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.db.budget_versions.findFirst({
        where: { period_id: period.id, status: 'draft' },
        select: {
          id: true,
          updated_at: true,
          created_by: true,
          lines: {
            select: {
              id: true,
              branch_id: true,
              category_id: true,
              planned_amount_uzs: true,
              updated_by: true,
            },
          },
        },
        orderBy: { revision_no: 'desc' },
      }),
      // Actuals follow the same net rule the reporting layer uses: an approved,
      // non-reversed row counts, nothing else does.
      this.prisma.db.expenses.groupBy({
        by: ['branch_id', 'category_id'],
        where: { accounting_period_id: period.id, status: 'approved', is_reversed: false },
        _sum: { amount_uzs: true },
      }),
    ]);

    const actualByCell = new Map(
      actuals.map((row) => [`${row.branch_id}:${row.category_id}`, row._sum.amount_uzs ?? 0n]),
    );
    const savedByCell = new Map(
      (version?.lines ?? []).map((line) => [`${line.branch_id}:${line.category_id}`, line]),
    );

    const lines: BudgetLineDto[] = categories.flatMap((category) =>
      branches.map((branch) => {
        const key = `${branch.id}:${category.id}`;
        const saved = savedByCell.get(key);
        const actual = actualByCell.get(key) ?? 0n;
        const planned = saved?.planned_amount_uzs ?? null;
        return {
          id: saved?.id ?? `bl-${category.id}-${branch.id}`,
          branchId: branch.id,
          branchName: branch.name,
          categoryId: category.id,
          categoryCodeSnapshot: category.code,
          categoryNameSnapshot: category.name,
          expenseTypeSnapshot: category.expense_type,
          plannedAmountUzs: planned === null ? null : toMoneyUzs(planned),
          actualAmountUzs: toMoneyUzs(actual)!,
          varianceUzs: planned === null ? null : toMoneyUzs(planned - actual),
          hasPlan: planned !== null,
        };
      }),
    );

    const editorId = version?.lines.find((line) => line.updated_by)?.updated_by ?? version?.created_by;
    const editor = editorId
      ? await this.prisma.db.users.findUnique({
          where: { id: editorId },
          select: { full_name: true },
        })
      : null;

    return {
      id: version?.id ?? `budget-${period.id}`,
      periodId: period.id,
      periodLabel: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
      updatedAt: toIsoDateTime(version?.updated_at ?? new Date())!,
      updatedByName: editor?.full_name ?? '',
      lines,
    };
  }

  private translateWriteError(error: unknown): unknown {
    const message = error instanceof Error ? error.message : String(error);
    if (/period is closed/i.test(message))
      return new ApiException(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tahrirlanmaydi.');
    if (/only be written while their version is in draft/i.test(message))
      return new ApiException(409, 'BUDGET_VERSION_LOCKED', 'Budjet versiyasi tahrirlanmaydi.');
    if (/foreign key|violates/i.test(message))
      return new ApiException(422, 'REFERENCE_INVALID', 'Filial yoki kategoriya topilmadi.');
    return error;
  }
}
