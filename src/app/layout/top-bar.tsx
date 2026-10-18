import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, Menu, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { monthNameUz, tashkentBusinessDate } from '@/shared/lib/format';
import type { AccountingPeriod } from '@/shared/types/domain';
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadge,
  ThemeToggle,
  useToast,
} from '@/shared/ui';

export function TopBar({
  onOpenMenu,
  notificationCount,
}: {
  onOpenMenu: () => void;
  notificationCount: number;
}) {
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
  const todayDate = tashkentBusinessDate();
  const todayYear = Number(todayDate.slice(0, 4));
  const todayMonth = Number(todayDate.slice(5, 7));
  const selectedPeriod =
    searchParams.get('period') ??
    rememberedPeriod ??
    periods.find((period) => period.year === todayYear && period.month === todayMonth)?.id ??
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
      const preferredMonth = currentPeriod?.month ?? todayMonth;
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
    const suggested = Math.min((years[0] ?? todayYear) + 1, 2100);
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
      <header className="fincore-topbar sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2 sm:px-6 lg:top-3 lg:mx-3 lg:rounded-2xl lg:border xl:flex-nowrap">
        <div className="contents">
          <button
            type="button"
            onClick={onOpenMenu}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-surface hover:shadow-[var(--neu-shadow-1)] active:shadow-[var(--neu-pressed)] lg:hidden"
            aria-label="Menyuni ochish"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="order-3 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:order-none xl:flex xl:w-auto xl:items-center">
            <div className="flex min-w-0 gap-1.5 max-[360px]:col-span-2">
              <Select
                aria-label="Hisobot yili"
                value={selectedYear ?? ''}
                onChange={(event) => selectYear(Number(event.target.value))}
                className="min-w-0 flex-1 font-semibold xl:w-28"
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
              className="w-full font-semibold max-[360px]:col-span-2 xl:w-36"
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
              className="col-span-2 w-full font-semibold sm:col-span-1 xl:w-44"
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
            className="neu-raised-sm max-w-full truncate rounded-full px-3.5 py-2 text-xs font-bold text-slate-600"
            aria-label="Global hisobot konteksti"
          >
            {globalScopeLabel}
          </p>
        </div>
        <ThemeToggle />
        {hasPermission('notification.manage') ? (
          <NavLink
            to={routes.notifications}
            end
            aria-label={
              notificationCount > 0
                ? `Bildirishnomalar — ${notificationCount} ta yangi xabar`
                : 'Bildirishnomalar'
            }
            title={
              notificationCount > 0
                ? `${notificationCount} ta yangi bildirishnoma`
                : 'Bildirishnomalar'
            }
            className={({ isActive }) =>
              cn(
                'relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
                isActive
                  ? 'border-blue-200 bg-blue-50 text-primary shadow-[var(--neu-pressed)]'
                  : 'neu-raised-sm hover:shadow-[var(--neu-shadow-2)] active:shadow-[var(--neu-pressed)]',
              )
            }
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {notificationCount > 0 ? (
              <span
                aria-label={`${notificationCount} ta yangi kassir tahriri`}
                className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-[rgb(var(--primary-contrast))] shadow-[0_0_0_3px_rgb(var(--surface)/0.96)]"
              >
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            ) : null}
          </NavLink>
        ) : null}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((value) => !value)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-left transition hover:bg-surface hover:shadow-[var(--neu-shadow-1)] active:shadow-[var(--neu-pressed)]"
            // Mobil ekranda ism yashiriladi va faqat bosh harflar qoladi —
            // tugmaning nomi baribir to‘liq bo‘lishi kerak.
            aria-label={user ? `${user.fullName} — hisob menyusi` : 'Hisob menyusi'}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
          >
            <div className="neu-inset grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-primary ring-1 ring-primary/15">
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
              className="neu-elevated neu-pop absolute right-0 top-14 w-64 rounded-card p-2"
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
