import type { PermissionCode } from '@/shared/types/domain';

export const routes = {
  login: '/login',
  dashboard: '/dashboard',
  expensePlanAnalytics: '/dashboard/expense-plan',
  expenseAnalytics: '/dashboard/expenses',
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
  myPerformance: '/reports/my-performance',
  categories: '/settings/categories',
  departments: '/settings/departments',
  paymentMethods: '/settings/payment-methods',
  branches: '/settings/branches',
  users: '/admin/users',
  roles: '/admin/roles',
  imports: '/settings/import',
  notifications: '/settings/notifications',
  investors: '/investors',
  myInvestment: '/investors/me',
  investorDetail: (id: string) => `/investors/${id}`,
  payoutRequests: '/investors/payout-requests',
  auditLogs: '/security/audit-logs',
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
    label: 'Investor',
    items: [
      {
        label: 'Mening ulushim',
        to: routes.myInvestment,
        permission: 'investor.view_own',
        exact: true,
      },
    ],
  },
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
      // Its own path, not a second label on /reports/cashiers: two entries
      // sharing a route cannot be told apart by any highlighting rule, and a
      // reader who may see everyone would otherwise get the same page twice.
      {
        label: 'Mening natijam',
        to: routes.myPerformance,
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
      // No exact flag: isNavItemActive already yields to /investors/me and
      // /investors/payout-requests, so an investor's detail page can keep this
      // entry lit instead of lighting nothing at all.
      { label: 'Investorlar', to: routes.investors, permission: 'investor.view_all' },
      {
        label: 'To‘lov so‘rovlari',
        to: routes.payoutRequests,
        permission: 'investor.view_all',
      },
    ],
  },
  {
    label: 'Xavfsizlik',
    items: [{ label: 'Audit jurnali', to: routes.auditLogs, permission: 'audit.view' }],
  },
];

/** Does this path cover that pathname at all? */
function covers(to: string, pathname: string, exact?: boolean): boolean {
  if (pathname === to) return true;
  return exact ? false : pathname.startsWith(`${to}/`);
}

/**
 * Whether a navigation entry should read as active for the current pathname.
 *
 * NavLink on its own lights every ancestor, so /revenue/plans lit both "Tushum
 * rejasi" and "Kunlik tushum" — /revenue is a prefix of it. The rule here is
 * that the most specific entry wins: an entry is active when it covers the
 * pathname and no other entry with a longer path covers it too.
 *
 * A transaction at /revenue/abc still lights "Kunlik tushum", because no
 * navigation entry sits closer to it. That is the behaviour `end` would have
 * destroyed, which is why this is a rule rather than an exact-match flag.
 */
export function isNavItemActive(item: NavigationItem, pathname: string): boolean {
  if (!covers(item.to, pathname, item.exact)) return false;

  return !navigation
    .flatMap((group) => group.items)
    .some((other) => other.to.length > item.to.length && covers(other.to, pathname, other.exact));
}

/**
 * Where a signed-in user should land. An investor holds neither dashboard.view
 * nor any ledger permission, so sending everyone to /dashboard would drop them
 * on an "access denied" screen the moment they log in.
 *
 * This is navigation convenience only — every route and every endpoint still
 * enforces its own permission on the server.
 */
export function landingRoute(hasPermission: (code: PermissionCode) => boolean): string {
  if (hasPermission('dashboard.view')) return routes.dashboard;
  if (hasPermission('investor.view_own')) return routes.myInvestment;
  const firstVisible = navigation
    .flatMap((group) => group.items)
    .find((item) => hasPermission(item.permission));
  return firstVisible?.to ?? routes.dashboard;
}
