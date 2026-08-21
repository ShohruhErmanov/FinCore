import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/layout/app-shell';
import { PermissionRoute, ProtectedRoute } from '@/features/auth/auth-guards';
import { LoginPage } from '@/features/auth/login-page';
import { routes } from '@/shared/config/routes';
import { EmptyState, LoadingState } from '@/shared/ui';

const DashboardPage = lazy(async () => ({
  default: (await import('@/features/dashboard/dashboard-page')).DashboardPage,
}));
const loadExpensePages = () => import('@/features/expenses/ExpensePages');
const ExpenseLedgerPage = lazy(async () => ({
  default: (await loadExpensePages()).ExpenseLedgerPage,
}));
const ExpenseCreatePage = lazy(async () => ({
  default: (await loadExpensePages()).ExpenseCreatePage,
}));
const ExpenseDetailPage = lazy(async () => ({
  default: (await loadExpensePages()).ExpenseDetailPage,
}));
const loadBudgetPages = () => import('@/features/budgets/BudgetPages');
const BudgetListPage = lazy(async () => ({ default: (await loadBudgetPages()).BudgetListPage }));
const BudgetDetailPage = lazy(async () => ({
  default: (await loadBudgetPages()).BudgetDetailPage,
}));
const loadFinancialReportPages = () => import('@/features/reports/FinancialReportPages');
const MonthlyReportPage = lazy(async () => ({
  default: (await loadFinancialReportPages()).MonthlyReportPage,
}));
const BranchComparisonPage = lazy(async () => ({
  default: (await loadFinancialReportPages()).BranchComparisonPage,
}));
const ProfitLossReportPage = lazy(async () => ({
  default: (await loadFinancialReportPages()).ProfitLossReportPage,
}));
const loadRevenuePages = () => import('@/features/revenue');
const RevenueLedgerPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueLedgerPage,
}));
const RevenueDetailPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueDetailPage,
}));
const NewRevenuePage = lazy(async () => ({ default: (await loadRevenuePages()).NewRevenuePage }));
const RevenuePlansPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenuePlansPage,
}));
const RevenuePlanDetailPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenuePlanDetailPage,
}));
const RevenueReportPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueReportPage,
}));
const CashierReportPage = lazy(async () => ({
  default: (await loadRevenuePages()).CashierReportPage,
}));
const loadOperationsPages = () => import('@/features/operations');
const DataQualityPage = lazy(async () => ({
  default: (await loadOperationsPages()).DataQualityPage,
}));
const ImportsPage = lazy(async () => ({ default: (await loadOperationsPages()).ImportsPage }));
const PeriodsPage = lazy(async () => ({ default: (await loadOperationsPages()).PeriodsPage }));
const PeriodDetailPage = lazy(async () => ({
  default: (await loadOperationsPages()).PeriodDetailPage,
}));
const loadAdminPages = () => import('@/features/admin');
const CategoriesPage = lazy(async () => ({ default: (await loadAdminPages()).CategoriesPage }));
const DepartmentsPage = lazy(async () => ({ default: (await loadAdminPages()).DepartmentsPage }));
const PaymentMethodsPage = lazy(async () => ({
  default: (await loadAdminPages()).PaymentMethodsPage,
}));
const BranchesPage = lazy(async () => ({ default: (await loadAdminPages()).BranchesPage }));
const UsersPage = lazy(async () => ({ default: (await loadAdminPages()).UsersPage }));
const RolesPage = lazy(async () => ({ default: (await loadAdminPages()).RolesPage }));
const AuditPage = lazy(async () => ({ default: (await loadAdminPages()).AuditPage }));

function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        title="Sahifa topilmadi"
        description="Manzil noto‘g‘ri yoki sahifa boshqa joyga ko‘chirilgan."
      />
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingState label="Sahifa yuklanmoqda…" />}>
      <Routes>
        <Route path={routes.login} element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to={routes.dashboard} replace />} />
            <Route element={<PermissionRoute permission="dashboard.view" />}>
              <Route path={routes.dashboard} element={<DashboardPage />} />
            </Route>

            <Route element={<PermissionRoute permission="expense.view_own_branch" />}>
              <Route path={routes.expenses} element={<ExpenseLedgerPage />} />
              <Route path="/expenses/:expenseId" element={<ExpenseDetailPage />} />
            </Route>
            <Route element={<PermissionRoute permission="expense.create" />}>
              <Route path={routes.expenseNew} element={<ExpenseCreatePage />} />
            </Route>

            <Route element={<PermissionRoute permission="budget.view" />}>
              <Route path={routes.budgets} element={<BudgetListPage />} />
              <Route path="/budgets/:versionId" element={<BudgetDetailPage />} />
            </Route>

            <Route element={<PermissionRoute permission="revenue.view_own" />}>
              <Route path={routes.revenueTransactions} element={<RevenueLedgerPage />} />
              <Route path="/revenue/transactions/:transactionId" element={<RevenueDetailPage />} />
            </Route>
            <Route element={<PermissionRoute permission="revenue.create" />}>
              <Route path={routes.revenueNew} element={<NewRevenuePage />} />
            </Route>
            <Route element={<PermissionRoute permission="revenue_plan.create_edit" />}>
              <Route path={routes.revenuePlans} element={<RevenuePlansPage />} />
              <Route path="/revenue/plans/:planId" element={<RevenuePlanDetailPage />} />
            </Route>

            <Route element={<PermissionRoute permission="reports.view" />}>
              <Route path={routes.monthlyReport} element={<MonthlyReportPage />} />
              <Route path={routes.branchReport} element={<BranchComparisonPage />} />
              <Route path={routes.profitLoss} element={<ProfitLossReportPage />} />
              <Route path={routes.revenueReport} element={<RevenueReportPage />} />
            </Route>
            <Route element={<PermissionRoute permission="reports.view_cashiers" />}>
              <Route path={routes.cashiersReport} element={<CashierReportPage />} />
            </Route>

            <Route element={<PermissionRoute permission="import.run" />}>
              <Route path={routes.dataQuality} element={<DataQualityPage />} />
              <Route path={routes.imports} element={<ImportsPage />} />
            </Route>
            <Route element={<PermissionRoute permission="period.close" />}>
              <Route path={routes.periods} element={<PeriodsPage />} />
              <Route path="/periods/:periodId" element={<PeriodDetailPage />} />
            </Route>

            <Route element={<PermissionRoute permission="master_data.manage" />}>
              <Route path={routes.categories} element={<CategoriesPage />} />
              <Route path={routes.departments} element={<DepartmentsPage />} />
              <Route path={routes.paymentMethods} element={<PaymentMethodsPage />} />
              <Route path={routes.branches} element={<BranchesPage />} />
            </Route>
            <Route element={<PermissionRoute permission="user.manage" />}>
              <Route path={routes.users} element={<UsersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="role.manage" />}>
              <Route path={routes.roles} element={<RolesPage />} />
            </Route>
            <Route element={<PermissionRoute permission="audit.view" />}>
              <Route path={routes.audit} element={<AuditPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
