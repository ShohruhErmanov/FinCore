import type { PermissionCode } from '@/shared/types/domain';

export const routes = {
  login: '/login',
  dashboard: '/dashboard',
  expenses: '/expenses',
  expenseNew: '/expenses/new',
  expenseDetail: (id: string) => `/expenses/${id}`,
  budgets: '/budgets',
  revenues: '/revenue',
  revenueNew: '/revenue/new',
  revenueDetail: (id: string) => `/revenue/${id}`,
  revenuePlans: '/revenue/plans',
  monthlyReport: '/reports/monthly',
  branchReport: '/reports/branches',
  cashierReport: '/reports/cashiers',
  categories: '/settings/categories',
  departments: '/settings/departments',
  paymentMethods: '/settings/payment-methods',
  branches: '/settings/branches',
  users: '/admin/users',
  roles: '/admin/roles',
  imports: '/settings/import',
  notifications: '/settings/notifications',
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
      { label: 'Kunlik tushum', to: routes.revenues, permission: 'revenue.view_own_branch' },
      { label: 'Jurnal', to: routes.expenses, permission: 'expense.view_own_branch' },
    ],
  },
  {
    label: 'Rejalashtirish',
    items: [
      { label: 'Tushum rejasi', to: routes.revenuePlans, permission: 'revenue_plan.manage' },
      { label: 'Budjet', to: routes.budgets, permission: 'budget.view' },
    ],
  },
  {
    label: 'Hisobotlar',
    items: [
      { label: 'Oylik hisobot', to: routes.monthlyReport, permission: 'reports.view' },
      { label: 'Filiallar taqqoslash', to: routes.branchReport, permission: 'reports.view' },
      { label: 'Kassirlar', to: routes.cashierReport, permission: 'reports.view_cashiers' },
      {
        label: 'Mening natijam',
        to: routes.cashierReport,
        permission: 'reports.view_own_performance',
      },
    ],
  },
  {
    label: 'Boshqaruv',
    items: [
      { label: 'Sozlamalar', to: routes.categories, permission: 'master_data.manage' },
      { label: 'Excel’dan import', to: routes.imports, permission: 'import.run' },
      { label: 'Bildirishnoma', to: routes.notifications, permission: 'notification.manage' },
      { label: 'Foydalanuvchilar', to: routes.users, permission: 'user.manage' },
      { label: 'Rollar', to: routes.roles, permission: 'role.manage' },
    ],
  },
];
