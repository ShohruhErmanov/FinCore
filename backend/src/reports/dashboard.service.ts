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
    averagePlannedMonthlyUzs: string;
    averagePlanMonthsCount: number;
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

export interface ExpensePlanAnalyticsResponse {
  period: {
    id: string;
    year: number;
    month: number;
    label: string;
  };
  branchFilter: string;
  hasPlan: boolean;
  summary: {
    fixedPlanUzs: string;
    variablePlanUzs: string;
    totalPlanUzs: string;
    branchCount: number;
  };
  branches: Array<{
    branchId: string;
    branchName: string;
    hasPlan: boolean;
    fixedPlanUzs: string;
    variablePlanUzs: string;
    totalPlanUzs: string;
  }>;
}

interface ExpenseAnalyticsBreakdown {
  amountUzs: string;
  transactionCount: number;
  sharePct: number | null;
}

export interface ExpenseAnalyticsResponse {
  filters: { from: string; to: string; branch: string };
  hasData: boolean;
  planComparison: {
    periodId: string;
    periodLabel: string;
    hasPlan: boolean;
    plannedAmountUzs: string;
    actualAmountUzs: string;
    varianceUzs: string;
    completionPct: number | null;
  };
  summary: {
    totalAmountUzs: string;
    transactionCount: number;
    fixed: ExpenseAnalyticsBreakdown;
    variable: ExpenseAnalyticsBreakdown;
  };
  paymentMethods: Array<ExpenseAnalyticsBreakdown & { id: string; code: string; name: string }>;
  branches: Array<{
    branchId: string;
    branchName: string;
    totalAmountUzs: string;
    transactionCount: number;
    fixedAmountUzs: string;
    variableAmountUzs: string;
    paymentMethods: Array<ExpenseAnalyticsBreakdown & { id: string; code: string; name: string }>;
  }>;
  categories: Array<
    ExpenseAnalyticsBreakdown & {
      categoryId: string;
      categoryCodeSnapshot: string;
      categoryNameSnapshot: string;
      expenseTypeSnapshot: 'fixed' | 'variable';
    }
  >;
  recentExpenses: Array<{
    id: string;
    transactionDate: string;
    description: string;
    categoryNameSnapshot: string;
    branchName: string;
    amountUzs: string;
    expenseTypeSnapshot: 'fixed' | 'variable';
    paymentMethodName: string;
  }>;
}

interface PeriodTotals {
  planned: bigint;
  actual: bigint;
}

interface ExpensePlanAggregateRow {
  branch_id: string;
  branch_name: string;
  expense_type_snapshot: 'fixed' | 'variable' | null;
  planned_amount_uzs: unknown;
  line_count: number;
}

interface ExpenseAnalyticsAggregateRow {
  branch_id: string;
  expense_type_snapshot: 'fixed' | 'variable';
  payment_method_id: string;
  amount_uzs: unknown;
  transaction_count: number;
}

interface ExpenseAnalyticsCategoryRow {
  category_id: string;
  category_code_snapshot: string;
  category_name_snapshot: string;
  expense_type_snapshot: 'fixed' | 'variable';
  amount_uzs: unknown;
  transaction_count: number;
}

interface ExpenseAnalyticsRecentRow {
  id: string;
  transaction_date: string;
  description: string;
  category_name_snapshot: string;
  branch_name: string;
  amount_uzs: unknown;
  expense_type_snapshot: 'fixed' | 'variable';
  payment_method_name: string;
}

interface ExpenseAnalyticsPlanRow {
  planned_amount_uzs: unknown;
  line_count: number;
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

  /**
   * Read-only Budget analytics. The applicable budget view is the single plan
   * source, while the snapshot type preserves the classification captured when
   * each budget line was written.
   */
  async getExpensePlanAnalytics(
    user: AuthenticatedUser,
    periodId: string,
    requestedBranch: string,
  ): Promise<ExpensePlanAnalyticsResponse> {
    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const branchIds = this.reports.scopeBranchIds(user, requestedBranch);
    const rows =
      branchIds.length === 0
        ? []
        : await this.prisma.db.$queryRaw<ExpensePlanAggregateRow[]>`
            SELECT b.id AS branch_id,
                   b.name AS branch_name,
                   plan.expense_type_snapshot,
                   coalesce(sum(plan.planned_amount_uzs), 0) AS planned_amount_uzs,
                   count(plan.category_id)::int AS line_count
            FROM fincore.branches b
            LEFT JOIN fincore.v_applicable_budget_line plan
              ON plan.branch_id = b.id
             AND plan.period_id = ${periodId}::uuid
            WHERE b.is_active
              AND b.id = ANY(${branchIds}::uuid[])
            GROUP BY b.id, b.code, b.name, plan.expense_type_snapshot
            ORDER BY b.code, plan.expense_type_snapshot
          `;

    const byBranch = new Map<
      string,
      { branchName: string; fixed: bigint; variable: bigint; hasPlan: boolean }
    >();
    for (const row of rows) {
      const aggregate = byBranch.get(row.branch_id) ?? {
        branchName: row.branch_name,
        fixed: 0n,
        variable: 0n,
        hasPlan: false,
      };
      if (row.line_count > 0 && row.expense_type_snapshot) {
        aggregate[row.expense_type_snapshot] += toBigInt(row.planned_amount_uzs);
        aggregate.hasPlan = true;
      }
      byBranch.set(row.branch_id, aggregate);
    }

    const branches = [...byBranch.entries()].map(([branchId, aggregate]) => ({
      branchId,
      branchName: aggregate.branchName,
      hasPlan: aggregate.hasPlan,
      fixedPlanUzs: toMoneyUzs(aggregate.fixed)!,
      variablePlanUzs: toMoneyUzs(aggregate.variable)!,
      totalPlanUzs: toMoneyUzs(aggregate.fixed + aggregate.variable)!,
    }));
    const fixed = branches.reduce((sum, branch) => sum + BigInt(branch.fixedPlanUzs), 0n);
    const variable = branches.reduce((sum, branch) => sum + BigInt(branch.variablePlanUzs), 0n);

    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        label: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
      },
      branchFilter: requestedBranch,
      hasPlan: branches.some((branch) => branch.hasPlan),
      summary: {
        fixedPlanUzs: toMoneyUzs(fixed)!,
        variablePlanUzs: toMoneyUzs(variable)!,
        totalPlanUzs: toMoneyUzs(fixed + variable)!,
        branchCount: branches.length,
      },
      branches,
    };
  }

  /** One filtered net-expense source feeds every section of the expense dashboard. */
  async getExpenseAnalytics(
    user: AuthenticatedUser,
    periodId: string,
    from: string,
    to: string,
    requestedBranch: string,
  ): Promise<ExpenseAnalyticsResponse> {
    if (from > to)
      throw new ApiException(
        422,
        'INVALID_DATE_RANGE',
        'Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas.',
      );

    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const branchIds = this.reports.scopeBranchIds(user, requestedBranch);
    if (branchIds.length === 0)
      return this.emptyExpenseAnalytics(from, to, requestedBranch, period);

    const [branches, paymentMethods, aggregateRows, categoryRows, recentRows, planRows] =
      await Promise.all([
        this.prisma.db.branches.findMany({
          where: { id: { in: branchIds }, is_active: true },
          select: { id: true, name: true },
          orderBy: { code: 'asc' },
        }),
        this.prisma.db.payment_methods.findMany({
          select: { id: true, code: true, name: true, sort_order: true, is_active: true },
          orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
        }),
        this.prisma.db.$queryRaw<ExpenseAnalyticsAggregateRow[]>`
        SELECT e.branch_id,
               e.expense_type_snapshot,
               e.payment_method_id,
               sum(e.amount_uzs) AS amount_uzs,
               count(*)::int AS transaction_count
        FROM fincore.v_expense_net_rows e
        JOIN fincore.branches b ON b.id = e.branch_id AND b.is_active
        WHERE e.transaction_date BETWEEN ${from}::date AND ${to}::date
          AND e.branch_id = ANY(${branchIds}::uuid[])
        GROUP BY e.branch_id, e.expense_type_snapshot, e.payment_method_id
      `,
        this.prisma.db.$queryRaw<ExpenseAnalyticsCategoryRow[]>`
        SELECT e.category_id,
               e.category_code_snapshot,
               e.category_name_snapshot,
               e.expense_type_snapshot,
               sum(e.amount_uzs) AS amount_uzs,
               count(*)::int AS transaction_count
        FROM fincore.v_expense_net_rows e
        JOIN fincore.branches b ON b.id = e.branch_id AND b.is_active
        WHERE e.transaction_date BETWEEN ${from}::date AND ${to}::date
          AND e.branch_id = ANY(${branchIds}::uuid[])
        GROUP BY e.category_id, e.category_code_snapshot,
                 e.category_name_snapshot, e.expense_type_snapshot
        ORDER BY amount_uzs DESC, e.category_name_snapshot
        LIMIT 8
      `,
        this.prisma.db.$queryRaw<ExpenseAnalyticsRecentRow[]>`
        SELECT e.id,
               to_char(e.transaction_date, 'YYYY-MM-DD') AS transaction_date,
               e.description,
               e.category_name_snapshot,
               b.name AS branch_name,
               e.amount_uzs,
               e.expense_type_snapshot,
               pm.name AS payment_method_name
        FROM fincore.v_expense_net_rows e
        JOIN fincore.branches b ON b.id = e.branch_id AND b.is_active
        JOIN fincore.payment_methods pm ON pm.id = e.payment_method_id
        WHERE e.transaction_date BETWEEN ${from}::date AND ${to}::date
          AND e.branch_id = ANY(${branchIds}::uuid[])
        ORDER BY e.transaction_date DESC, e.created_at DESC, e.id DESC
        LIMIT 10
      `,
        this.prisma.db.$queryRaw<ExpenseAnalyticsPlanRow[]>`
        SELECT coalesce(sum(planned_amount_uzs), 0) AS planned_amount_uzs,
               count(*)::int AS line_count
        FROM fincore.v_applicable_budget_line
        WHERE period_id = ${periodId}::uuid
          AND branch_id = ANY(${branchIds}::uuid[])
      `,
      ]);

    type MutableBreakdown = { amount: bigint; transactionCount: number };
    const emptyBreakdown = (): MutableBreakdown => ({ amount: 0n, transactionCount: 0 });
    const typeTotals = { fixed: emptyBreakdown(), variable: emptyBreakdown() };
    const paymentTotals = new Map(paymentMethods.map((method) => [method.id, emptyBreakdown()]));
    const branchTotals = new Map(
      branches.map((branch) => [
        branch.id,
        {
          branchName: branch.name,
          fixed: emptyBreakdown(),
          variable: emptyBreakdown(),
          paymentMethods: new Map(paymentMethods.map((method) => [method.id, emptyBreakdown()])),
        },
      ]),
    );

    for (const row of aggregateRows) {
      const amount = toBigInt(row.amount_uzs);
      typeTotals[row.expense_type_snapshot].amount += amount;
      typeTotals[row.expense_type_snapshot].transactionCount += row.transaction_count;
      const payment = paymentTotals.get(row.payment_method_id);
      if (payment) {
        payment.amount += amount;
        payment.transactionCount += row.transaction_count;
      }
      const branch = branchTotals.get(row.branch_id);
      if (!branch) continue;
      branch[row.expense_type_snapshot].amount += amount;
      branch[row.expense_type_snapshot].transactionCount += row.transaction_count;
      const branchPayment = branch.paymentMethods.get(row.payment_method_id);
      if (branchPayment) {
        branchPayment.amount += amount;
        branchPayment.transactionCount += row.transaction_count;
      }
    }

    const total = typeTotals.fixed.amount + typeTotals.variable.amount;
    const planned = toBigInt(planRows[0]?.planned_amount_uzs);
    const variance = planned - total;
    const transactionCount =
      typeTotals.fixed.transactionCount + typeTotals.variable.transactionCount;
    const breakdown = (value: MutableBreakdown, denominator: bigint) => ({
      amountUzs: toMoneyUzs(value.amount)!,
      transactionCount: value.transactionCount,
      sharePct: percentageValue(value.amount, denominator),
    });
    const paymentDtos = (values: Map<string, MutableBreakdown>, denominator: bigint) =>
      paymentMethods
        .filter((method) => method.is_active || (values.get(method.id)?.transactionCount ?? 0) > 0)
        .map((method) => ({
          id: method.id,
          code: method.code,
          name: method.name,
          ...breakdown(values.get(method.id) ?? emptyBreakdown(), denominator),
        }));

    return {
      filters: { from, to, branch: requestedBranch },
      hasData: transactionCount > 0,
      planComparison: {
        periodId: period.id,
        periodLabel: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
        hasPlan: (planRows[0]?.line_count ?? 0) > 0,
        plannedAmountUzs: toMoneyUzs(planned)!,
        actualAmountUzs: toMoneyUzs(total)!,
        varianceUzs: toMoneyUzs(variance)!,
        completionPct: percentageValue(total, planned),
      },
      summary: {
        totalAmountUzs: toMoneyUzs(total)!,
        transactionCount,
        fixed: breakdown(typeTotals.fixed, total),
        variable: breakdown(typeTotals.variable, total),
      },
      paymentMethods: paymentDtos(paymentTotals, total),
      branches: [...branchTotals.entries()].map(([branchId, value]) => {
        const branchTotal = value.fixed.amount + value.variable.amount;
        return {
          branchId,
          branchName: value.branchName,
          totalAmountUzs: toMoneyUzs(branchTotal)!,
          transactionCount: value.fixed.transactionCount + value.variable.transactionCount,
          fixedAmountUzs: toMoneyUzs(value.fixed.amount)!,
          variableAmountUzs: toMoneyUzs(value.variable.amount)!,
          paymentMethods: paymentDtos(value.paymentMethods, branchTotal),
        };
      }),
      categories: categoryRows.map((row) => ({
        categoryId: row.category_id,
        categoryCodeSnapshot: row.category_code_snapshot,
        categoryNameSnapshot: row.category_name_snapshot,
        expenseTypeSnapshot: row.expense_type_snapshot,
        ...breakdown(
          { amount: toBigInt(row.amount_uzs), transactionCount: row.transaction_count },
          total,
        ),
      })),
      recentExpenses: recentRows.map((row) => ({
        id: row.id,
        transactionDate: row.transaction_date,
        description: row.description,
        categoryNameSnapshot: row.category_name_snapshot,
        branchName: row.branch_name,
        amountUzs: toMoneyUzs(toBigInt(row.amount_uzs))!,
        expenseTypeSnapshot: row.expense_type_snapshot,
        paymentMethodName: row.payment_method_name,
      })),
    };
  }

  private emptyExpenseAnalytics(
    from: string,
    to: string,
    branch: string,
    period: { id: string; year: number; month: number },
  ): ExpenseAnalyticsResponse {
    const empty = { amountUzs: '0', transactionCount: 0, sharePct: null };
    return {
      filters: { from, to, branch },
      hasData: false,
      planComparison: {
        periodId: period.id,
        periodLabel: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
        hasPlan: false,
        plannedAmountUzs: '0',
        actualAmountUzs: '0',
        varianceUzs: '0',
        completionPct: null,
      },
      summary: { totalAmountUzs: '0', transactionCount: 0, fixed: empty, variable: empty },
      paymentMethods: [],
      branches: [],
      categories: [],
      recentExpenses: [],
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
  private async annualSummary(
    year: number,
    branchIds: string[],
  ): Promise<DashboardResponse['annual']> {
    const rows = await this.reports.annualMonths(year, branchIds);

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const forMonth = rows.filter((row) => Number(row.month) === month);
      const fixed = toBigInt(forMonth.find((row) => row.expense_type === 'fixed')?.actual_uzs);
      const variable = toBigInt(
        forMonth.find((row) => row.expense_type === 'variable')?.actual_uzs,
      );
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
    // Excel «O‘rtacha kiritilgan oylik reja» counts only months with a positive plan.
    const monthsWithPlan = months.filter((row) => BigInt(row.planUzs) > 0n);
    const plannedMonthsTotal = monthsWithPlan.reduce(
      (total, row) => total + BigInt(row.planUzs),
      0n,
    );
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
      averagePlannedMonthlyUzs: monthsWithPlan.length
        ? toMoneyUzs(plannedMonthsTotal / BigInt(monthsWithPlan.length))!
        : '0',
      averagePlanMonthsCount: monthsWithPlan.length,
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
      expense.push({
        bucket,
        label,
        planUzs: sum((row) => row.expensePlan),
        actualUzs: sum((row) => row.expenseActual),
      });
      revenue.push({
        bucket,
        label,
        planUzs: sum((row) => row.revenuePlan),
        actualUzs: sum((row) => row.revenueActual),
      });
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
    if (branchIds.length === 0)
      return { expense: empty, revenue: empty.map((point) => ({ ...point })) };

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
