import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';
import { MONTHS_UZ, daysInMonth, percentageValue, toBigInt } from '@/reports/report-math';
import type { RevenuePlanLineInputDto } from './dto/revenue-plan.dto';

/** Mirrors RevenuePlanLine / RevenuePlanBoard (src/shared/types/domain.ts:257-277). */
export interface RevenuePlanLineDto {
  id: string;
  branchId: string;
  branchName: string;
  plannedAmountUzs: string | null;
  actualAmountUzs: string;
  varianceUzs: string | null;
  completionPercent: number | null;
  hasPlan: boolean;
  dailyPlanUzs: string | null;
}

export interface RevenuePlanBoardDto {
  id: string;
  periodId: string;
  periodLabel: string;
  daysInMonth: number;
  updatedAt: string;
  updatedByName: string;
  lines: RevenuePlanLineDto[];
}

interface PlanVsActualRow {
  branch_id: string;
  branch_name: string;
  planned_amount_uzs: unknown;
  actual_uzs: unknown;
}

@Injectable()
export class RevenuePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async get(periodId: string): Promise<RevenuePlanBoardDto> {
    const period = await this.requirePeriod(periodId);
    return this.build(period);
  }

  /**
   * Replaces the whole period's plan set, exactly as the mock does: a branch
   * sent with null — or left out of the payload entirely — ends up with no
   * plan, which is not the same as a plan of zero.
   */
  async savePlan(
    user: AuthenticatedUser,
    periodId: string,
    lines: RevenuePlanLineInputDto[],
  ): Promise<RevenuePlanBoardDto> {
    const period = await this.requirePeriod(periodId);
    if (period.status === 'closed')
      throw new ApiException(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tahrirlanmaydi.');

    const branches = await this.prisma.db.branches.findMany({
      where: { is_active: true },
      select: { id: true },
    });
    const known = new Set(branches.map((branch) => branch.id));
    for (const line of lines)
      if (!known.has(line.branchId))
        throw new ApiException(422, 'REFERENCE_INVALID', 'Filial topilmadi.');

    const wanted = new Map(
      lines
        .filter((line) => line.plannedAmountUzs !== null)
        .map((line) => [line.branchId, BigInt(line.plannedAmountUzs!)] as const),
    );

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        const existing = await tx.revenue_plans.findMany({
          where: { period_id: periodId, is_applicable: true },
          select: { id: true, branch_id: true, revision_no: true, status: true },
        });

        for (const branchId of known) {
          const amount = wanted.get(branchId);
          const current = existing.find((row) => row.branch_id === branchId);

          if (amount === undefined) {
            // Cleared: the row is removed so v_applicable_revenue_plan stops
            // reporting a plan for this branch. The guard only permits deleting
            // a draft, which is the only state this endpoint ever creates.
            if (current) await tx.revenue_plans.delete({ where: { id: current.id } });
            continue;
          }

          if (current) {
            await tx.revenue_plans.update({
              where: { id: current.id },
              data: { planned_amount_uzs: amount },
            });
            continue;
          }

          const last = await tx.revenue_plans.findFirst({
            where: { period_id: periodId, branch_id: branchId },
            select: { revision_no: true },
            orderBy: { revision_no: 'desc' },
          });
          await tx.revenue_plans.create({
            data: {
              period_id: periodId,
              branch_id: branchId,
              revision_no: (last?.revision_no ?? 0) + 1,
              planned_amount_uzs: amount,
              created_by: user.id,
              // draft keeps the row editable (trg_revenue_plans_guard);
              // is_applicable is what v_applicable_revenue_plan filters on, and
              // the frontend has no approval step for revenue plans.
              is_applicable: true,
            },
            select: { id: true },
          });
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

  private async build(period: {
    id: string;
    year: number;
    month: number;
  }): Promise<RevenuePlanBoardDto> {
    const days = daysInMonth(period.year, period.month);

    // One sanctioned view supplies both sides: it cross-joins active branches
    // with the period, so a branch with no plan still yields a row.
    const [rows, planIds, latest] = await Promise.all([
      this.prisma.db.$queryRaw<PlanVsActualRow[]>`
        SELECT branch_id, branch_name, planned_amount_uzs, actual_uzs
        FROM fincore.v_revenue_plan_vs_actual
        WHERE period_id = ${period.id}::uuid
        ORDER BY branch_name
      `,
      this.prisma.db.revenue_plans.findMany({
        where: { period_id: period.id, is_applicable: true },
        select: { id: true, branch_id: true },
      }),
      this.prisma.db.revenue_plans.findFirst({
        where: { period_id: period.id },
        select: { updated_at: true, created_by: true },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    const planIdByBranch = new Map(planIds.map((row) => [row.branch_id, row.id] as const));
    const editor = latest?.created_by
      ? await this.prisma.db.users.findUnique({
          where: { id: latest.created_by },
          select: { full_name: true },
        })
      : null;

    const lines: RevenuePlanLineDto[] = rows.map((row) => {
      const hasPlan = row.planned_amount_uzs !== null && row.planned_amount_uzs !== undefined;
      const planned = hasPlan ? toBigInt(row.planned_amount_uzs) : null;
      const actual = toBigInt(row.actual_uzs);
      return {
        id: planIdByBranch.get(row.branch_id) ?? `rp-${period.id}-${row.branch_id}`,
        branchId: row.branch_id,
        branchName: row.branch_name,
        plannedAmountUzs: planned === null ? null : toMoneyUzs(planned),
        actualAmountUzs: toMoneyUzs(actual)!,
        varianceUzs: planned === null ? null : toMoneyUzs(planned - actual),
        completionPercent: planned === null ? null : percentageValue(actual, planned),
        hasPlan,
        // The board shows an evenly spread daily target; integer division keeps
        // it in whole so'm, matching the mock.
        dailyPlanUzs: planned === null ? null : toMoneyUzs(planned / BigInt(days)),
      };
    });

    return {
      id: `revenue-plan-${period.id}`,
      periodId: period.id,
      periodLabel: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
      daysInMonth: days,
      updatedAt: toIsoDateTime(latest?.updated_at ?? new Date())!,
      updatedByName: editor?.full_name ?? '',
      lines,
    };
  }

  private translateWriteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/period is closed/i.test(message))
      return new ApiException(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tahrirlanmaydi.');
    if (/only draft revenue plans may be deleted|immutable outside a recognized state/i.test(message))
      return new ApiException(
        409,
        'REVENUE_PLAN_LOCKED',
        'Tushum rejasi tasdiqlangan va tahrirlanmaydi.',
      );
    if (/foreign key|violates/i.test(message))
      return new ApiException(422, 'REFERENCE_INVALID', 'Filial yoki davr topilmadi.');
    if (/actor context|signing key/i.test(message))
      return new ApiException(500, 'ACTOR_CONTEXT_INVALID', 'Server identifikatsiya konteksti noto‘g‘ri.');
    return error;
  }
}
