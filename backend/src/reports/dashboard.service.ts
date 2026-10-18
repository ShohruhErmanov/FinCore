import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { buildAnnualRevenue, netMarginPct, type MonthlyRevenueRow } from './annual-revenue';
import {
  buildAnnualNetProfit,
  buildNetProfitPaymentMethodBreakdown,
  type NetProfitPaymentMethodInput,
} from './net-profit';
import { buildRevenueGrowth, monthlyGrowthSpans, type MonthlyGrowthSpans } from './revenue-growth';
import { periodLabelUz } from '@/common/calendar';
import { PrismaService } from '@/database';
import { buildAnnualExpenseSummary } from './annual-expense-summary';
import {
  buildDayTrends,
  buildMonthTrends,
  type DashboardTrends,
  type MonthTotalsRow,
} from './dashboard-trends';
import type { DashboardResponse, Granularity } from './dashboard.types';
import { ReportsService } from './reports.service';
import { percentageValue, toBigInt } from './report-math';

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
    if (!period) throw ApiException.periodNotFound();

    const branchId = requestedBranch === 'all' ? null : requestedBranch;
    const branchIds = this.reports.scopeBranchIds(user, requestedBranch);

    const branches = await this.prisma.db.branches.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });

    const canViewNetProfit = this.canViewNetProfit(user);
    const [
      expense,
      revenue,
      byType,
      perBranch,
      annual,
      monthlyRevenue,
      paymentMethodNetProfitRows,
      growthSpans,
      trends,
      closer,
    ] = await Promise.all([
      this.expenseTotals(period.id, branchIds),
      this.revenueTotals(period.id, branchIds),
      this.expenseByType(period.id, branchIds),
      this.perBranchTotals(period.id, branchIds),
      this.annualSummary(period.year, branchIds),
      this.monthlyRevenue(period.year, branchIds),
      canViewNetProfit
        ? this.annualNetProfitByPaymentMethod(period.year, branchIds)
        : Promise.resolve([]),
      this.revenueBetween(monthlyGrowthSpans(period.year, period.month), branchIds),
      this.buildTrends(granularity, period, branchIds),
      period.closed_by
        ? this.prisma.db.users.findUnique({
            where: { id: period.closed_by },
            select: { full_name: true },
          })
        : Promise.resolve(null),
    ]);

    const annualRevenue = buildAnnualRevenue(
      period.year,
      monthlyRevenue.byMonth,
      monthlyRevenue.previousYearTotal,
    );
    let annualNetProfit: DashboardResponse['annualNetProfit'];
    if (canViewNetProfit) {
      const netProfit = buildAnnualNetProfit(
        period.year,
        new Map([...monthlyRevenue.byMonth].map(([month, row]) => [month, row.actual])),
        new Map(annual.months.map((row) => [row.month, BigInt(row.actualUzs)])),
      );
      const paymentMethodBreakdown = buildNetProfitPaymentMethodBreakdown(
        paymentMethodNetProfitRows,
      );
      const paymentMethodTotal = paymentMethodBreakdown.paymentMethods.reduce(
        (total, method) => total + BigInt(method.netProfitUzs),
        0n,
      );
      const monthsReconcile = netProfit.months.every(
        (month) =>
          paymentMethodBreakdown.paymentMethodMonths.find((row) => row.month === month.month)
            ?.totalNetProfitUzs === month.netProfitUzs,
      );
      if (paymentMethodTotal !== BigInt(netProfit.totalNetProfitUzs) || !monthsReconcile)
        throw new ApiException(
          500,
          'REPORT_RECONCILIATION_FAILED',
          'Sof foyda to‘lov usullari bo‘yicha yillik jami bilan mos kelmadi.',
        );

      annualNetProfit = {
        ...netProfit,
        ...paymentMethodBreakdown,
        netMarginPct: netMarginPct(
          BigInt(netProfit.totalNetProfitUzs),
          BigInt(annualRevenue.totalActualUzs),
        ),
      };
    }

    return {
      isDemo: false,
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        label: periodLabelUz(period.year, period.month),
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
      annualRevenue,
      revenueGrowth: buildRevenueGrowth(
        monthlyGrowthSpans(period.year, period.month),
        growthSpans,
        {
          year: period.year,
          current: BigInt(annualRevenue.totalActualUzs),
          previous: monthlyRevenue.previousYearTotal,
        },
      ),
      // Omit the property entirely for Cashier. Sending zero/null/redacted
      // subfields would still disclose the existence and shape of a protected
      // company-profit aggregate in DevTools Network.
      ...(annualNetProfit ? { annualNetProfit } : {}),
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

  /**
   * Existing role policy without a schema change. Finance Manager may also
   * carry a secondary Cashier assignment; an allow-list preserves that
   * legitimate management access while a pure Cashier remains denied.
   * Investor profit-share is intentionally unrelated and is not listed here.
   */
  private canViewNetProfit(user: AuthenticatedUser): boolean {
    return user.roles.some((assignment) =>
      ['director', 'business_owner', 'finance_manager'].includes(assignment.role),
    );
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

  /**
   * Actual revenue per month for a year, scoped to the branches the reader may
   * see. The expense side is already loaded by annualSummary, so the two are
   * combined in memory rather than queried together.
   */
  private async monthlyRevenue(
    year: number,
    branchIds: string[],
  ): Promise<{ byMonth: Map<number, MonthlyRevenueRow>; previousYearTotal: bigint }> {
    if (branchIds.length === 0) return { byMonth: new Map(), previousYearTotal: 0n };
    // Two years in one pass: the previous one is only needed as a total, so a
    // second query would be a round trip for a single number.
    const rows = await this.prisma.db.$queryRaw<
      Array<{ year: number; month: number; actual: unknown; planned: unknown }>
    >`
      SELECT year, month,
             coalesce(sum(actual_uzs), 0) AS actual,
             coalesce(sum(planned_amount_uzs), 0) AS planned
      FROM fincore.v_revenue_plan_vs_actual
      WHERE year IN (${year}, ${year - 1}) AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY year, month
    `;

    const byMonth = new Map<number, MonthlyRevenueRow>();
    let previousYearTotal = 0n;
    for (const row of rows) {
      if (Number(row.year) === year)
        byMonth.set(Number(row.month), {
          actual: toBigInt(row.actual),
          planned: toBigInt(row.planned),
        });
      else previousYearTotal += toBigInt(row.actual);
    }
    return { byMonth, previousYearTotal };
  }

  /**
   * Annual net profit split by the payment-method foreign key shared by both
   * ledgers. Revenue and expense are aggregated in one database round trip;
   * generate_series guarantees twelve cells for every real reference method.
   */
  private async annualNetProfitByPaymentMethod(
    year: number,
    branchIds: string[],
  ): Promise<NetProfitPaymentMethodInput[]> {
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;
    const rows = await this.prisma.db.$queryRaw<
      Array<{
        payment_method_id: string;
        code: string;
        name: string;
        sort_order: number;
        month: number;
        revenue_uzs: unknown;
        expense_uzs: unknown;
      }>
    >`
      WITH method_months AS (
        SELECT pm.id AS payment_method_id, pm.code, pm.name, pm.sort_order,
               month_number::int AS month
        FROM fincore.payment_methods pm
        CROSS JOIN generate_series(1, 12) AS month_number
      ),
      revenue AS (
        SELECT payment_method_id,
               EXTRACT(MONTH FROM payment_business_date)::int AS month,
               SUM(amount_uzs) AS amount_uzs
        FROM fincore.v_revenue_net_rows
        WHERE payment_business_date >= ${from}::date
          AND payment_business_date < ${to}::date
          AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY payment_method_id, EXTRACT(MONTH FROM payment_business_date)
      ),
      expense AS (
        SELECT payment_method_id,
               EXTRACT(MONTH FROM transaction_date)::int AS month,
               SUM(amount_uzs) AS amount_uzs
        FROM fincore.v_expense_net_rows
        WHERE transaction_date >= ${from}::date
          AND transaction_date < ${to}::date
          AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY payment_method_id, EXTRACT(MONTH FROM transaction_date)
      )
      SELECT mm.payment_method_id, mm.code, mm.name, mm.sort_order, mm.month,
             COALESCE(r.amount_uzs, 0) AS revenue_uzs,
             COALESCE(e.amount_uzs, 0) AS expense_uzs
      FROM method_months mm
      LEFT JOIN revenue r
        ON r.payment_method_id = mm.payment_method_id AND r.month = mm.month
      LEFT JOIN expense e
        ON e.payment_method_id = mm.payment_method_id AND e.month = mm.month
      ORDER BY mm.sort_order, mm.code, mm.month
    `;

    return rows.map((row) => ({
      paymentMethodId: row.payment_method_id,
      code: row.code,
      name: row.name,
      sortOrder: Number(row.sort_order),
      month: Number(row.month),
      revenue: toBigInt(row.revenue_uzs),
      expense: toBigInt(row.expense_uzs),
    }));
  }

  /**
   * Revenue inside two date ranges, in one round trip.
   *
   * v_revenue_net_rows carries the business date, so a month still running can
   * be compared against the same days of the month before it. The monthly
   * aggregate views cannot answer this — they only know whole months.
   */
  private async revenueBetween(
    spans: MonthlyGrowthSpans,
    branchIds: string[],
  ): Promise<{ current: bigint; previous: bigint }> {
    if (branchIds.length === 0) return { current: 0n, previous: 0n };
    const [row] = await this.prisma.db.$queryRaw<Array<{ current: unknown; previous: unknown }>>`
      SELECT
        coalesce(sum(amount_uzs) FILTER (
          WHERE payment_business_date BETWEEN ${spans.current.from}::date AND ${spans.current.to}::date
        ), 0) AS current,
        coalesce(sum(amount_uzs) FILTER (
          WHERE payment_business_date BETWEEN ${spans.previous.from}::date AND ${spans.previous.to}::date
        ), 0) AS previous
      FROM fincore.v_revenue_net_rows
      WHERE branch_id = ANY(${branchIds}::uuid[])
    `;
    return { current: toBigInt(row?.current), previous: toBigInt(row?.previous) };
  }

  /** Excel «Xulosa» sheet: yearly split, fixed share and the peak month. */
  private async annualSummary(
    year: number,
    branchIds: string[],
  ): Promise<DashboardResponse['annual']> {
    return buildAnnualExpenseSummary(year, await this.reports.annualMonths(year, branchIds));
  }

  private async buildTrends(
    granularity: Granularity,
    period: { id: string; year: number; month: number },
    branchIds: string[],
  ): Promise<DashboardTrends> {
    if (granularity === 'monthly') return this.monthlyTrends(period.year, branchIds);

    const [expenseTotals, revenueTotals, expenseByDay, revenueByDay] = await Promise.all([
      this.expenseTotals(period.id, branchIds),
      this.revenueTotals(period.id, branchIds),
      this.dailyExpenseActuals(period.id, branchIds),
      this.dailyRevenueActuals(period.id, branchIds),
    ]);
    return buildDayTrends(granularity, {
      year: period.year,
      month: period.month,
      expensePlanned: expenseTotals.planned,
      revenuePlanned: revenueTotals.planned,
      expenseByDay,
      revenueByDay,
    });
  }

  private async monthlyTrends(year: number, branchIds: string[]): Promise<DashboardTrends> {
    if (branchIds.length === 0) return buildMonthTrends(year, [], []);

    const [expenseRows, revenueRows] = await Promise.all([
      this.prisma.db.$queryRaw<MonthTotalsRow[]>`
        SELECT month, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_monthly_expense_report
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY month
      `,
      this.prisma.db.$queryRaw<MonthTotalsRow[]>`
        SELECT month, coalesce(sum(planned_amount_uzs), 0) AS planned,
               coalesce(sum(actual_uzs), 0) AS actual
        FROM fincore.v_revenue_plan_vs_actual
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY month
      `,
    ]);
    return buildMonthTrends(year, expenseRows, revenueRows);
  }

  private async dailyExpenseActuals(
    periodId: string,
    branchIds: string[],
  ): Promise<Map<string, bigint>> {
    if (branchIds.length === 0) return new Map();
    const rows = await this.prisma.db.$queryRaw<Array<{ day: string; actual: unknown }>>`
      SELECT to_char(transaction_date, 'YYYY-MM-DD') AS day, coalesce(sum(amount_uzs), 0) AS actual
      FROM fincore.v_expense_net_rows
      WHERE accounting_period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY transaction_date
    `;
    return new Map(rows.map((row) => [row.day, toBigInt(row.actual)]));
  }

  private async dailyRevenueActuals(
    periodId: string,
    branchIds: string[],
  ): Promise<Map<string, bigint>> {
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
