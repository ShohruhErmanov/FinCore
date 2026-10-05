export const queryKeys = {
  me: ['me'] as const,
  branches: ['branches'] as const,
  periods: ['periods'] as const,
  master: (type: string) => ['master', type] as const,
  dashboard: (period: string, branch: string, granularity: string) =>
    ['dashboard', period, branch, granularity] as const,
  expensePlanAnalytics: (period: string, branch: string) =>
    ['expense-plan-analytics', period, branch] as const,
  expenseAnalytics: (period: string, from: string, to: string, branch: string) =>
    ['expense-analytics', period, from, to, branch] as const,
  expenses: (filters: string) => ['expenses', filters] as const,
  expense: (id: string) => ['expense', id] as const,
  budget: (periodId: string) => ['budget', periodId] as const,
  budgetHistory: (year: number | undefined) => ['budget-history', year ?? 'all'] as const,
  revenues: (filters: string) => ['revenues', filters] as const,
  revenue: (id: string) => ['revenue', id] as const,
  revenuePlan: (periodId: string) => ['revenue-plan', periodId] as const,
  // Under 'revenue-plan' so saving a month or posting revenue refreshes it too.
  revenuePlanYear: (year: number) => ['revenue-plan', 'year', year] as const,
  report: (name: string, filters: string) => ['report', name, filters] as const,
  userDirectory: ['user-directory'] as const,
  users: ['users'] as const,
};
