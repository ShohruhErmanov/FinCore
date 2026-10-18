import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { periodLabelUz } from '@/common/calendar';
import { toMoneyUzs } from '@/common/serialization/financial';
import { PrismaService } from '@/database';
import type { ExpenseAnalyticsResponse, ExpensePlanAnalyticsResponse } from './dashboard.types';
import { percentageValue, toBigInt } from './report-math';
import { ReportsService } from './reports.service';

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

/** The read-only expense dashboards: the budget plan and the spending behind it. */
@Injectable()
export class ExpenseAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

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
    if (!period) throw ApiException.periodNotFound();

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
        label: periodLabelUz(period.year, period.month),
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
    if (!period) throw ApiException.periodNotFound();

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
        periodLabel: periodLabelUz(period.year, period.month),
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
        periodLabel: periodLabelUz(period.year, period.month),
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
}
