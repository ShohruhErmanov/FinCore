import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarPlus, Download, ReceiptText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/features/auth/auth-context';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/cn';
import { downloadCsv } from '@/shared/lib/csv';
import { formatMoney, formatPercent, toChartNumber } from '@/shared/lib/format';
import { drilldownUrl } from '@/shared/lib/url';
import type { AnnualExpenseSummary, TrendGranularity, TrendPoint } from '@/shared/types/domain';
import {
  Button,
  Card,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  Select,
  VarianceText,
} from '@/shared/ui';

const granularityOptions: Array<{ value: TrendGranularity; label: string }> = [
  { value: 'daily', label: 'Kunlik' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Oylik' },
];

function axisMillions(value: number): string {
  return `${Math.round(value / 1_000_000)} mln`;
}

function TrendChart({
  title,
  description,
  points,
  ariaLabel,
  actualColor,
}: {
  title: string;
  description: string;
  points: TrendPoint[];
  ariaLabel: string;
  actualColor: string;
}) {
  const data = points.map((point) => ({
    label: point.label,
    plan: toChartNumber(point.planUzs),
    actual: toChartNumber(point.actualUzs),
  }));
  return (
    <Card title={title} description={description}>
      <div className="h-[300px] w-full" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={axisMillions}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={58}
            />
            <Tooltip
              formatter={(value: number) => formatMoney(String(value))}
              cursor={{ fill: '#eff6ff' }}
            />
            <Legend />
            <Bar dataKey="plan" name="Reja" fill="#94a3b8" radius={[5, 5, 0, 0]} />
            <Bar dataKey="actual" name="Amalda" fill={actualColor} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{helper}</p>
    </div>
  );
}

function exportAnnualSummary(data: AnnualExpenseSummary) {
  downloadCsv(`yillik-xulosa-${data.year}`, [
    ['Oy', 'Doimiy', 'O‘zgaruvchan', 'Jami fakt', 'Oylik reja', 'Farq (reja−fakt)', 'Bajarilish %'],
    ...data.months.map((row) => [
      row.label,
      row.fixedUzs,
      row.variableUzs,
      row.actualUzs,
      row.planUzs,
      row.varianceUzs,
      row.completionPct,
    ]),
    [
      'JAMI',
      data.fixedActualUzs,
      data.variableActualUzs,
      data.totalActualUzs,
      data.totalPlanUzs,
      data.varianceUzs,
      percentOf(data.totalActualUzs, data.totalPlanUzs),
    ],
    [],
    ['Doimiy ulushi %', data.fixedSharePct],
    ['O‘rtacha oylik xarajat', data.averageMonthlyUzs],
    ['O‘rtacha hisoblangan oylar soni', data.averageMonthsCount],
    ['O‘rtacha kiritilgan oylik reja', data.averagePlannedMonthlyUzs],
    ['O‘rtacha reja hisoblangan oylar soni', data.averagePlanMonthsCount],
    ['Eng qimmat oy', data.peakMonth?.label ?? '', data.peakMonth?.actualUzs ?? ''],
  ]);
}

function AnnualCompositionCharts({ data }: { data: AnnualExpenseSummary }) {
  const monthly = data.months.map((row) => ({
    label: row.label,
    fixed: toChartNumber(row.fixedUzs),
    variable: toChartNumber(row.variableUzs),
  }));
  const composition = [
    { name: 'Doimiy', value: toChartNumber(data.fixedActualUzs), color: '#2563eb' },
    { name: 'O‘zgaruvchan', value: toChartNumber(data.variableActualUzs), color: '#f59e0b' },
  ];
  const hasComposition = composition.some((item) => item.value > 0);

  return (
    <div className="mt-4 grid gap-6 xl:grid-cols-2">
      <Card
        title="Oylik xarajatlar: doimiy va o‘zgaruvchan"
        description={`${data.year} yil, oylar kesimi`}
      >
        <div
          className="h-[300px] w-full"
          aria-label="Oylik doimiy va o‘zgaruvchan xarajatlar diagrammasi"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={axisMillions}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={58}
              />
              <Tooltip
                formatter={(value: number) => formatMoney(String(value))}
                cursor={{ fill: '#eff6ff' }}
              />
              <Legend />
              <Bar dataKey="fixed" name="Doimiy" fill="#2563eb" radius={[5, 5, 0, 0]} />
              <Bar
                dataKey="variable"
                name="O‘zgaruvchan"
                fill="#f59e0b"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Tuzilma: doimiy / o‘zgaruvchan (yil)"
        description={`${data.year} yil jami xarajat tarkibi`}
      >
        <div
          className="grid h-[300px] w-full place-items-center"
          aria-label="Yillik doimiy va o‘zgaruvchan xarajatlar diagrammasi"
        >
          {hasComposition ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={composition}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {composition.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatMoney(String(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Xarajat ma’lumoti mavjud emas.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Excel «Xulosa» varag‘ining veb ko‘rinishi. */
function AnnualSummary({ data }: { data: AnnualExpenseSummary }) {
  return (
    <section aria-label="Yillik xulosa" className="mt-8">
      <h2 className="text-lg font-bold text-ink">{data.year} yil xulosasi</h2>
      <p className="mt-0.5 text-sm text-muted">
        Yillik xarajat kesimi va oylik dinamika — tanlangan filial bo‘yicha.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Yillik umumiy xarajat"
          value={<MoneyText value={data.totalActualUzs} compact />}
          helper={`Reja ${formatMoney(data.totalPlanUzs, true)}, farq ${formatMoney(data.varianceUzs, true)}`}
        />
        <SummaryTile
          label="Doimiy xarajatlar (yil)"
          value={<MoneyText value={data.fixedActualUzs} compact />}
          helper="Yillik jami doimiy xarajat"
        />
        <SummaryTile
          label="O‘zgaruvchan xarajatlar (yil)"
          value={<MoneyText value={data.variableActualUzs} compact />}
          helper="Yillik jami o‘zgaruvchan xarajat"
        />
        <SummaryTile
          label="Doimiy ulushi"
          value={<PercentText value={data.fixedSharePct} />}
          helper={`Doimiy ${formatMoney(data.fixedActualUzs, true)} · O‘zgaruvchan ${formatMoney(data.variableActualUzs, true)}`}
        />
        <SummaryTile
          label="O‘rtacha oylik xarajat"
          value={<MoneyText value={data.averageMonthlyUzs} compact />}
          helper={
            data.averageMonthsCount
              ? `Fakt mavjud ${data.averageMonthsCount} oy bo‘yicha`
              : 'Fakt kiritilgan oy yo‘q'
          }
        />
        <SummaryTile
          label="Eng qimmat oy"
          value={
            data.peakMonth ? (
              <MoneyText value={data.peakMonth.actualUzs} compact />
            ) : (
              <span className="text-muted">—</span>
            )
          }
          helper={data.peakMonth ? `${data.peakMonth.label} oyi` : 'Ma’lumot yo‘q'}
        />
        <SummaryTile
          label="O‘rtacha kiritilgan oylik reja"
          value={<MoneyText value={data.averagePlannedMonthlyUzs} compact />}
          helper={
            data.averagePlanMonthsCount
              ? `Reja mavjud ${data.averagePlanMonthsCount} oy bo‘yicha`
              : 'Reja kiritilgan oy yo‘q'
          }
        />
        <SummaryTile
          label="Yillik farq"
          value={<VarianceText value={data.varianceUzs} />}
          helper="Musbat qiymat — budjetdan qolgan summa"
        />
      </div>

      <Card
        title="Oylik dinamika"
        description="Doimiy va o‘zgaruvchan xarajatlar, reja bilan taqqoslash."
        className="mt-4 overflow-hidden"
        actions={
          <Button variant="secondary" size="sm" onClick={() => exportAnnualSummary(data)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">{data.year} yil oylik dinamika jadvali</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 text-left">Oy</th>
                <th className="px-4 py-3 text-right">Doimiy</th>
                <th className="px-4 py-3 text-right">O‘zgaruvchan</th>
                <th className="px-4 py-3 text-right">Jami fakt</th>
                <th className="px-4 py-3 text-right">Oylik reja</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3 text-right">Bajarilish</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((row) => (
                <tr
                  key={row.month}
                  className={cn(
                    'border-b border-border last:border-0',
                    data.peakMonth?.month === row.month && 'bg-amber-50/60',
                  )}
                >
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                    {row.label}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={row.fixedUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={row.variableUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">
                    <MoneyText value={row.actualUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                    <MoneyText value={row.planUzs} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <VarianceText value={row.varianceUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <PercentText value={row.completionPct} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-slate-50 font-bold text-ink">
                <th scope="row" className="px-4 py-3 text-left">
                  JAMI
                </th>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.fixedActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.variableActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.totalActualUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MoneyText value={data.totalPlanUzs} compact />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <VarianceText value={data.varianceUzs} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <PercentText value={percentOf(data.totalActualUzs, data.totalPlanUzs)} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <AnnualCompositionCharts data={data} />
    </section>
  );
}

function percentOf(actualUzs: string, planUzs: string): number | null {
  const plan = BigInt(planUzs);
  if (plan === 0n) return null;
  return Number((BigInt(actualUzs) * 10_000n) / plan) / 100;
}

export function DashboardPage() {
  const { hasPermission } = useAuth();
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
  });

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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:hidden">
        <Select
          aria-label="Davr"
          value={period}
          onChange={(event) => setFilter('period', event.target.value)}
        >
          {(periodsQuery.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filial"
          value={branch}
          onChange={(event) => setFilter('branch', event.target.value)}
        >
          {canSeeAll ? <option value="all">Barchasi</option> : null}
          {visibleBranches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>

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
          label="Jami xarajat"
          value={<MoneyText value={data.expenseActualUzs} compact />}
          helper={`Budjet bajarilishi ${formatPercent(data.expenseCompletionPct)}`}
          tone="neutral"
          to={drilldownUrl(routes.expenses, queryBase)}
          demo={data.isDemo}
        />
        <KpiCard
          label="Tushum farqi"
          value={<MoneyText value={data.revenueVarianceUzs} compact />}
          helper="Musbat qiymat — rejadan ortiq tushum"
          tone={BigInt(data.revenueVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.revenuePlans, { period })}
        />
      </section>

      <section
        aria-label="Xarajat ko‘rsatkichlari"
        className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Xarajat variansi"
          value={<MoneyText value={data.expenseVarianceUzs} compact />}
          helper="Musbat qiymat — budjetdan qolgan summa"
          tone={BigInt(data.expenseVarianceUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.monthlyReport, queryBase)}
        />
        <KpiCard
          label="Doimiy xarajat"
          value={<MoneyText value={data.fixedExpenseUzs} compact />}
          helper="Kategoriya snapshot turi bo‘yicha"
          to={drilldownUrl(routes.expenses, { ...queryBase, expenseType: 'fixed' })}
        />
        <KpiCard
          label="O‘zgaruvchan xarajat"
          value={<MoneyText value={data.variableExpenseUzs} compact />}
          helper="Kategoriya snapshot turi bo‘yicha"
          to={drilldownUrl(routes.expenses, { ...queryBase, expenseType: 'variable' })}
        />
        <KpiCard
          label="Xarajat rejasi"
          value={<MoneyText value={data.expensePlanUzs} compact />}
          helper="Budjetdagi tasdiqlangan reja"
          to={drilldownUrl(routes.budgets, { period })}
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
          className="inline-flex rounded-lg border border-border bg-white p-1"
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
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <TrendChart
          title="Tushum: reja va amalda"
          description={trendScope}
          points={data.revenueTrend}
          ariaLabel="Tushum reja va amalda diagrammasi"
          actualColor="#16a34a"
        />
        <TrendChart
          title="Xarajat: reja va amalda"
          description={trendScope}
          points={data.expenseTrend}
          ariaLabel="Xarajat reja va amalda diagrammasi"
          actualColor="#2563eb"
        />
      </div>

      <AnnualSummary data={data.annual} />

      <Card
        title="Filiallar kesimi"
        description="Tushum va xarajat rejasining bajarilishi"
        className="mt-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.branches.map((item) => (
            <div key={item.branchId} className="rounded-xl border border-border p-5">
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
                      <p className="text-xs text-muted">Tushum · reja {formatMoney(item.revenuePlanUzs)}</p>
                      <MoneyText
                        value={item.revenueActualUzs}
                        className="text-lg font-bold text-ink"
                      />
                    </div>
                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700">
                      <PercentText value={item.revenueCompletionPct} />
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{
                        width: `${Math.max(0, Math.min(item.revenueCompletionPct ?? 0, 100))}%`,
                      }}
                    />
                  </div>
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
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(0, Math.min(item.expenseCompletionPct ?? 0, 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          to={drilldownUrl(routes.revenues, queryBase)}
          className="flex items-center gap-3 rounded-card border border-border bg-white p-4 shadow-card hover:border-blue-300"
        >
          <CalendarPlus className="h-5 w-5 text-success" />
          <div>
            <p className="text-sm font-semibold">Kunlik tushum jurnali</p>
            <p className="text-xs text-muted">Kassirlar kiritgan kunlik yozuvlar</p>
          </div>
        </Link>
        <Link
          to={drilldownUrl(routes.expenses, queryBase)}
          className="flex items-center gap-3 rounded-card border border-border bg-white p-4 shadow-card hover:border-blue-300"
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
