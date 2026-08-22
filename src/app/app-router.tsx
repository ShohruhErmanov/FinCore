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
const BudgetPage = lazy(async () => ({ default: (await loadBudgetPages()).BudgetPage }));
const loadRevenuePages = () => import('@/features/revenue/RevenuePages');
const RevenueLedgerPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueLedgerPage,
}));
const RevenueCreatePage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueCreatePage,
}));
const RevenueDetailPage = lazy(async () => ({
  default: (await loadRevenuePages()).RevenueDetailPage,
}));
const RevenuePlanPage = lazy(async () => ({ default: (await loadRevenuePages()).RevenuePlanPage }));
const loadFinancialReportPages = () => import('@/features/reports/FinancialReportPages');
const MonthlyReportPage = lazy(async () => ({
  default: (await loadFinancialReportPages()).MonthlyReportPage,
}));
const BranchComparisonPage = lazy(async () => ({
  default: (await loadFinancialReportPages()).BranchComparisonPage,
}));
const CashierReportPage = lazy(async () => ({
  default: (await import('@/features/reports/CashierReportPage')).CashierReportPage,
}));
const ImportPage = lazy(async () => ({
  default: (await import('@/features/imports/ImportPage')).ImportPage,
}));
const NotificationsPage = lazy(async () => ({
  default: (await import('@/features/notifications/NotificationsPage')).NotificationsPage,
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

            <Route element={<PermissionRoute permission="revenue.view_own_branch" />}>
              <Route path={routes.revenues} element={<RevenueLedgerPage />} />
            </Route>
            <Route element={<PermissionRoute permission="revenue.create" />}>
              <Route path={routes.revenueNew} element={<RevenueCreatePage />} />
            </Route>
            <Route element={<PermissionRoute permission="revenue_plan.manage" />}>
              <Route path={routes.revenuePlans} element={<RevenuePlanPage />} />
            </Route>
            <Route element={<PermissionRoute permission="revenue.view_own_branch" />}>
              <Route path="/revenue/:revenueId" element={<RevenueDetailPage />} />
            </Route>

            <Route element={<PermissionRoute permission="budget.view" />}>
              <Route path={routes.budgets} element={<BudgetPage />} />
            </Route>

            <Route element={<PermissionRoute permission="reports.view" />}>
              <Route path={routes.monthlyReport} element={<MonthlyReportPage />} />
              <Route path={routes.branchReport} element={<BranchComparisonPage />} />
            </Route>
            <Route
              element={
                <PermissionRoute
                  permission={['reports.view_cashiers', 'reports.view_own_performance']}
                />
              }
            >
              <Route path={routes.cashierReport} element={<CashierReportPage />} />
            </Route>

            <Route element={<PermissionRoute permission="master_data.manage" />}>
              <Route path={routes.categories} element={<CategoriesPage />} />
              <Route path={routes.departments} element={<DepartmentsPage />} />
              <Route path={routes.paymentMethods} element={<PaymentMethodsPage />} />
              <Route path={routes.branches} element={<BranchesPage />} />
            </Route>
            <Route element={<PermissionRoute permission="import.run" />}>
              <Route path={routes.imports} element={<ImportPage />} />
            </Route>
            <Route element={<PermissionRoute permission="notification.manage" />}>
              <Route path={routes.notifications} element={<NotificationsPage />} />
            </Route>
            <Route element={<PermissionRoute permission="user.manage" />}>
              <Route path={routes.users} element={<UsersPage />} />
            </Route>
            <Route element={<PermissionRoute permission="role.manage" />}>
              <Route path={routes.roles} element={<RolesPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
