import type {
  AccountingPeriod,
  AuditLogPage,
  AuthenticatedUser,
  Branch,
  BudgetLine,
  BudgetHistory,
  BudgetPlan,
  DailyRevenue,
  DailyRevenueInput,
  DashboardResponse,
  Expense,
  ExpenseAnalytics,
  ExpenseCategory,
  ExpenseCreateInput,
  ExpensePlanAnalytics,
  CategoryBaselineBoard,
  CategoryBaselineInput,
  ImportSummary,
  InvestorCreateInput,
  InvestorDashboard,
  InvestorEntitlementInput,
  InvestorListItem,
  InvestorPaymentInput,
  InvestorRef,
  PayoutListItem,
  PayoutRequestInput,
  PayoutRequestRow,
  PayoutSummary,
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
  createAccountingYear: (year: number) => api.post<AccountingPeriod[]>('/periods/years', { year }),
  categories: (signal?: AbortSignal) =>
    api.get<ExpenseCategory[]>('/master/categories', undefined, signal),
  departments: (signal?: AbortSignal) =>
    api.get<MasterItem[]>('/master/departments', undefined, signal),
  paymentMethods: (signal?: AbortSignal) =>
    api.get<MasterItem[]>('/master/payment-methods', undefined, signal),
  users: (signal?: AbortSignal) =>
    api.get<UserDirectoryItem[]>('/users/directory', undefined, signal),
};

export const auditApi = {
  list: (query: { page: number; pageSize: number; action?: string }, signal?: AbortSignal) =>
    api.get<AuditLogPage>('/audit-logs', query, signal),
};

export const dashboardApi = {
  get: (
    query: { period: string; branch: string; granularity: TrendGranularity },
    signal?: AbortSignal,
  ) => api.get<DashboardResponse>('/reports/dashboard', query, signal),
};

export const reportApi = {
  expenseAnalytics: (
    query: { period: string; from: string; to: string; branch: string },
    signal?: AbortSignal,
  ) => api.get<ExpenseAnalytics>('/reports/expense-analytics', query, signal),
  expensePlan: (query: { period: string; branch: string }, signal?: AbortSignal) =>
    api.get<ExpensePlanAnalytics>('/reports/expense-plan', query, signal),
  monthly: (query: { year: string | number; branch: string }, signal?: AbortSignal) =>
    api.get<MonthlyReport>('/reports/monthly', query, signal),
  branchComparison: (
    query: { year: string | number; month: string | number; branch: string },
    signal?: AbortSignal,
  ) => api.get<BranchComparisonReport>('/reports/branch-comparison', query, signal),
  cashiers: (query: { period: string; branch: string; scope?: 'own' }, signal?: AbortSignal) =>
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
  history: (year?: number, signal?: AbortSignal) =>
    api.get<BudgetHistory>('/budget-plans/history', { year }, signal),
  saveLines: (
    periodId: string,
    lines: Array<Pick<BudgetLine, 'branchId' | 'categoryId' | 'plannedAmountUzs' | 'reason'>>,
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
  savePlan: (
    periodId: string,
    lines: Array<{ branchId: string; plannedAmountUzs: MoneyUzs | null }>,
  ) => api.put<RevenuePlanBoard>(`/revenue-plans/${periodId}`, { lines }),
};

type MasterResource = 'categories' | 'departments' | 'payment-methods' | 'branches';
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

  /** Sozlamalar uchun: scope filtrsiz butun filial ro'yxati. */
  allBranches: (signal?: AbortSignal) => api.get<Branch[]>('/master/branches', undefined, signal),

  /** Direktorning boshlang'ich reja jadvali (kategoriya x filial). */
  categoryBaselines: (signal?: AbortSignal) =>
    api.get<CategoryBaselineBoard>('/master/category-baselines', undefined, signal),
  saveCategoryBaselines: (lines: CategoryBaselineInput[]) =>
    api.put<CategoryBaselineBoard>('/master/category-baselines', { lines }),
};

export const investorApi = {
  /** Yillik jamlari bilan investorlar ro'yxati (investor.view_all). */
  list: (year: number, signal?: AbortSignal) =>
    api.get<InvestorListItem[]>('/investors', { year }, signal),

  /** Joriy foydalanuvchining o'z investor profili. */
  mine: (signal?: AbortSignal) => api.get<InvestorRef>('/investors/me', undefined, signal),

  /** Yillik jami + 12 oy + to'lovlar tarixi. Backend avtorizatsiyani o'zi tekshiradi. */
  dashboard: (id: string, year: number, signal?: AbortSignal) =>
    api.get<InvestorDashboard>(`/investors/${id}`, { year }, signal),

  create: (input: InvestorCreateInput) => api.post<InvestorRef>('/investors', input),
  update: (id: string, input: Partial<InvestorCreateInput> & { isActive?: boolean }) =>
    api.patch<InvestorRef>(`/investors/${id}`, input),

  setEntitlement: (id: string, input: InvestorEntitlementInput) =>
    api.put<InvestorDashboard>(`/investors/${id}/entitlements`, input),
  recordPayment: (id: string, input: InvestorPaymentInput) =>
    api.post<InvestorDashboard>(`/investors/${id}/payments`, input),
  reversePayment: (id: string, paymentId: string, reason: string) =>
    api.post<InvestorDashboard>(`/investors/${id}/payments/${paymentId}/reverse`, { reason }),
};

/**
 * Investor ulushi (fakt tushum × ulush foizi) va to'lov so'rovi oqimi.
 *
 * Alohida bazaviy yo‘l: /investors ostida literal segment va :id parametri
 * bir prefiksda turishi keyinchalik jimgina buziladigan tartib bog‘liqligi.
 */
export const payoutApi = {
  /** Investorlar ro'yxati, fakt tushumdan hisoblangan yillik ulush bilan. */
  list: (year: number, signal?: AbortSignal) =>
    api.get<PayoutListItem[]>('/investor-payouts', { year }, signal),

  /** Joriy investorning yillik ulushi (investor.view_own). */
  mine: (year: number, signal?: AbortSignal) =>
    api.get<PayoutSummary>('/investor-payouts/me', { year }, signal),

  /** Bitta investorning ulushi — direktor uchun. */
  summary: (investorId: string, year: number, signal?: AbortSignal) =>
    api.get<PayoutSummary>(`/investor-payouts/investor/${investorId}`, { year }, signal),

  /** Direktor navbati: qaror kutayotgan va tasdiqlangan so‘rovlar. */
  queue: (signal?: AbortSignal) =>
    api.get<PayoutRequestRow[]>('/investor-payouts/requests', undefined, signal),

  /** Investor id yuborilmaydi — backend uni sessiyadan aniqlaydi. */
  request: (input: PayoutRequestInput) =>
    api.post<PayoutRequestRow>('/investor-payouts/requests', input),

  decide: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    api.post<PayoutRequestRow>(`/investor-payouts/requests/${id}/decision`, { decision, note }),

  markPaid: (id: string, paidOn: string, note?: string) =>
    api.post<PayoutRequestRow>(`/investor-payouts/requests/${id}/payment`, { paidOn, note }),

  cancel: (id: string, note?: string) =>
    api.post<PayoutRequestRow>(`/investor-payouts/requests/${id}/cancel`, { note }),
};
