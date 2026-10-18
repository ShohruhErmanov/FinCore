import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarPlus,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  HandCoins,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { isNavItemActive, navigation, routes, type NavigationItem } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { BrandMark } from '@/shared/ui';

const iconByPath: Record<string, typeof LayoutDashboard> = {
  [routes.dashboard]: LayoutDashboard,
  [routes.revenues]: CalendarPlus,
  [routes.expenses]: ReceiptText,
  [routes.revenuePlans]: WalletCards,
  [routes.budgets]: ClipboardList,
  [routes.monthlyReport]: FileBarChart,
  [routes.branchReport]: Building2,
  [routes.cashierReport]: UsersRound,
  [routes.categories]: Settings,
  [routes.users]: UserRound,
  [routes.roles]: ShieldCheck,
  [routes.imports]: FileSpreadsheet,
  [routes.notifications]: Bell,
  [routes.myInvestment]: PieChart,
  [routes.payoutRequests]: HandCoins,
  [routes.auditLogs]: ShieldCheck,
};

function NavigationLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavigationItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = iconByPath[item.to] ?? BookOpenCheck;
  const { pathname } = useLocation();
  const isActive = isNavItemActive(item, pathname);

  return (
    <NavLink
      to={item.to}
      {...(onClick ? { onClick } : {})}
      {...(collapsed ? { title: item.label } : {})}
      {...(isActive ? { 'aria-current': 'page' as const } : {})}
      className={() =>
        cn(
          'sidebar-nav-item group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
          isActive && 'sidebar-nav-item-active text-primary',
          collapsed && 'justify-center px-2',
        )
      }
    >
      <Icon
        className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105"
        aria-hidden="true"
      />
      {!collapsed ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </NavLink>
  );
}

export function AppSidebar({
  collapsed,
  mobile,
  onClose,
  onToggle,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}) {
  const { hasPermission } = useAuth();
  const visibleGroups = useMemo(
    () =>
      navigation
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => item.to !== routes.notifications && hasPermission(item.permission),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [hasPermission],
  );

  return (
    <aside
      className={cn(
        'fincore-sidebar flex h-full flex-col p-2 text-ink',
        mobile ? 'w-[286px]' : collapsed ? 'w-[76px]' : 'w-[252px]',
      )}
    >
      <div
        className={cn(
          'sidebar-brand-panel flex h-[64px] items-center rounded-2xl px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Link
          to={routes.dashboard}
          className="group flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <div className="sidebar-logo-well grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5">
            <BrandMark className="h-8 w-8" />
          </div>
          {!collapsed ? (
            <div>
              <p className="font-bold tracking-[0.04em]">FINCORE</p>
              <p className="text-[10px] font-medium text-slate-400">Moliya nazorati</p>
            </div>
          ) : null}
        </Link>
        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            className="neu-raised-sm grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:-translate-y-0.5 hover:text-ink hover:shadow-[var(--neu-shadow-2)] active:translate-y-0 active:shadow-[var(--neu-pressed)]"
            aria-label="Menyuni yopish"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto px-1 py-3" aria-label="Asosiy navigatsiya">
        {visibleGroups.map((group) => (
          <div
            key={group.label}
            className={cn('sidebar-nav-group rounded-2xl p-2', collapsed && 'px-1.5')}
          >
            {!collapsed ? (
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavigationLink
                  key={`${item.to}:${item.label}`}
                  item={item}
                  collapsed={collapsed}
                  {...(mobile && onClose ? { onClick: onClose } : {})}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      {!mobile ? (
        <div className="sidebar-collapse-panel rounded-2xl p-1.5">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'sidebar-collapse-button flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-600 transition-all duration-200 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:shadow-[var(--neu-pressed)]',
              collapsed && 'justify-center px-2',
            )}
            aria-label={collapsed ? 'Yon menyuni kengaytirish' : 'Yon menyuni yig‘ish'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                <span>Menyuni yig‘ish</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
