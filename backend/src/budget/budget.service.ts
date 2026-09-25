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
  reason: string | null;
}

export interface BudgetPlanDto {
  id: string;
  periodId: string;
  periodLabel: string;
  updatedAt: string;
  updatedByName: string;
  lines: BudgetLineDto[];
}

export interface BudgetHistoryBranchPlanDto {
  branchId: string;
  branchName: string;
  plannedAmountUzs: string | null;
  hasPlan: boolean;
  reason: string | null;
}

export interface BudgetHistoryRowDto {
  categoryId: string;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: 'fixed' | 'variable';
  branches: BudgetHistoryBranchPlanDto[];
  totalPlannedAmountUzs: string | null;
  reason: string | null;
}

export interface BudgetHistoryPeriodDto {
  periodId: string;
  year: number;
  month: number;
  periodLabel: string;
  periodStatus: 'open' | 'closed';
  budgetVersionId: string | null;
  revisionNo: number | null;
  versionStatus: 'draft' | 'submitted' | 'approved' | 'locked' | null;
  versionReason: string | null;
  updatedAt: string | null;
  updatedByName: string;
  rows: BudgetHistoryRowDto[];
  totalsByBranch: BudgetHistoryBranchPlanDto[];
  totalPlannedAmountUzs: string | null;
}

export interface BudgetHistoryDto {
  year: number | null;
  branches: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  periods: BudgetHistoryPeriodDto[];
}

const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
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

  /**
   * Excel `Budjet_tarixi` parity: every accounting month is returned as a
   * separate category × branch block. Applicable versions are used so closed
   * historical months remain visible without making them editable.
   */
  async history(year?: number): Promise<BudgetHistoryDto> {
    const periods = await this.prisma.db.accounting_periods.findMany({
      ...(year === undefined ? {} : { where: { year } }),
      select: { id: true, year: true, month: true, status: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (periods.length === 0) return { year: year ?? null, branches: [], periods: [] };

    const versions = await this.prisma.db.budget_versions.findMany({
      where: { period_id: { in: periods.map((period) => period.id) }, is_applicable: true },
      select: {
        id: true,
        period_id: true,
        revision_no: true,
        status: true,
        reason: true,
        created_by: true,
        updated_at: true,
        lines: {
          select: {
            branch_id: true,
            category_id: true,
            expense_type_snapshot: true,
            category_code_snapshot: true,
            category_name_snapshot: true,
            planned_amount_uzs: true,
            reason: true,
            created_by: true,
            updated_by: true,
            updated_at: true,
          },
        },
      },
      orderBy: [{ period_id: 'asc' }, { revision_no: 'desc' }],
    });

    const referencedBranchIds = new Set(
      versions.flatMap((version) => version.lines.map((line) => line.branch_id)),
    );
    const referencedCategoryIds = new Set(
      versions.flatMap((version) => version.lines.map((line) => line.category_id)),
    );
    const [allBranches, allCategories] = await Promise.all([
      this.prisma.db.branches.findMany({
        select: { id: true, code: true, name: true, is_active: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.db.expense_categories.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          expense_type: true,
          is_active: true,
          sort_order: true,
        },
        orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
      }),
    ]);
    const branches = allBranches.filter(
      (branch) => branch.is_active || referencedBranchIds.has(branch.id),
    );
    const categories = allCategories.filter(
      (category) => category.is_active || referencedCategoryIds.has(category.id),
    );

    const actorIds = new Set<string>();
    versions.forEach((version) => {
      actorIds.add(version.created_by);
      version.lines.forEach((line) => actorIds.add(line.updated_by ?? line.created_by));
    });
    const identities = actorIds.size
      ? await this.prisma.db.user_identities.findMany({
          where: { id: { in: [...actorIds] } },
          select: { id: true, display_name: true },
        })
      : [];
    const actorNameById = new Map(
      identities.map((identity) => [identity.id, identity.display_name]),
    );
    const versionByPeriod = new Map(versions.map((version) => [version.period_id, version]));

    return {
      year:
        year ??
        (new Set(periods.map((period) => period.year)).size === 1 ? periods[0]!.year : null),
      branches: branches.map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        isActive: branch.is_active,
      })),
      periods: periods.map((period) => {
        const version = versionByPeriod.get(period.id);
        const lines = version?.lines ?? [];
        const savedByCell = new Map(
          lines.map((line) => [`${line.branch_id}:${line.category_id}`, line]),
        );
        const applicableCategories = categories.filter(
          (category) =>
            category.is_active || lines.some((line) => line.category_id === category.id),
        );
        const rows = applicableCategories.map((category): BudgetHistoryRowDto => {
          const representative = lines.find((line) => line.category_id === category.id);
          const branchPlans = branches.map((branch): BudgetHistoryBranchPlanDto => {
            const line = savedByCell.get(`${branch.id}:${category.id}`);
            return {
              branchId: branch.id,
              branchName: branch.name,
              plannedAmountUzs: line ? toMoneyUzs(line.planned_amount_uzs) : null,
              hasPlan: Boolean(line),
              reason: line?.reason ?? null,
            };
          });
          const plannedBranches = branchPlans.filter((plan) => plan.hasPlan);
          return {
            categoryId: category.id,
            categoryCodeSnapshot: representative?.category_code_snapshot ?? category.code,
            categoryNameSnapshot: representative?.category_name_snapshot ?? category.name,
            expenseTypeSnapshot: representative?.expense_type_snapshot ?? category.expense_type,
            branches: branchPlans,
            totalPlannedAmountUzs:
              plannedBranches.length === 0
                ? null
                : toMoneyUzs(
                    plannedBranches.reduce(
                      (sum, plan) => sum + BigInt(plan.plannedAmountUzs ?? '0'),
                      0n,
                    ),
                  ),
            reason: this.combineReasons(branchPlans),
          };
        });
        const totalsByBranch = branches.map((branch): BudgetHistoryBranchPlanDto => {
          const branchLines = lines.filter((line) => line.branch_id === branch.id);
          return {
            branchId: branch.id,
            branchName: branch.name,
            plannedAmountUzs:
              branchLines.length === 0
                ? null
                : toMoneyUzs(branchLines.reduce((sum, line) => sum + line.planned_amount_uzs, 0n)),
            hasPlan: branchLines.length > 0,
            reason: null,
          };
        });
        const lastLine = lines.reduce<(typeof lines)[number] | undefined>(
          (latest, line) => (!latest || line.updated_at > latest.updated_at ? line : latest),
          undefined,
        );
        const editorId = lastLine?.updated_by ?? lastLine?.created_by ?? version?.created_by;
        const plannedTotals = totalsByBranch.filter((total) => total.hasPlan);
        return {
          periodId: period.id,
          year: period.year,
          month: period.month,
          periodLabel: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
          periodStatus: period.status,
          budgetVersionId: version?.id ?? null,
          revisionNo: version?.revision_no ?? null,
          versionStatus: version?.status ?? null,
          versionReason: version?.reason ?? null,
          updatedAt: version ? toIsoDateTime(version.updated_at) : null,
          updatedByName: editorId ? (actorNameById.get(editorId) ?? '') : '',
          rows,
          totalsByBranch,
          totalPlannedAmountUzs:
            plannedTotals.length === 0
              ? null
              : toMoneyUzs(
                  plannedTotals.reduce(
                    (sum, total) => sum + BigInt(total.plannedAmountUzs ?? '0'),
                    0n,
                  ),
                ),
        };
      }),
    };
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
        // A saved draft is the operative plan in the current no-approval UI.
        // Keep the applicable marker in the same transaction as its lines so
        // dashboards never observe a saved Budget page that reports as zero.
        await tx.budget_versions.updateMany({
          where: {
            period_id: periodId,
            is_applicable: true,
            id: { not: version.id },
          },
          data: { is_applicable: false },
        });
        await tx.budget_versions.update({
          where: { id: version.id },
          data: { is_applicable: true },
        });

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
              data: {
                planned_amount_uzs: amount,
                reason: this.normalizeReason(line.reason),
                updated_by: user.id,
              },
            });
          } else {
            // Raw INSERT: the three snapshot columns are NOT NULL but filled by
            // trg_budget_lines_derive_snapshot, which Prisma's create() cannot express.
            await tx.$executeRaw`
              INSERT INTO fincore.budget_lines
                (version_id, branch_id, category_id, planned_amount_uzs, reason, created_by)
              VALUES (
                ${version.id}::uuid, ${line.branchId}::uuid, ${line.categoryId}::uuid,
                ${amount}, ${this.normalizeReason(line.reason)}, ${user.id}::uuid
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
          // Promotion happens atomically with the lines in saveLines. Creating
          // this as non-applicable avoids colliding with an older applicable
          // revision before that transaction can demote it.
          is_applicable: false,
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
              reason: true,
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
          reason: saved?.reason ?? null,
        };
      }),
    );

    const editorId =
      version?.lines.find((line) => line.updated_by)?.updated_by ?? version?.created_by;
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

  private normalizeReason(reason: string | null | undefined): string | null {
    const normalized = reason?.trim();
    return normalized ? normalized : null;
  }

  private combineReasons(branchPlans: BudgetHistoryBranchPlanDto[]): string | null {
    const withReason = branchPlans.filter(
      (plan): plan is BudgetHistoryBranchPlanDto & { reason: string } => Boolean(plan.reason),
    );
    if (withReason.length === 0) return null;
    const unique = [...new Set(withReason.map((plan) => plan.reason))];
    if (unique.length === 1) return unique[0]!;
    return withReason.map((plan) => `${plan.branchName}: ${plan.reason}`).join(' · ');
  }
}
