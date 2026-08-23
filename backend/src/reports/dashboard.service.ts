import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { PrismaService } from '@/database';
import { ReportsService } from './reports.service';
import {
  MONTHS_SHORT_UZ,
  MONTHS_UZ,
  daysInMonth,
  distributeDaily,
  percentageValue,
  toBigInt,
} from './report-math';

type Granularity = 'daily' | 'weekly' | 'monthly';

interface TrendPoint {
  bucket: string;
  label: string;
  planUzs: string;
  actualUzs: string;
}

export interface DashboardResponse {
  isDemo: boolean;
  period: {
    id: string;
    year: number;
    month: number;
    label: string;
    status: 'open' | 'closed';
    closedAt: string | null;
    closedByName: string | null;
  };
  branchId: string | null;
  granularity: Granularity;
  expensePlanUzs: string;
  expenseActualUzs: string;
  expenseVarianceUzs: string;
  expenseCompletionPct: number | null;
  fixedExpenseUzs: string;
  variableExpenseUzs: string;
  expenseTrend: TrendPoint[];
  revenuePlanUzs: string;
  revenueActualUzs: string;
  revenueVarianceUzs: string;
  revenueCompletionPct: number | null;
  revenueTrend: TrendPoint[];
  annual: {
    year: number;
    totalActualUzs: string;
    fixedActualUzs: string;
    variableActualUzs: string;
    fixedSharePct: number | null;
    totalPlanUzs: string;
    varianceUzs: string;
    averageMonthlyUzs: string;
    averageMonthsCount: number;
    peakMonth: { month: number; label: string; actualUzs: string } | null;
    months: Array<{
      month: number;
      label: string;
      fixedUzs: string;
      variableUzs: string;
      actualUzs: string;
      planUzs: string;
      varianceUzs: string;
      completionPct: number | null;
    }>;
  };
  branches: Array<{
    branchId: string;
    name: string;
    expensePlanUzs: string;
    expenseActualUzs: string;
    expenseCompletionPct: number | null;
    revenuePlanUzs: string;
    revenueActualUzs: string;
    revenueCompletionPct: number | null;
  }>;
}

interface PeriodTotals {
  planned: bigint;
  actual: bigint;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async get(
    user: AuthenticatedUser,
    periodId: string,
    requestedBranch: string,
    granularity: Granularity,
  ): Promise<DashboardResponse> {
    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true, status: true, closed_at: true, closed_by: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const branchId = requestedBranch === 'all' ? null : requestedBranch;
    const branchIds = this.reports.scopeBranchIds(user, requestedBranch);

    const branches = await this.prisma.db.branches.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });

    const [expense, revenue, byType, perBranch, annual, trends, closer] = await Promise.all([
      this.expenseTotals(period.id, branchIds),
      this.revenueTotals(period.id, branchIds),
      this.expenseByType(period.id, branchIds),
      this.perBranchTotals(period.id, branchIds),
      this.annualSummary(period.year, branchIds),
      this.buildTrends(granularity, period, branchIds),
      period.closed_by
        ? this.prisma.db.users.findUnique({
            where: { id: period.closed_by },
            select: { full_name: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      // Real backend, real rows — the mock is the only thing that says otherwise.
      isDemo: false,
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        label: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
        status: period.status,
        closedAt: toIsoDateTime(period.closed_at),
        closedByName: closer?.full_name ?? null,
      },
      branchId,
      granularity,
      expensePlanUzs: toMoneyUzs(expense.planned)!,
      expenseActualUzs: toMoneyUzs(expense.actual)!,
      expenseVarianceUzs: toMoneyUzs(expense.planned - expense.actual)!,
      expenseCompletionPct: percentageValue(expense.actual, expense.planned),
      fixedExpenseUzs: toMoneyUzs(byType.fixed)!,
      variableExpenseUzs: toMoneyUzs(byType.variable)!,
      expenseTrend: trends.expense,
      revenuePlanUzs: toMoneyUzs(revenue.planned)!,
      revenueActualUzs: toMoneyUzs(revenue.actual)!,
      revenueVarianceUzs: toMoneyUzs(revenue.actual - revenue.planned)!,
      revenueCompletionPct: percentageValue(revenue.actual, revenue.planned),
      revenueTrend: trends.revenue,
      annual,
      branches: branches.map((branch) => {
        const totals = perBranch.get(branch.id) ?? {
          expense: { planned: 0n, actual: 0n },
          revenue: { planned: 0n, actual: 0n },
        };
        return {
          branchId: branch.id,
          name: branch.name,
          expensePlanUzs: toMoneyUzs(totals.expense.planned)!,
          expenseActualUzs: toMoneyUzs(totals.expense.actual)!,
          expenseCompletionPct: percentageValue(totals.expense.actual, totals.expense.planned),
          revenuePlanUzs: toMoneyUzs(totals.revenue.planned)!,
          revenueActualUzs: toMoneyUzs(totals.revenue.actual)!,
          revenueCompletionPct: percentageValue(totals.revenue.actual, totals.revenue.planned),
        };
      }),
    };
  }

  // -------------------------------------------------------------------------

  private async expenseTotals(periodId: string, branchIds: string[]): Promise<PeriodTotals> {
    if (branchIds.length === 0) return { planned: 0n, actual: 0n };
    const [row] = await this.prisma.db.$queryRaw<Array<{ planned: unknown; actual: unknown }>>`
      SELECT coalesce(sum(planned_amount_uzs), 0) AS planned,
             coalesce(sum(actual_uzs), 0) AS actual
      FROM fincore.v_expense_plan_vs_actual
      WHERE period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
    `;
    return { planned: toBigInt(row?.planned), actual: toBigInt(row?.actual) };
  }

  private async revenueTotals(periodId: string, branchIds: string[]): Promise<PeriodTotals> {
    if (branchIds.length === 0) return { planned: 0n, actual: 0n };
    const [row] = await this.prisma.db.$queryRaw<Array<{ planned: unknown; actual: unknown }>>`
      SELECT coalesce(sum(planned_amount_uzs), 0) AS planned,
             coalesce(sum(actual_uzs), 0) AS actual
      FROM fincore.v_revenue_plan_vs_actual
      WHERE period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
    `;
    return { planned: toBigInt(row?.planned), actual: toBigInt(row?.actual) };
  }

  private async expenseByType(
    periodId: string,
    branchIds: string[],
  ): Promise<{ fixed: bigint; variable: bigint }> {
    if (branchIds.length === 0) return { fixed: 0n, variable: 0n };
    const rows = await this.prisma.db.$queryRaw<
      Array<{ expense_type: 'fixed' | 'variable'; actual: unknown }>
    >`
      SELECT expense_type_snapshot AS expense_type, coalesce(sum(amount_uzs), 0) AS actual
      FROM fincore.v_expense_net_rows
      WHERE accounting_period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY expense_type_snapshot
    `;
    return {
      fixed: toBigInt(rows.find((row) => row.expense_type === 'fixed')?.actual),
      variable: toBigInt(rows.find((row) => row.expense_type === 'variable')?.actual),
    };
  }

  private async perBranchTotals(periodId: string, branchIds: string[]) {
    const totals = new Map<string, { expense: PeriodTotals; revenue: PeriodTotals }>();
    if (branchIds.length === 0) return totals;

    const [expenseRows, revenueRows] = await Promise.all([
      this.prisma.db.$queryRaw<Array<{ branch_id: string; planned: unknown; actual: unknown }>>`
        SELECT branch_id, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_expense_plan_vs_actual
        WHERE period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY branch_id
      `,
      this.prisma.db.$queryRaw<Array<{ branch_id: string; planned: unknown; actual: unknown }>>`
        SELECT branch_id, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_revenue_plan_vs_actual
        WHERE period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY branch_id
      `,
    ]);

    for (const branchId of branchIds) {
      const expense = expenseRows.find((row) => row.branch_id === branchId);
      const revenue = revenueRows.find((row) => row.branch_id === branchId);
      totals.set(branchId, {
        expense: { planned: toBigInt(expense?.planned), actual: toBigInt(expense?.actual) },
        revenue: { planned: toBigInt(revenue?.planned), actual: toBigInt(revenue?.actual) },
      });
    }
    return totals;
  }

  /** Excel «Xulosa» sheet: yearly split, fixed share and the peak month. */
  private async annualSummary(year: number, branchIds: string[]): Promise<DashboardResponse['annual']> {
    const rows = await this.reports.annualMonths(year, branchIds);

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const forMonth = rows.filter((row) => Number(row.month) === month);
      const fixed = toBigInt(forMonth.find((row) => row.expense_type === 'fixed')?.actual_uzs);
      const variable = toBigInt(forMonth.find((row) => row.expense_type === 'variable')?.actual_uzs);
      const actual = fixed + variable;
      const plan = forMonth.reduce((total, row) => total + toBigInt(row.planned_amount_uzs), 0n);
      return {
        month,
        label: MONTHS_SHORT_UZ[index] ?? String(month),
        fixedUzs: toMoneyUzs(fixed)!,
        variableUzs: toMoneyUzs(variable)!,
        actualUzs: toMoneyUzs(actual)!,
        planUzs: toMoneyUzs(plan)!,
        varianceUzs: toMoneyUzs(plan - actual)!,
        completionPct: percentageValue(actual, plan),
      };
    });

    const totalActual = months.reduce((total, row) => total + BigInt(row.actualUzs), 0n);
    const fixedActual = months.reduce((total, row) => total + BigInt(row.fixedUzs), 0n);
    const totalPlan = months.reduce((total, row) => total + BigInt(row.planUzs), 0n);
    // Excel counts the average over months that actually have spending.
    const monthsWithActual = months.filter((row) => BigInt(row.actualUzs) > 0n);
    const peak = monthsWithActual.reduce<(typeof months)[number] | null>(
      (best, row) => (best === null || BigInt(row.actualUzs) > BigInt(best.actualUzs) ? row : best),
      null,
    );

    return {
      year,
      totalActualUzs: toMoneyUzs(totalActual)!,
      fixedActualUzs: toMoneyUzs(fixedActual)!,
      variableActualUzs: toMoneyUzs(totalActual - fixedActual)!,
      fixedSharePct: percentageValue(fixedActual, totalActual),
      totalPlanUzs: toMoneyUzs(totalPlan)!,
      varianceUzs: toMoneyUzs(totalPlan - totalActual)!,
      averageMonthlyUzs: monthsWithActual.length
        ? toMoneyUzs(totalActual / BigInt(monthsWithActual.length))!
        : '0',
      averageMonthsCount: monthsWithActual.length,
      peakMonth: peak ? { month: peak.month, label: peak.label, actualUzs: peak.actualUzs } : null,
      months,
    };
  }

  private async buildTrends(
    granularity: Granularity,
    period: { id: string; year: number; month: number },
    branchIds: string[],
  ): Promise<{ expense: TrendPoint[]; revenue: TrendPoint[] }> {
    if (granularity === 'monthly') return this.monthlyTrends(period.year, branchIds);

    const days = daysInMonth(period.year, period.month);
    const prefix = `${period.year}-${String(period.month).padStart(2, '0')}`;
    const [expenseTotals, revenueTotals, dailyExpense, dailyRevenue] = await Promise.all([
      this.expenseTotals(period.id, branchIds),
      this.revenueTotals(period.id, branchIds),
      this.dailyExpenseActuals(period.id, branchIds),
      this.dailyRevenueActuals(period.id, branchIds),
    ]);

    // The plan is monthly; the chart needs a per-day line, so it is spread evenly.
    const expensePlanDaily = distributeDaily(expenseTotals.planned, days);
    const revenuePlanDaily = distributeDaily(revenueTotals.planned, days);

    const rows = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const date = `${prefix}-${String(day).padStart(2, '0')}`;
      return {
        day,
        date,
        expensePlan: expensePlanDaily[index] ?? 0n,
        expenseActual: dailyExpense.get(date) ?? 0n,
        revenuePlan: revenuePlanDaily[index] ?? 0n,
        revenueActual: dailyRevenue.get(date) ?? 0n,
      };
    });

    if (granularity === 'daily')
      return {
        expense: rows.map((row) => ({
          bucket: row.date,
          label: String(row.day),
          planUzs: toMoneyUzs(row.expensePlan)!,
          actualUzs: toMoneyUzs(row.expenseActual)!,
        })),
        revenue: rows.map((row) => ({
          bucket: row.date,
          label: String(row.day),
          planUzs: toMoneyUzs(row.revenuePlan)!,
          actualUzs: toMoneyUzs(row.revenueActual)!,
        })),
      };

    const expense: TrendPoint[] = [];
    const revenue: TrendPoint[] = [];
    for (let start = 1, index = 0; start <= days; start += 7, index += 1) {
      const end = Math.min(start + 6, days);
      const week = rows.filter((row) => row.day >= start && row.day <= end);
      const bucket = `${prefix}-W${index + 1}`;
      const label = `${start}–${end}`;
      const sum = (pick: (row: (typeof rows)[number]) => bigint) =>
        toMoneyUzs(week.reduce((total, row) => total + pick(row), 0n))!;
      expense.push({ bucket, label, planUzs: sum((row) => row.expensePlan), actualUzs: sum((row) => row.expenseActual) });
      revenue.push({ bucket, label, planUzs: sum((row) => row.revenuePlan), actualUzs: sum((row) => row.revenueActual) });
    }
    return { expense, revenue };
  }

  private async monthlyTrends(year: number, branchIds: string[]) {
    const empty = Array.from({ length: 12 }, (_, index) => ({
      bucket: `${year}-${String(index + 1).padStart(2, '0')}`,
      label: MONTHS_SHORT_UZ[index] ?? String(index + 1),
      planUzs: '0',
      actualUzs: '0',
    }));
    if (branchIds.length === 0) return { expense: empty, revenue: empty.map((point) => ({ ...point })) };

    const [expenseRows, revenueRows] = await Promise.all([
      this.prisma.db.$queryRaw<Array<{ month: number; planned: unknown; actual: unknown }>>`
        SELECT month, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_monthly_expense_report
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY month
      `,
      this.prisma.db.$queryRaw<Array<{ month: number; planned: unknown; actual: unknown }>>`
        SELECT month, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_revenue_plan_vs_actual
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY month
      `,
    ]);

    const point = (rows: typeof expenseRows, index: number): TrendPoint => {
      const row = rows.find((candidate) => Number(candidate.month) === index + 1);
      return {
        bucket: `${year}-${String(index + 1).padStart(2, '0')}`,
        label: MONTHS_SHORT_UZ[index] ?? String(index + 1),
        planUzs: toMoneyUzs(toBigInt(row?.planned))!,
        actualUzs: toMoneyUzs(toBigInt(row?.actual))!,
      };
    };

    return {
      expense: Array.from({ length: 12 }, (_, index) => point(expenseRows, index)),
      revenue: Array.from({ length: 12 }, (_, index) => point(revenueRows, index)),
    };
  }

  private async dailyExpenseActuals(periodId: string, branchIds: string[]): Promise<Map<string, bigint>> {
    if (branchIds.length === 0) return new Map();
    const rows = await this.prisma.db.$queryRaw<Array<{ day: string; actual: unknown }>>`
      SELECT to_char(transaction_date, 'YYYY-MM-DD') AS day, coalesce(sum(amount_uzs), 0) AS actual
      FROM fincore.v_expense_net_rows
      WHERE accounting_period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY transaction_date
    `;
    return new Map(rows.map((row) => [row.day, toBigInt(row.actual)]));
  }

  private async dailyRevenueActuals(periodId: string, branchIds: string[]): Promise<Map<string, bigint>> {
    if (branchIds.length === 0) return new Map();
    const rows = await this.prisma.db.$queryRaw<Array<{ day: string; actual: unknown }>>`
      SELECT to_char(payment_business_date, 'YYYY-MM-DD') AS day, coalesce(sum(amount_uzs), 0) AS actual
      FROM fincore.v_revenue_net_rows
      WHERE accounting_period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY payment_business_date
    `;
    return new Map(rows.map((row) => [row.day, toBigInt(row.actual)]));
  }
}
