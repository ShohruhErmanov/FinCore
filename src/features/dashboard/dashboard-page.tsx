import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, CalendarPlus, ReceiptText, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { MonthlyNetProfit } from './monthly-net-profit';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import { drilldownUrl } from '@/shared/lib/url';
import type { TrendGranularity } from '@/shared/types/domain';
import {
  Button,
  Card,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  ProgressBar,
} from '@/shared/ui';
import { expensePlanComparison } from './dashboard-format';
import { TrendChart } from './trend-chart';
import { AnnualSummary } from './annual-summary';

const granularityOptions: Array<{ value: TrendGranularity; label: string }> = [
  { value: 'daily', label: 'Kunlik' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Oylik' },
];

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
  });
  const period =
    searchParams.get('period') ??
    periodsQuery.data?.find((item) => item.status === 'open')?.id ??
    '';
  const periodsByYear = periodsQuery.data ?? [];
  const availableYears = [...new Set(periodsByYear.map((item) => item.year))].sort((a, b) => b - a);
  const selectYear = (year: number) => {
    // The first month of that year that exists, so the app bar's month select
    // lands on something real rather than on an id that is not in its list.
    const target = periodsByYear
      .filter((item) => item.year === year)
      .sort((a, b) => a.month - b.month)[0];
    if (!target) return;
    const next = new URLSearchParams(searchParams);
    next.set('period', target.id);
    setSearchParams(next, { replace: true });
  };

  const requestedGranularity = searchParams.get('granularity');
  const granularity: TrendGranularity =
    requestedGranularity === 'daily' || requestedGranularity === 'weekly'
      ? requestedGranularity
      : 'monthly';
  const canSeeAll = hasPermission('expense.view_all_branches');
  const visibleBranches = branchesQuery.data ?? [];
  const requestedBranch = searchParams.get('branch');
  const branch = canSeeAll
    ? (requestedBranch ?? 'all')
    : visibleBranches.some((item) => item.id === requestedBranch)
      ? (requestedBranch ?? '')
      : (visibleBranches[0]?.id ?? '');
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(period, branch, granularity),
    queryFn: ({ signal }) => dashboardApi.get({ period, branch, granularity }, signal),
    enabled: Boolean(period && branch),
    // Switching the trend between days, weeks and months only re-buckets the
    // charts, so the page stays on screen while the new buckets load instead of
    // being swapped for the loading state (which also threw the scroll back to
    // the top). Another period or branch is other money: that still waits.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === period && previousQuery.queryKey[2] === branch
        ? previous
        : undefined,
  });
  const trendUpdating = dashboardQuery.isPlaceholderData;

  function setFilter(key: 'period' | 'branch' | 'granularity', value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  if (dashboardQuery.isLoading || periodsQuery.isLoading || branchesQuery.isLoading)
    return <LoadingState label="Dashboard yuklanmoqda…" />;
  if (dashboardQuery.isError || !dashboardQuery.data)
    return <ErrorState onRetry={() => void dashboardQuery.refetch()} />;
  const data = dashboardQuery.data;
  const canViewNetProfit =
    user?.roles.some((assignment) =>
      ['director', 'business_owner', 'finance_manager'].includes(assignment.role),
    ) ?? false;
  const visibleNetProfit = canViewNetProfit ? data.annualNetProfit : undefined;
  const netResult = visibleNetProfit
    ? BigInt(data.revenueActualUzs) - BigInt(data.expenseActualUzs)
    : null;
  const heroAmountUzs = netResult?.toString() ?? data.revenueActualUzs;
  const queryBase = { period, branch };
  const trendScope =
    granularity === 'monthly'
      ? `${data.period.year} yil, oylar kesimi`
      : granularity === 'weekly'
        ? `${data.period.label}, haftalar kesimi`
        : `${data.period.label}, kunlar kesimi`;

  return (
    <div>
      <PageHeader
        title="Moliyaviy dashboard"
        description={`${data.period.label} bo‘yicha server hisoblagan tushum va xarajat reja-fakti.`}
        actions={
          <>
            {hasPermission('revenue.create') ? (
              <Link to={routes.revenueNew}>
                <Button>
                  <CalendarPlus className="h-4 w-4" />
                  Tushum kiritish
                </Button>
              </Link>
            ) : null}
            {hasPermission('expense.create') ? (
              <Link to={routes.expenseNew}>
                <Button variant="secondary">
                  <ReceiptText className="h-4 w-4" />
                  Xarajat kiritish
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <section
        aria-label="FinCore Pulse"
        className="neu-hero relative mb-5 overflow-hidden rounded-[24px] border border-border/70 p-6 text-ink sm:p-7"
      >
        <div className="relative grid gap-7 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="neu-inset inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              FinCore Pulse
            </div>
            <p className="mt-5 max-w-2xl text-sm font-medium text-muted">
              {netResult === null
                ? `${data.period.label} uchun amaldagi tushum`
                : `${data.period.label} uchun tushum va xarajatning tezkor operatsion natijasi`}
            </p>
            <div className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              <MoneyText value={heroAmountUzs} compact />
            </div>
            <p className="mt-2 text-sm text-muted">
              {netResult === null
                ? 'Tanlangan davr bo‘yicha qayd etilgan amaldagi tushum.'
                : netResult > 0n
                  ? 'Tushum xarajatdan yuqori — davr natijasi musbat.'
                  : netResult < 0n
                    ? 'Xarajat tushumdan yuqori — rahbar e’tibori talab qilinadi.'
                    : 'Davr uchun tushum va xarajat ma’lumoti hali shakllanmagan.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 p-4 neu-on-navy">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-muted">Tushum rejasi</span>
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {formatPercent(data.revenueCompletionPct)}
              </p>
              <ProgressBar value={data.revenueCompletionPct} className="mt-3 h-1.5" />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-xs neu-on-navy">
              <span className="text-muted">Ma’lumot holati</span>
              <span className="inline-flex items-center gap-2 font-bold text-ink">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Server agregati
              </span>
            </div>
          </div>
        </div>
      </section>

      {visibleNetProfit ? (
        <MonthlyNetProfit
          data={visibleNetProfit}
          years={availableYears}
          onYearChange={selectYear}
        />
      ) : null}

      <section
        aria-label="Tushum ko‘rsatkichlari"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Tushum rejasi"
          value={<MoneyText value={data.revenuePlanUzs} compact />}
          helper={`${data.period.label} uchun oylik reja`}
          tone="info"
          to={drilldownUrl(routes.revenuePlans, { period })}
          demo={data.isDemo}
        />
        <KpiCard
          label="Amaldagi tushum"
          value={<MoneyText value={data.revenueActualUzs} compact />}
          helper={`Reja bajarilishi ${formatPercent(data.revenueCompletionPct)}`}
          tone={
            data.revenueCompletionPct !== null && data.revenueCompletionPct >= 90
              ? 'success'
              : 'warning'
          }
          to={drilldownUrl(routes.revenues, queryBase)}
          demo={data.isDemo}
        />
        <KpiCard
          label="Jami xarajatlar"
          value={<MoneyText value={data.expenseActualUzs} compact />}
          helper={expensePlanComparison(
            data.expensePlanUzs,
            data.expenseVarianceUzs,
            data.expenseCompletionPct,
          )}
          tone="neutral"
          to={drilldownUrl(routes.expenseAnalytics, queryBase)}
          demo={data.isDemo}
        />
        <KpiCard
          label="Xarajat rejasi"
          value={<MoneyText value={data.expensePlanUzs} compact />}
          helper="Budjetdagi tasdiqlangan reja"
          tone="info"
          to={drilldownUrl(routes.expensePlanAnalytics, queryBase)}
        />
      </section>

      <section aria-label="Xarajat ko‘rsatkichlari" className="mt-4 grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Xarajat variansi"
          value={<MoneyText value={data.expenseVarianceUzs} compact />}
          helper="Musbat qiymat — budjetdan qolgan summa"
          tone={BigInt(data.expenseVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.monthlyReport, queryBase)}
        />
        <KpiCard
          label="Tushum farqi"
          value={<MoneyText value={data.revenueVarianceUzs} compact />}
          helper="Musbat qiymat — rejadan ortiq tushum"
          tone={BigInt(data.revenueVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.revenuePlans, { period })}
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Reja va amaldagi dinamika</h2>
          <p className="mt-0.5 text-sm text-muted">{trendScope}</p>
        </div>
        <div
          role="group"
          aria-label="Diagramma kesimi"
          className="neu-inset inline-flex rounded-lg p-1"
        >
          {granularityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={granularity === option.value}
              onClick={() => setFilter('granularity', option.value)}
              className={cn(
                'min-h-9 rounded-md px-4 text-sm font-semibold transition',
                granularity === option.value
                  ? 'bg-primary text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)]'
                  : 'text-slate-600 hover:bg-surface/70',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-busy={trendUpdating}
        className={cn(
          'mt-4 grid gap-6 transition-opacity duration-200 xl:grid-cols-2',
          trendUpdating && 'opacity-60',
        )}
      >
        <TrendChart
          title="Tushum: reja va amalda"
          description={trendScope}
          points={data.revenueTrend}
          ariaLabel="Tushum reja va amalda diagrammasi"
          tone="revenue"
        />
        <TrendChart
          title="Xarajat: reja va amalda"
          description={trendScope}
          points={data.expenseTrend}
          ariaLabel="Xarajat reja va amalda diagrammasi"
          tone="expense"
        />
      </div>

      <AnnualSummary
        data={data.annual}
        revenue={data.annualRevenue}
        netProfit={visibleNetProfit}
        growth={data.revenueGrowth}
      />

      <Card
        title="Filiallar kesimi"
        description="Tushum va xarajat rejasining bajarilishi"
        className="mt-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.branches.map((item) => (
            <div key={item.branchId} className="neu-raised-sm rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <p className="font-semibold text-ink">{item.name}</p>
                <Link
                  to={drilldownUrl(routes.revenues, { period, branch: item.branchId })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Kunlik tushum <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        Tushum · reja {formatMoney(item.revenuePlanUzs)}
                      </p>
                      <MoneyText
                        value={item.revenueActualUzs}
                        className="text-lg font-bold text-ink"
                      />
                    </div>
                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700">
                      <PercentText value={item.revenueCompletionPct} />
                    </span>
                  </div>
                  <ProgressBar
                    value={item.revenueCompletionPct}
                    className="mt-2 h-2"
                    barClassName="bg-success"
                  />
                </div>
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        Xarajat · reja {formatMoney(item.expensePlanUzs)}
                      </p>
                      <MoneyText
                        value={item.expenseActualUzs}
                        className="text-lg font-bold text-ink"
                      />
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                      <PercentText value={item.expenseCompletionPct} />
                    </span>
                  </div>
                  <ProgressBar value={item.expenseCompletionPct} className="mt-2 h-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          to={drilldownUrl(routes.revenues, queryBase)}
          className="neu-raised neu-interactive flex items-center gap-3 rounded-card p-4 hover:border-blue-300"
        >
          <CalendarPlus className="h-5 w-5 text-success" />
          <div>
            <p className="text-sm font-semibold">Kunlik tushum jurnali</p>
            <p className="text-xs text-muted">Kassirlar kiritgan kunlik yozuvlar</p>
          </div>
        </Link>
        <Link
          to={drilldownUrl(routes.expenses, queryBase)}
          className="neu-raised neu-interactive flex items-center gap-3 rounded-card p-4 hover:border-blue-300"
        >
          <ReceiptText className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Xarajat ledgeri</p>
            <p className="text-xs text-muted">Kategoriya va bo‘lim detali</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
