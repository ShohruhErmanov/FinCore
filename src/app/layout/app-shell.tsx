import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  Bell,
  HandCoins,
  PieChart,
  Building2,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { isNavItemActive, navigation, routes, type NavigationItem } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { monthNameUz } from '@/shared/lib/format';
import type { AccountingPeriod } from '@/shared/types/domain';
import {
  BrandMark,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadge,
  useToast,
} from '@/shared/ui';

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
  // Not NavLink's own isActive: it lights ancestors as well, which is what put
  // two entries in the same highlighted state.
  const isActive = isNavItemActive(item, pathname);
  return (
    <NavLink
      to={item.to}
      {...(onClick ? { onClick } : {})}
      {...(collapsed ? { title: item.label } : {})}
      {...(isActive ? { 'aria-current': 'page' as const } : {})}
      className={() =>
        cn(
          'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 transition-all duration-200 hover:translate-x-0.5 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
          isActive &&
            'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_12px_28px_-16px_rgba(37,99,235,0.95)] ring-1 ring-white/10',
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
        'fincore-sidebar flex h-full flex-col text-white',
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
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-[0_12px_28px_-14px_rgba(59,130,246,0.95)] ring-1 ring-white/30">
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
                  // Two entries may legitimately share a path — "Kassirlar" and
                  // "Mening natijam" both open the cashier report for different
                  // audiences — so the label is part of the key.
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
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accountOpen, setAccountOpen] = useState(false);
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [yearError, setYearError] = useState<string>();
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
  // The period is one row in the database, but the bar offers it as year +
  // month, because that is how the office thinks about a reporting period.
  const periods = periodsQuery.data ?? [];

  // The bar reads as app-wide state but it lives in the URL, and in-app links
  // carry no query — so every click would otherwise snap the filter back to
  // its default. Remembering the last explicit choice lets the selection
  // survive navigation. It is re-validated on use, because the remembered
  // branch may be one this account can no longer see.
  const lastChoice = useRef<{ period?: string; branch?: string }>({});
  const rememberedPeriod = periods.some((period) => period.id === lastChoice.current.period)
    ? lastChoice.current.period
    : undefined;

  // Default to the month we are actually in. Every month of the year now exists
  // as an open period, so "the first open one" would land on December.
  const today = new Date();
  const selectedPeriod =
    searchParams.get('period') ??
    rememberedPeriod ??
    periods.find(
      (period) => period.year === today.getFullYear() && period.month === today.getMonth() + 1,
    )?.id ??
    periods.find((period) => period.status === 'open')?.id ??
    '';

  const canSeeAllBranches = hasPermission('expense.view_all_branches');
  const defaultBranch = canSeeAllBranches ? 'all' : (accessibleBranches[0]?.id ?? '');
  const rememberedBranch =
    lastChoice.current.branch === 'all'
      ? canSeeAllBranches
        ? 'all'
        : undefined
      : accessibleBranches.some((branch) => branch.id === lastChoice.current.branch)
        ? lastChoice.current.branch
        : undefined;
  const selectedBranch = searchParams.get('branch') ?? rememberedBranch ?? defaultBranch;

  const currentPeriod = periods.find((period) => period.id === selectedPeriod);
  const selectedBranchName =
    selectedBranch === 'all'
      ? 'Barcha filiallar'
      : (accessibleBranches.find((branch) => branch.id === selectedBranch)?.name ??
        'Filial tanlanmagan');
  const globalScopeLabel = currentPeriod
    ? `${monthNameUz(currentPeriod.month)} ${currentPeriod.year} · ${selectedBranchName}`
    : `Davr tanlanmagan · ${selectedBranchName}`;
  const years = [...new Set(periods.map((period) => period.year))].sort((a, b) => b - a);
  const selectedYear = currentPeriod?.year ?? years[0];
  const monthsOfYear = periods
    .filter((period) => period.year === selectedYear)
    .sort((a, b) => a.month - b.month);

  /** Switching year keeps the same month when that month exists in the new year. */
  function selectYear(year: number) {
    const sameMonth = periods.find(
      (period) => period.year === year && period.month === currentPeriod?.month,
    );
    const newest = periods
      .filter((period) => period.year === year)
      .sort((a, b) => b.month - a.month)[0];
    const next = sameMonth ?? newest;
    if (next) updateFilter('period', next.id);
  }

  function updateFilter(key: 'period' | 'branch', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  const createYear = useMutation({
    mutationFn: (year: number) => referenceApi.createAccountingYear(year),
    onSuccess: (createdPeriods, year) => {
      queryClient.setQueryData<AccountingPeriod[]>(queryKeys.periods, (current = []) =>
        [...current.filter((period) => period.year !== year), ...createdPeriods].sort(
          (a, b) => b.year - a.year || b.month - a.month,
        ),
      );
      const preferredMonth = currentPeriod?.month ?? new Date().getMonth() + 1;
      const next =
        createdPeriods.find((period) => period.month === preferredMonth) ?? createdPeriods[0];
      if (next) updateFilter('period', next.id);
      setYearModalOpen(false);
      setYearError(undefined);
      notify({
        tone: 'success',
        title: `${year} yil qo‘shildi`,
        message: '12 oy yaratildi va tanlangan oy yangi yilga o‘tkazildi.',
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.periods });
    },
    onError: (error) => {
      notify({
        tone: 'danger',
        title: 'Yil qo‘shilmadi',
        message: getApiErrorMessage(error),
      });
    },
  });

  function openYearModal() {
    const suggested = Math.min((years[0] ?? new Date().getFullYear()) + 1, 2100);
    setNewYear(String(suggested));
    setYearError(undefined);
    setYearModalOpen(true);
  }

  function submitYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(newYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setYearError('2000–2100 oralig‘idagi to‘liq yilni kiriting.');
      return;
    }
    if (years.includes(year)) {
      setYearError(`${year} yil allaqachon mavjud.`);
      return;
    }
    setYearError(undefined);
    createYear.mutate(year);
  }

  // The bar resolves its own defaults, but every page reads the filter back
  // out of the URL and falls back differently when it is missing — which is
  // how the bar could read "Avgust" while the page below it reported
  // December. Publishing the resolved value makes the URL the single source
  // both sides read. replace: true keeps this out of the history stack.
  useEffect(() => {
    // Whatever the URL states explicitly becomes the choice to carry forward,
    // so a shared link sets the filter just as the dropdowns do.
    const fromUrl = { period: searchParams.get('period'), branch: searchParams.get('branch') };
    if (fromUrl.period) lastChoice.current.period = fromUrl.period;
    if (fromUrl.branch) lastChoice.current.branch = fromUrl.branch;

    const next = new URLSearchParams(searchParams);
    if (selectedPeriod && !fromUrl.period) next.set('period', selectedPeriod);
    if (selectedBranch && !fromUrl.branch) next.set('branch', selectedBranch);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [selectedPeriod, selectedBranch, searchParams, setSearchParams]);

  return (
    <>
      <header className="fincore-topbar sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center gap-3 border-b border-white/80 px-4 py-2 sm:flex-nowrap sm:px-6">
        <div className="contents">
          <button
            type="button"
            onClick={onOpenMenu}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Menyuni ochish"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="order-3 grid w-full grid-cols-3 gap-2 sm:order-none sm:flex sm:w-auto sm:items-center">
            <div className="flex min-w-0 gap-1.5">
              <Select
                aria-label="Hisobot yili"
                value={selectedYear ?? ''}
                onChange={(event) => selectYear(Number(event.target.value))}
                className="min-w-0 flex-1 border-slate-200/70 bg-slate-100/80 font-semibold shadow-none sm:w-28"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
              {hasPermission('master_data.manage') ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 min-h-11 w-11 shrink-0 px-0"
                  aria-label="Yangi yil qo‘shish"
                  title="Yangi yil qo‘shish"
                  onClick={openYearModal}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <Select
              aria-label="Hisobot oyi"
              value={selectedPeriod}
              onChange={(event) => updateFilter('period', event.target.value)}
              className="w-full border-slate-200/70 bg-slate-100/80 font-semibold shadow-none sm:w-36"
            >
              {monthsOfYear.map((period) => (
                <option key={period.id} value={period.id}>
                  {monthNameUz(period.month)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filial"
              value={selectedBranch}
              onChange={(event) => updateFilter('branch', event.target.value)}
              className="w-full border-slate-200/70 bg-slate-100/80 font-semibold shadow-none sm:w-44"
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
        <div className="order-4 flex w-full min-w-0 justify-center sm:order-none sm:w-auto sm:flex-1">
          <p
            className="max-w-full truncate rounded-full border border-slate-200/80 bg-white/70 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm"
            aria-label="Global hisobot konteksti"
          >
            {globalScopeLabel}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((value) => !value)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-left transition hover:bg-white hover:shadow-sm"
            // Mobil ekranda ism yashiriladi va faqat bosh harflar qoladi —
            // tugmaning nomi baribir to‘liq bo‘lishi kerak.
            aria-label={user ? `${user.fullName} — hisob menyusi` : 'Hisob menyusi'}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-sky-100 text-sm font-bold text-blue-700 ring-1 ring-blue-200/70">
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
              className="absolute right-0 top-14 w-64 rounded-card border border-border/90 bg-white/95 p-2 shadow-elevated backdrop-blur-xl"
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
      <Modal
        open={yearModalOpen}
        onClose={() => {
          if (!createYear.isPending) setYearModalOpen(false);
        }}
        title="Yangi hisobot yilini qo‘shish"
        description="Tanlangan yil uchun yanvardan dekabrgacha 12 ta ochiq hisob davri yaratiladi."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={createYear.isPending}
              onClick={() => setYearModalOpen(false)}
            >
              Bekor qilish
            </Button>
            <Button type="submit" form="accounting-year-form" loading={createYear.isPending}>
              Yilni qo‘shish
            </Button>
          </div>
        }
      >
        <form id="accounting-year-form" onSubmit={submitYear}>
          <FormField
            label="Hisobot yili"
            htmlFor="accounting-year"
            required
            hint="Masalan: 2027"
            error={yearError}
          >
            <Input
              id="accounting-year"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              step={1}
              autoFocus
              value={newYear}
              aria-invalid={Boolean(yearError)}
              aria-describedby={yearError ? 'accounting-year-error' : undefined}
              onChange={(event) => {
                setNewYear(event.target.value);
                setYearError(undefined);
              }}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}

function MobileBottomNav() {
  const { hasPermission } = useAuth();
  const { pathname } = useLocation();
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
          className="premium-enter mx-auto w-full max-w-[1600px] px-4 py-7 pb-24 sm:px-6 lg:pb-10 xl:px-8"
        >
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
