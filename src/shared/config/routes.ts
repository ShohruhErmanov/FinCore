import type { PermissionCode } from '@/shared/types/domain';

export const routes = {
  login: '/login',
  dashboard: '/dashboard',
  expenses: '/expenses',
  expenseNew: '/expenses/new',
  expenseDetail: (id: string) => `/expenses/${id}`,
  budgets: '/budgets',
  budgetDetail: (id: string) => `/budgets/${id}`,
  monthlyReport: '/reports/monthly',
  branchReport: '/reports/branches',
  profitLoss: '/reports/profit-loss',
  dataQuality: '/data-quality',
  imports: '/data-quality/imports',
  periods: '/periods',
  periodDetail: (id: string) => `/periods/${id}`,
  categories: '/settings/categories',
  departments: '/settings/departments',
  paymentMethods: '/settings/payment-methods',
  branches: '/settings/branches',
  users: '/admin/users',
  roles: '/admin/roles',
  audit: '/audit',
  revenuePlans: '/revenue/plans',
  revenuePlanDetail: (id: string) => `/revenue/plans/${id}`,
  revenueNew: '/revenue/new',
  revenueTransactions: '/revenue/transactions',
  revenueDetail: (id: string) => `/revenue/transactions/${id}`,
  revenueReport: '/reports/revenue',
  cashiersReport: '/reports/cashiers',
} as const;

export interface NavigationItem {
  label: string;
  to: string;
  permission: PermissionCode;
  exact?: boolean;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigation: NavigationGroup[] = [
  {
    label: 'Asosiy',
    items: [
      { label: 'Dashboard', to: routes.dashboard, permission: 'dashboard.view', exact: true },
    ],
  },
  {
    label: 'Operatsiyalar',
    items: [
      { label: 'Xarajatlar', to: routes.expenses, permission: 'expense.view_own_branch' },
      { label: 'Tushumlar', to: routes.revenueTransactions, permission: 'revenue.view_own' },
    ],
  },
  {
    label: 'Rejalashtirish',
    items: [
      { label: 'Budjet', to: routes.budgets, permission: 'budget.view' },
      { label: 'Tushum rejasi', to: routes.revenuePlans, permission: 'revenue_plan.create_edit' },
    ],
  },
  {
    label: 'Hisobotlar',
    items: [
      { label: 'Oylik hisobot', to: routes.monthlyReport, permission: 'reports.view' },
      { label: 'Filiallar taqqoslash', to: routes.branchReport, permission: 'reports.view' },
      { label: 'Foyda / zarar', to: routes.profitLoss, permission: 'reports.view' },
      { label: 'Tushum hisoboti', to: routes.revenueReport, permission: 'reports.view' },
      {
        label: 'Kassirlar hisoboti',
        to: routes.cashiersReport,
        permission: 'reports.view_cashiers',
      },
      { label: 'Data quality', to: routes.dataQuality, permission: 'import.run' },
    ],
  },
  {
    label: 'Nazorat',
    items: [
      { label: 'Davrni yopish', to: routes.periods, permission: 'period.close' },
      { label: 'Audit log', to: routes.audit, permission: 'audit.view' },
    ],
  },
  {
    label: 'Boshqaruv',
    items: [
      { label: 'Sozlamalar', to: routes.categories, permission: 'master_data.manage' },
      { label: 'Foydalanuvchilar', to: routes.users, permission: 'user.manage' },
    ],
  },
];
