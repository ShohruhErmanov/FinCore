import type { AnnualRevenue } from './annual-revenue';
import type { AnnualNetProfit } from './net-profit';
import type { RevenueGrowth } from './revenue-growth';

/** Wire shapes of the dashboard and expense-analytics endpoints. */

export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface TrendPoint {
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
  annualRevenue: AnnualRevenue;
  revenueGrowth: RevenueGrowth;
  /**
   * Company profit is deliberately absent for operational-only roles such as
   * Cashier. Optionality is part of the wire contract: clients must not infer
   * authorization from zeroes or receive a redacted object that still leaks
   * payment-method/monthly profit structure.
   */
  annualNetProfit?: AnnualNetProfit & { netMarginPct: number | null };
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

export interface ExpenseAnalyticsBreakdown {
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
