import type {
  AccountingPeriod,
  AuditEvent,
  AuthenticatedUser,
  Branch,
  BudgetRevisionCreateInput,
  BudgetVersion,
  CashierReportResponse,
  DashboardResponse,
  DataQualityPageResponse,
  DataQualityResolutionInput,
  Expense,
  ExpenseCategory,
  ImportJob,
  ExpenseCreateInput,
  MasterItem,
  MonthlyReport,
  PaginatedResponse,
  PeriodCloseReadiness,
  ProfitLossReport,
  ReconciliationResult,
  BranchComparisonReport,
  RoleCode,
  PermissionCode,
  RolePermissionMatrix,
  RevenueCreateInput,
  RevenuePlan,
  RevenuePlanSummary,
  RevenueReportResponse,
  RevenueTransaction,
  UserCreateInput,
  UserAccessUpdateInput,
  UserDirectoryItem,
  UserStatus,
} from '@/shared/types/domain';
import { api } from './client';

export const authApi = {
  me: (signal?: AbortSignal) => api.get<AuthenticatedUser>('/me', undefined, signal),
  login: (input: { login: string; password: string }) =>
    api.post<AuthenticatedUser>('/auth/login', input),
  logout: () => api.post<void>('/auth/logout'),
};

export const referenceApi = {
  branches: (signal?: AbortSignal) => api.get<Branch[]>('/branches', undefined, signal),
  periods: (signal?: AbortSignal) => api.get<AccountingPeriod[]>('/periods', undefined, signal),
  categories: (signal?: AbortSignal) =>
    api.get<ExpenseCategory[]>('/master/categories', undefined, signal),
  departments: (signal?: AbortSignal) =>
    api.get<MasterItem[]>('/master/departments', undefined, signal),
  paymentMethods: (signal?: AbortSignal) =>
    api.get<MasterItem[]>('/master/payment-methods', undefined, signal),
  users: (signal?: AbortSignal) =>
    api.get<UserDirectoryItem[]>('/users/directory', undefined, signal),
};

export const dashboardApi = {
  get: (query: { period: string; branch: string }, signal?: AbortSignal) =>
    api.get<DashboardResponse>('/reports/dashboard', query, signal),
};

export const reportApi = {
  monthly: (query: { year: string | number; branch: string }, signal?: AbortSignal) =>
    api.get<MonthlyReport>('/reports/monthly', query, signal),
  branchComparison: (query: { year: string | number }, signal?: AbortSignal) =>
    api.get<BranchComparisonReport>('/reports/branch-comparison', query, signal),
  profitLoss: (query: { period: string; branch: string }, signal?: AbortSignal) =>
    api.get<ProfitLossReport>('/reports/profit-loss', query, signal),
};

export const expenseApi = {
  list: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<PaginatedResponse<Expense>>('/expenses', query, signal),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<Expense>(`/expenses/${id}`, undefined, signal),
  create: (input: ExpenseCreateInput) => api.post<Expense>('/expenses', input),
  update: (id: string, input: Partial<ExpenseCreateInput>) =>
    api.patch<Expense>(`/expenses/${id}`, input),
  reverse: (id: string, reason: string) => api.post<Expense>(`/expenses/${id}/correct`, { reason }),
};

export const budgetApi = {
  list: (periodId: string, signal?: AbortSignal) =>
    api.get<BudgetVersion[]>(`/budget-periods/${periodId}/versions`, undefined, signal),
  createRevision: (periodId: string, input: BudgetRevisionCreateInput) =>
    api.post<BudgetVersion>(`/budget-periods/${periodId}/versions`, input),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<BudgetVersion>(`/budget-versions/${id}`, undefined, signal),
  saveLines: (
    id: string,
    lines: Array<
      Pick<
        BudgetVersion['lines'][number],
        'branchId' | 'categoryId' | 'plannedAmountUzs' | 'reason'
      >
    >,
  ) => api.put<BudgetVersion>(`/budget-versions/${id}/lines`, { lines }),
  submit: (id: string) => api.post<BudgetVersion>(`/budget-versions/${id}/submit`),
  approve: (id: string) => api.post<BudgetVersion>(`/budget-versions/${id}/approve`),
};

export const revenueApi = {
  plans: (periodId: string, signal?: AbortSignal) =>
    api.get<RevenuePlan[]>('/revenue-plans', { periodId }, signal),
  planSummary: (periodId: string, signal?: AbortSignal) =>
    api.get<RevenuePlanSummary>('/revenue-plans/summary', { periodId }, signal),
  plan: (id: string, signal?: AbortSignal) =>
    api.get<RevenuePlan>(`/revenue-plans/${id}`, undefined, signal),
  createPlan: (input: Partial<RevenuePlan>) => api.post<RevenuePlan>('/revenue-plans', input),
  updatePlan: (id: string, input: { plannedAmountUzs: string; reason: string }) =>
    api.patch<RevenuePlan>(`/revenue-plans/${id}`, input),
  submitPlan: (id: string) => api.post<RevenuePlan>(`/revenue-plans/${id}/submit`),
  approvePlan: (id: string) => api.post<RevenuePlan>(`/revenue-plans/${id}/approve`),
  transactions: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<PaginatedResponse<RevenueTransaction>>('/revenue-transactions', query, signal),
  transaction: (id: string, signal?: AbortSignal) =>
    api.get<RevenueTransaction>(`/revenue-transactions/${id}`, undefined, signal),
  create: (input: RevenueCreateInput) =>
    api.post<RevenueTransaction>('/revenue-transactions', input),
  reverse: (id: string, reason: string) =>
    api.post<RevenueTransaction>(`/revenue-transactions/${id}/reverse`, { reason }),
  report: (query: { periodId: string; branch: string }, signal?: AbortSignal) =>
    api.get<RevenueReportResponse>('/reports/revenue', query, signal),
  cashiers: (query: Record<string, string | undefined>, signal?: AbortSignal) =>
    api.get<CashierReportResponse>('/reports/cashiers', query, signal),
};

export const operationsApi = {
  exceptions: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<DataQualityPageResponse>('/reports/data-quality', query, signal),
  reconciliations: (signal?: AbortSignal) =>
    api.get<ReconciliationResult[]>('/reconciliations', undefined, signal),
  latestImport: (signal?: AbortSignal) => api.get<ImportJob>('/imports/latest', undefined, signal),
  runLegacyImport: () => api.post<ImportJob>('/imports/legacy-normalize'),
  resolveException: (id: string, input: DataQualityResolutionInput) =>
    api.post<DataQualityPageResponse['items'][number]>(`/data-quality-exceptions/${id}/resolve`, {
      ...input,
    }),
  readiness: (periodId: string, signal?: AbortSignal) =>
    api.get<PeriodCloseReadiness>(`/periods/${periodId}/readiness`, undefined, signal),
  close: (periodId: string, note: string) =>
    api.post<PeriodCloseReadiness>(`/periods/${periodId}/close`, { note }),
  reopen: (periodId: string, reason: string) =>
    api.post<PeriodCloseReadiness>(`/periods/${periodId}/reopen`, { reason }),
  audit: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<PaginatedResponse<AuditEvent>>('/audit-logs', query, signal),
};

type MasterResource = 'categories' | 'departments' | 'payment-methods';
type MasterResponse = ExpenseCategory | MasterItem | Branch;

export const adminApi = {
  createMaster: <T extends MasterResponse>(resource: MasterResource, input: object) =>
    api.post<T>(`/master/${resource}`, input),
  updateMaster: <T extends MasterResponse>(resource: MasterResource, id: string, input: object) =>
    api.patch<T>(`/master/${resource}/${id}`, input),
  rolePermissions: (signal?: AbortSignal) =>
    api.get<RolePermissionMatrix>('/roles/permissions', undefined, signal),
  updateRolePermissions: (role: RoleCode, permissions: PermissionCode[]) =>
    api.put<{ role: RoleCode; permissions: PermissionCode[] }>(`/roles/${role}/permissions`, {
      permissions,
    }),
  users: (signal?: AbortSignal) => api.get<AuthenticatedUser[]>('/admin/users', undefined, signal),
  createUser: (input: UserCreateInput) => api.post<AuthenticatedUser>('/users', input),
  updateUserAccess: (id: string, input: UserAccessUpdateInput) =>
    api.put<AuthenticatedUser>(`/users/${id}/access`, input),
  updateUserStatus: (id: string, status: UserStatus) =>
    api.patch<AuthenticatedUser>(`/users/${id}/status`, { status }),
};
