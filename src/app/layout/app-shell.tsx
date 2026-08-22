import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  Bell,
  Building2,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { navigation, routes, type NavigationItem } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { Button, Select, StatusBadge } from '@/shared/ui';

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
  return (
    <NavLink
      to={item.to}
      {...(item.exact === undefined ? {} : { end: item.exact })}
      {...(onClick ? { onClick } : {})}
      {...(collapsed ? { title: item.label } : {})}
      className={({ isActive }) =>
        cn(
          'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
          isActive && 'bg-primary text-white shadow-sm',
          collapsed && 'justify-center px-2',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </NavLink>
  );
}

function Sidebar({
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
          items: group.items.filter((item) => hasPermission(item.permission)),
        }))
        .filter((group) => group.items.length > 0),
    [hasPermission],
  );
  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-navy text-white',
        mobile ? 'w-[286px]' : collapsed ? 'w-[76px]' : 'w-[252px]',
      )}
    >
      <div
        className={cn(
          'flex h-[72px] items-center border-b border-white/10 px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Link
          to={routes.dashboard}
          className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary">
            <Landmark className="h-5 w-5" />
          </div>
          {!collapsed ? (
            <div>
              <p className="font-bold tracking-tight">FINCORE</p>
              <p className="text-[10px] text-slate-400">Moliya nazorati</p>
            </div>
          ) : null}
        </Link>
        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10"
            aria-label="Menyuni yopish"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Asosiy navigatsiya">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavigationLink
                  key={item.to}
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
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/10 hover:text-white',
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

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accountOpen, setAccountOpen] = useState(false);
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const accessibleBranches =
    branchesQuery.data?.filter((branch) => user?.branchScopes.includes(branch.id)) ?? [];
  const selectedPeriod =
    searchParams.get('period') ??
    periodsQuery.data?.find((period) => period.status === 'open')?.id ??
    '';
  const defaultBranch = hasPermission('expense.view_all_branches')
    ? 'all'
    : (accessibleBranches[0]?.id ?? '');
  const selectedBranch = searchParams.get('branch') ?? defaultBranch;

  function updateFilter(key: 'period' | 'branch', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-3 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Menyuni ochish"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          <Select
            aria-label="Hisobot davri"
            value={selectedPeriod}
            onChange={(event) => updateFilter('period', event.target.value)}
            className="w-40 border-0 bg-slate-100 font-medium"
          >
            {(periodsQuery.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filial"
            value={selectedBranch}
            onChange={(event) => updateFilter('branch', event.target.value)}
            className="w-44 border-0 bg-slate-100 font-medium"
          >
            {hasPermission('expense.view_all_branches') ? (
              <option value="all">Barcha filiallar</option>
            ) : null}
            {accessibleBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAccountOpen((value) => !value)}
          className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-100"
          aria-expanded={accountOpen}
          aria-haspopup="menu"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {user?.fullName
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="hidden max-w-44 sm:block">
            <p className="truncate text-sm font-semibold text-ink">{user?.fullName}</p>
            <p className="truncate text-xs text-muted">
              {user?.roles.map((role) => role.roleName).join(' · ')}
            </p>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
        </button>
        {accountOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-12 w-64 rounded-xl border border-border bg-white p-2 shadow-xl"
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-semibold text-ink">{user?.fullName}</p>
              <p className="mt-0.5 text-xs text-muted">{user?.phone}</p>
              <div className="mt-2">
                <StatusBadge status="active" />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full justify-start"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Chiqish
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const { hasPermission } = useAuth();
  const items = [
    { ...navigation[0]!.items[0]!, icon: LayoutDashboard },
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
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      aria-label="Mobil navigatsiya"
    >
      {items.map(({ icon: Icon, ...item }) => (
        <NavLink
          key={item.to}
          to={item.to}
          {...(item.exact === undefined ? {} : { end: item.exact })}
          className={({ isActive }) =>
            cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted',
              isActive && 'text-primary',
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

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('fincore.sidebar.collapsed') === 'true',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(
    () => localStorage.setItem('fincore.sidebar.collapsed', String(collapsed)),
    [collapsed],
  );
  return (
    <div className="min-h-screen bg-canvas">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Menyuni yopish"
          />
          <div className="relative h-full w-min shadow-2xl">
            <Sidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'transition-[margin] duration-200',
          collapsed ? 'lg:ml-[76px]' : 'lg:ml-[252px]',
        )}
      >
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] px-4 py-6 pb-24 sm:px-6 lg:pb-8 xl:px-8"
        >
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
