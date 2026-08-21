export type UUID = string;
export type MoneyUzs = string;
export type IsoDate = string;
export type IsoDateTime = string;

export type PermissionCode =
  | 'dashboard.view'
  | 'expense.view_own_branch'
  | 'expense.view_all_branches'
  | 'expense.create'
  | 'expense.edit'
  | 'expense.correct_reverse'
  | 'expense.submit'
  | 'expense.approve'
  | 'expense.reject'
  | 'budget.view'
  | 'budget.create_edit'
  | 'budget.submit'
  | 'budget.approve'
  | 'revenue.view_own'
  | 'revenue.view_all'
  | 'revenue.create'
  | 'revenue.reverse'
  | 'revenue.enter_on_behalf'
  | 'revenue_plan.create_edit'
  | 'revenue_plan.submit'
  | 'revenue_plan.approve'
  | 'reports.view'
  | 'reports.view_cashiers'
  | 'period.close'
  | 'period.reopen'
  | 'master_data.manage'
  | 'user.manage'
  | 'role.manage'
  | 'audit.view'
  | 'import.run'
  | 'import.resolve_exception';

export type RoleCode = 'cashier' | 'finance_manager' | 'director';
export type UserStatus = 'active' | 'inactive' | 'blocked';
export type ExpenseType = 'fixed' | 'variable';
export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reversed';
export type PlanStatus = 'draft' | 'submitted' | 'approved' | 'locked';
export type RevenueStatus = 'posted' | 'reversed';
export type PeriodStatus = 'open' | 'closed';
export type Severity = 'info' | 'warning' | 'error';

export interface Branch {
  id: UUID;
  code: 'SAYXUN' | 'XALQLAR';
  name: string;
  isActive: boolean;
}

export interface RoleAssignment {
  id: UUID;
  role: RoleCode;
  roleName: string;
  branchId: UUID | null;
  branchName: string | null;
}

export interface AuthenticatedUser {
  id: UUID;
  fullName: string;
  phone: string;
  status: UserStatus;
  roles: RoleAssignment[];
  permissions: PermissionCode[];
  branchScopes: UUID[];
  writeBranchScopes: UUID[];
  lastLoginAt: IsoDateTime | null;
}

export interface UserCreateInput {
  fullName: string;
  phone: string;
  role: RoleCode;
  branchId: UUID | null;
  cashierBranchId: UUID | null;
}

export interface UserAccessUpdateInput {
  roles: Array<{ role: RoleCode; branchId: UUID | null }>;
}

export type RolePermissionMatrix = Record<RoleCode, PermissionCode[]>;

export interface UserDirectoryItem {
  id: UUID;
  fullName: string;
  status: UserStatus;
  roles: RoleAssignment[];
}

export interface AccountingPeriod {
  id: UUID;
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: IsoDateTime | null;
  closedByName: string | null;
}

export interface ExpenseCategory {
  id: UUID;
  code: string;
  name: string;
  expenseType: ExpenseType;
  isActive: boolean;
  aliases: string[];
}

export interface MasterItem {
  id: UUID;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AuditEvent {
  id: UUID;
  occurredAt: IsoDateTime;
  actorId: UUID;
  actorName: string;
  action: string;
  entityType: string;
  entityId: UUID | string;
  branchId: UUID | null;
  branchName: string | null;
  result: 'success' | 'denied' | 'failed';
  reason: string | null;
  changes?: Array<{ field: string; before: string | null; after: string | null }>;
}

export interface Expense {
  id: UUID;
  transactionDate: IsoDate;
  periodId: UUID;
  branchId: UUID;
  branchName: string;
  categoryId: UUID;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  description: string;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  paymentMethodName: string;
  departmentId: UUID;
  departmentName: string;
  responsibleUserId: UUID;
  responsibleUserName: string;
  enteredBy: UUID;
  enteredByName: string;
  comment: string | null;
  status: ExpenseStatus;
  isReversed: boolean;
  reversalReason: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  audit: AuditEvent[];
}

export interface ExpenseCreateInput {
  transactionDate: IsoDate;
  branchId?: UUID;
  categoryId: UUID;
  description: string;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  departmentId: UUID;
  responsibleUserId: UUID;
  comment?: string | undefined;
  idempotencyKey: string;
}

export interface BudgetLine {
  id: UUID;
  branchId: UUID;
  branchName: string;
  categoryId: UUID;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  expenseTypeSnapshot: ExpenseType;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  reason: string | null;
  hasPlan: boolean;
}

export interface BudgetVersion {
  id: UUID;
  periodId: UUID;
  periodLabel: string;
  revisionNo: number;
  status: PlanStatus;
  reason: string | null;
  createdByName: string;
  submittedByName: string | null;
  approvedByName: string | null;
  createdAt: IsoDateTime;
  lines: BudgetLine[];
}

export interface BudgetRevisionCreateInput {
  reason: string;
}

export interface RevenuePlan {
  id: UUID;
  periodId: UUID;
  periodLabel: string;
  branchId: UUID;
  branchName: string;
  plannedAmountUzs: MoneyUzs;
  revisionNo: number;
  status: PlanStatus;
  reason: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  updatedAt: IsoDateTime;
}

export interface RevenuePlanSummary {
  period: AccountingPeriod;
  expectedBranchCount: number;
  branchesWithPlan: number;
  planComplete: boolean;
  totalPlannedAmountUzs: MoneyUzs;
}

export interface RevenueTransaction {
  id: UUID;
  receiptNo: string;
  paymentAt: IsoDateTime;
  paymentBusinessDate: IsoDate;
  timePrecision: 'exact' | 'date_only';
  periodId: UUID;
  branchId: UUID;
  branchName: string;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  paymentMethodName: string;
  collectorUserId: UUID;
  collectorName: string;
  enteredBy: UUID;
  enteredByName: string;
  enteredOnBehalf: boolean;
  onBehalfReason: string | null;
  externalReference: string | null;
  description: string;
  status: RevenueStatus;
  reversalReason: string | null;
  createdAt: IsoDateTime;
  audit: AuditEvent[];
}

export interface RevenueCreateInput {
  paymentAt: IsoDateTime;
  branchId?: UUID;
  amountUzs: MoneyUzs;
  paymentMethodId: UUID;
  collectorUserId?: UUID;
  onBehalfReason?: string | undefined;
  externalReference?: string | undefined;
  description: string;
  idempotencyKey: string;
}

export interface KpiValue {
  label: string;
  valueUzs?: MoneyUzs;
  valuePct?: number | null;
  helper: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  drilldown: { pathname: string; search: Record<string, string> };
}

export interface DashboardResponse {
  isDemo: boolean;
  period: AccountingPeriod;
  branchId: UUID | null;
  expensePlanUzs: MoneyUzs;
  expenseActualUzs: MoneyUzs;
  expenseVarianceUzs: MoneyUzs;
  expenseCompletionPct: number | null;
  revenuePlanUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
  revenueGapUzs: MoneyUzs;
  revenueOverPlanUzs: MoneyUzs;
  collectionPct: number | null;
  netResultUzs: MoneyUzs;
  netMarginPct: number | null;
  fixedExpenseUzs: MoneyUzs;
  variableExpenseUzs: MoneyUzs;
  channels: Array<{ id: UUID; name: string; amountUzs: MoneyUzs; sharePct: number | null }>;
  monthlyTrend: Array<{ month: string; planUzs: MoneyUzs; actualUzs: MoneyUzs }>;
  branches: Array<{
    branchId: UUID;
    name: string;
    planUzs: MoneyUzs;
    actualUzs: MoneyUzs;
    collectionPct: number | null;
  }>;
  dataQuality: {
    status: 'healthy' | 'warning' | 'mismatch';
    openCount: number;
    excludedAmountUzs: MoneyUzs;
  };
}

export interface HistoricalRef {
  id: UUID;
  code: string;
  name: string;
  snapshotName?: string;
}

export interface PlanActual {
  hasPlan: boolean;
  plannedAmountUzs: MoneyUzs | null;
  actualAmountUzs: MoneyUzs;
  varianceUzs: MoneyUzs | null;
  completionPercent: number | null;
  status: 'no_plan' | 'unplanned' | 'under_plan' | 'on_plan' | 'over_plan';
}

export interface RevenueKpi {
  planComplete: boolean;
  branchesWithPlan: number;
  expectedBranchCount: number;
  expectedRevenueUzs: MoneyUzs | null;
  actualRevenueUzs: MoneyUzs;
  shortfallUzs: MoneyUzs | null;
  overPlanUzs: MoneyUzs | null;
  collectionPercent: number | null;
}

export interface MonthlyReportRow {
  category: HistoricalRef & { expenseTypeSnapshot: ExpenseType };
  months: Array<{ month: number; planActual: PlanActual; transactionCount: number }>;
  annual: PlanActual & { transactionCount: number };
}

export interface MonthlyReport {
  year: number;
  branchFilter: UUID | 'all';
  averagePolicy: {
    code: 'calendar_12' | 'elapsed_months' | 'months_with_actual';
    label: string;
    denominator: number;
  };
  rows: MonthlyReportRow[];
  totals: { fixed: PlanActual; variable: PlanActual; overall: PlanActual };
}

export interface BranchSummary {
  branch: HistoricalRef;
  expense: PlanActual;
  revenue: RevenueKpi;
}

export interface BranchComparisonReport {
  year: number;
  months: Array<{ month: number; branches: BranchSummary[]; total: BranchSummary }>;
  annual: { branches: BranchSummary[]; total: BranchSummary };
}

export interface ProfitLossReport {
  period: AccountingPeriod;
  branchFilter: UUID | 'all';
  actualRevenueUzs: MoneyUzs;
  actualExpenseUzs: MoneyUzs;
  netFinancialResultUzs: MoneyUzs;
  netMarginPercent: number | null;
  label: 'Foyda' | 'Zarar' | 'Nol natija';
}

export interface RevenueKpiSummary {
  planComplete: boolean;
  branchesWithPlan: number;
  expectedBranchCount: number;
  expectedRevenueUzs: MoneyUzs;
  actualRevenueUzs: MoneyUzs;
  shortfallUzs: MoneyUzs;
  overPlanUzs: MoneyUzs;
  collectionPercent: number | null;
}

export interface RevenueChannelSummary {
  id: UUID;
  paymentMethodId: UUID;
  paymentMethodName: string;
  amountUzs: MoneyUzs;
  transactionCount: number;
  sharePercent: number | null;
  drilldownFilters: Record<string, string>;
}

export interface RevenueReportResponse {
  period: AccountingPeriod;
  branchFilter: UUID | 'all';
  center: RevenueKpiSummary;
  channels: RevenueChannelSummary[];
  branches: Array<{
    branchId: UUID;
    branchName: string;
    kpi: RevenueKpiSummary;
    channels: RevenueChannelSummary[];
  }>;
  reconciliation: ReconciliationResult;
}

export interface CashierSummary {
  collectorUserId: UUID;
  collectorName: string;
  branchId: UUID;
  branchName: string;
  isActive: boolean;
  totalUzs: MoneyUzs;
  transactionCount: number;
  cashUzs: MoneyUzs;
  cardUzs: MoneyUzs;
  bankUzs: MoneyUzs;
  branchSharePct: number | null;
}

export interface CashierReportResponse {
  period: AccountingPeriod;
  branchFilter: UUID | 'all';
  collectorFilter: UUID | 'all';
  items: CashierSummary[];
  summary: {
    totalUzs: MoneyUzs;
    cashierCount: number;
    inactiveCount: number;
  };
}

export interface DataQualityException {
  id: UUID;
  severity: Severity;
  issueType: string;
  title: string;
  sourceSheet: string;
  sourceRow: number;
  branchId: UUID | null;
  branchName: string | null;
  transactionDate: string | null;
  amountUzs: MoneyUzs;
  detail: string;
  ownerName: string | null;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: IsoDateTime;
  resolutionReason?: string | null;
  resolvedAt?: IsoDateTime | null;
  correctedDate?: IsoDate | null;
  resolvedCategoryId?: UUID | null;
  resolvedCategoryName?: string | null;
}

export interface DataQualityResolutionInput {
  reason: string;
  correctedDate?: IsoDate;
  categoryId?: UUID;
}

export interface DataQualityPageResponse extends PaginatedResponse<DataQualityException> {
  summary: {
    openCount: number;
    openAmountUzs: MoneyUzs;
  };
}

export interface ReconciliationResult {
  id: UUID;
  scope: string;
  sourceCount: number;
  sourceSumUzs: MoneyUzs;
  targetCount: number;
  targetSumUzs: MoneyUzs;
  diffCount: number;
  diffSumUzs: MoneyUzs;
  status: 'match' | 'mismatch';
  checkedAt: IsoDateTime;
}

export interface ImportJob {
  id: UUID;
  sourceName: string;
  status: 'preview_ready' | 'running' | 'completed' | 'failed';
  totalRows: number;
  normalizedRows: number;
  exceptionRows: number;
  recoveredAmountUzs: MoneyUzs;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  message: string;
}

export interface CloseCheck {
  id: string;
  label: string;
  description: string;
  status: 'passed' | 'warning' | 'blocked';
  count?: number;
  amountUzs?: MoneyUzs;
}

export interface PeriodCloseReadiness {
  period: AccountingPeriod;
  canClose: boolean;
  checks: CloseCheck[];
  snapshot: PeriodCloseSnapshot | null;
  history: Array<{
    id: UUID;
    action: 'closed' | 'reopened';
    actorName: string;
    occurredAt: IsoDateTime;
    reason: string;
  }>;
}

export interface PeriodCloseSnapshot {
  id: UUID;
  createdAt: IsoDateTime;
  createdByName: string;
  expenseActualUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
  netResultUzs: MoneyUzs;
  reconciliationStatus: 'match' | 'mismatch';
  artifacts: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}
