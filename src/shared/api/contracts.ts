import type {
  AccountingPeriod,
  AuthenticatedUser,
  Branch,
  BudgetLine,
  BudgetPlan,
  DailyRevenue,
  DailyRevenueInput,
  DashboardResponse,
  Expense,
  ExpenseCategory,
  ExpenseCreateInput,
  ImportSummary,
  MasterItem,
  MonthlyReport,
  MonthlyReportPreview,
  ReminderPreview,
  TelegramSettings,
  TelegramSettingsInput,
  TelegramLinkStatus,
  TelegramLinkCreated,
  MoneyUzs,
  PaginatedResponse,
  BranchComparisonReport,
  RevenuePlanBoard,
  RoleCode,
  PermissionCode,
  RolePermissionMatrix,
  TrendGranularity,
  UserCreateInput,
  UserAccessUpdateInput,
  UserDirectoryItem,
  UserStatus,
} from '@/shared/types/domain';
import type { CashierReport } from '@/features/reports/cashier-report';
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
  get: (
    query: { period: string; branch: string; granularity: TrendGranularity },
    signal?: AbortSignal,
  ) => api.get<DashboardResponse>('/reports/dashboard', query, signal),
};

export const reportApi = {
  monthly: (query: { year: string | number; branch: string }, signal?: AbortSignal) =>
    api.get<MonthlyReport>('/reports/monthly', query, signal),
  branchComparison: (query: { year: string | number }, signal?: AbortSignal) =>
    api.get<BranchComparisonReport>('/reports/branch-comparison', query, signal),
  cashiers: (query: { period: string; branch: string }, signal?: AbortSignal) =>
    api.get<CashierReport>('/reports/cashiers', query, signal),
};

export const expenseApi = {
  list: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<PaginatedResponse<Expense>>('/expenses', query, signal),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<Expense>(`/expenses/${id}`, undefined, signal),
  create: (input: ExpenseCreateInput) => api.post<Expense>('/expenses', input),
  update: (id: string, input: Partial<ExpenseCreateInput>) =>
    api.patch<Expense>(`/expenses/${id}`, input),
};

export const budgetApi = {
  get: (periodId: string, signal?: AbortSignal) =>
    api.get<BudgetPlan>(`/budget-plans/${periodId}`, undefined, signal),
  saveLines: (
    periodId: string,
    lines: Array<Pick<BudgetLine, 'branchId' | 'categoryId' | 'plannedAmountUzs'>>,
  ) => api.put<BudgetPlan>(`/budget-plans/${periodId}/lines`, { lines }),
};

export const notificationApi = {
  settings: (signal?: AbortSignal) =>
    api.get<TelegramSettings>('/notifications/telegram', undefined, signal),
  saveSettings: (input: TelegramSettingsInput) =>
    api.put<TelegramSettings>('/notifications/telegram', input),
  reminderPreview: (date: string, signal?: AbortSignal) =>
    api.get<ReminderPreview>('/notifications/reminder-preview', { date }, signal),
  monthlyPreview: (period: string, signal?: AbortSignal) =>
    api.get<MonthlyReportPreview>('/notifications/monthly-preview', { period }, signal),
  /** No destination: the backend always sends to the caller's own verified chat. */
  sendTest: () =>
    api.post<{ delivered: boolean; note: string }>('/notifications/telegram/test', {}),

  /**
   * Self-service Telegram linking. The deep link is returned once and is never
   * stored — the frontend hands it straight to the user and forgets it.
   */
  linkStatus: (signal?: AbortSignal) =>
    api.get<TelegramLinkStatus>('/notifications/telegram/link', undefined, signal),
  createLink: () => api.post<TelegramLinkCreated>('/notifications/telegram/link', {}),
  unlink: () => api.delete<void>('/notifications/telegram/link'),
};

export const importApi = {
  expenses: (rows: unknown[]) => api.post<ImportSummary>('/imports/expenses', { rows }),
};

export const revenueApi = {
  list: (query: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    api.get<PaginatedResponse<DailyRevenue>>('/daily-revenues', query, signal),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<DailyRevenue>(`/daily-revenues/${id}`, undefined, signal),
  create: (input: DailyRevenueInput) => api.post<DailyRevenue>('/daily-revenues', input),
  update: (id: string, input: Partial<DailyRevenueInput>) =>
    api.patch<DailyRevenue>(`/daily-revenues/${id}`, input),
  plan: (periodId: string, signal?: AbortSignal) =>
    api.get<RevenuePlanBoard>(`/revenue-plans/${periodId}`, undefined, signal),
  savePlan: (periodId: string, lines: Array<{ branchId: string; plannedAmountUzs: MoneyUzs | null }>) =>
    api.put<RevenuePlanBoard>(`/revenue-plans/${periodId}`, { lines }),
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
  updateUserSalary: (id: string, fixedSalaryUzs: MoneyUzs) =>
    api.patch<AuthenticatedUser>(`/users/${id}/salary`, { fixedSalaryUzs }),
  updateUserStatus: (id: string, status: UserStatus) =>
    api.patch<AuthenticatedUser>(`/users/${id}/status`, { status }),
  deleteUser: (id: string) => api.delete<void>(`/users/${id}`),
};
