import { CalendarPlus, FileBarChart, LayoutDashboard, ReceiptText } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { isNavItemActive, navigation, routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';

export function MobileBottomNav() {
  const { hasPermission } = useAuth();
  const { pathname } = useLocation();
  const dashboardItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.to === routes.dashboard);
  const items = [
    ...(dashboardItem ? [{ ...dashboardItem, icon: LayoutDashboard }] : []),
    {
      label: 'Tushum',
      to: routes.revenues,
      permission: 'revenue.view_own_branch' as const,
      icon: CalendarPlus,
    },
    {
      label: 'Xarajat',
      to: routes.expenses,
      permission: 'expense.view_own_branch' as const,
      icon: ReceiptText,
    },
    {
      label: 'Hisobot',
      to: routes.monthlyReport,
      permission: 'reports.view' as const,
      icon: FileBarChart,
    },
  ]
    .filter((item) => hasPermission(item.permission))
    .slice(0, 4);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border/60 bg-surface px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_18px_-12px_rgb(var(--neu-shade)/0.85)] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      aria-label="Mobil navigatsiya"
    >
      {items.map(({ icon: Icon, ...item }) => (
        <NavLink
          key={`${item.to}:${item.label}`}
          to={item.to}
          className={() =>
            cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted',
              isNavItemActive(item, pathname) && 'text-primary',
            )
          }
        >
          <Icon className="h-5 w-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
