import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Plus,
  ReceiptText,
  Scale,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/features/auth/auth-context';
import { dashboardApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatMoney, formatPercent, toChartNumber } from '@/shared/lib/format';
import { drilldownUrl } from '@/shared/lib/url';
import {
  Alert,
  Button,
  Card,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  Select,
} from '@/shared/ui';

function axisMillions(value: number): string {
  return `${Math.round(value / 1_000_000)} mln`;
}

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
  const canSeeAll = hasPermission('expense.view_all_branches') || hasPermission('revenue.view_all');
  const visibleBranches =
    branchesQuery.data?.filter((branch) => user?.branchScopes.includes(branch.id)) ?? [];
  const requestedBranch = searchParams.get('branch');
  const branch = canSeeAll
    ? (requestedBranch ?? 'all')
    : visibleBranches.some((item) => item.id === requestedBranch)
      ? (requestedBranch ?? '')
      : (visibleBranches[0]?.id ?? '');
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(period, branch),
    queryFn: ({ signal }) => dashboardApi.get({ period, branch }, signal),
    enabled: Boolean(period && branch),
  });

  function setFilter(key: 'period' | 'branch', value: string) {
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
  const trend = data.monthlyTrend.map((item) => ({
    ...item,
    plan: toChartNumber(item.planUzs),
    actual: toChartNumber(item.actualUzs),
  }));

  return (
    <div>
      <PageHeader
        title="Moliyaviy dashboard"
        description={`${data.period.label} bo‘yicha server hisoblagan reja, tushum, xarajat va sof moliyaviy natija.`}
        actions={
          <>
            {hasPermission('expense.create') ? (
              <Link to={routes.expenseNew}>
                <Button variant="secondary">
                  <ReceiptText className="h-4 w-4" />
                  Xarajat kiritish
                </Button>
              </Link>
            ) : null}
            {hasPermission('revenue.create') ? (
              <Link to={routes.revenueNew}>
                <Button>
                  <Plus className="h-4 w-4" />
                  Tushum kiritish
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

      {data.dataQuality.status !== 'healthy' ? (
        <Alert title="Hisobotda data-quality tafovuti bor" tone="warning" className="mb-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <span>
              {data.dataQuality.openCount} ta ochiq muammo sabab{' '}
              {formatMoney(data.dataQuality.excludedAmountUzs)} reportga kirmagan.
            </span>
            {hasPermission('import.run') ? (
              <Link
                to={drilldownUrl(routes.dataQuality, queryBase)}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
              >
                Tekshirish <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="text-xs font-semibold">Moliya mas’uli tekshiradi</span>
            )}
          </div>
        </Alert>
      ) : null}

      <section
        aria-label="Asosiy ko‘rsatkichlar"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Kutilgan tushum"
          value={<MoneyText value={data.revenuePlanUzs} compact />}
          helper={
            branch === 'all'
              ? 'Ikki filialning tasdiqlangan tushum rejasi'
              : 'Tanlangan filialning tasdiqlangan tushum rejasi'
          }
          tone="info"
          to={drilldownUrl(
            hasPermission('revenue_plan.create_edit') ? routes.revenuePlans : routes.revenueReport,
            queryBase,
          )}
          demo={data.isDemo}
        />
        <KpiCard
          label="Sof tushgan pul"
          value={<MoneyText value={data.revenueActualUzs} compact />}
          helper={`Yig‘im darajasi ${formatPercent(data.collectionPct)}`}
          tone={data.collectionPct !== null && data.collectionPct >= 90 ? 'success' : 'warning'}
          to={drilldownUrl(routes.revenueTransactions, queryBase)}
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
          label="Sof moliyaviy natija"
          value={<MoneyText value={data.netResultUzs} compact />}
          helper={`Tushumga nisbatan marja ${formatPercent(data.netMarginPct)}`}
          tone={BigInt(data.netResultUzs) >= 0n ? 'success' : 'danger'}
          to={drilldownUrl(routes.profitLoss, queryBase)}
          demo={data.isDemo}
        />
      </section>

      <section
        aria-label="Qo‘shimcha ko‘rsatkichlar"
        className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Tushum yetishmovchiligi"
          value={<MoneyText value={data.revenueGapUzs} compact />}
          helper="Rejaga yetmagan summa; ortiqcha tushum alohida ko‘rsatiladi"
          tone={BigInt(data.revenueGapUzs) > 0n ? 'danger' : 'success'}
          to={drilldownUrl(routes.revenueReport, queryBase)}
        />
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
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card
          title="Reja va amaldagi tushum dinamikasi"
          description="Diagrammadagi qiymatlar server reportidan olingan."
        >
          <div
            className="h-[310px] w-full"
            aria-label="Oylar bo‘yicha reja va amaldagi tushum diagrammasi"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
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
                <Bar dataKey="actual" name="Amalda" fill="#2563eb" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Tushum kanallari" description="Naqd, karta va bank kesimi">
          <div className="space-y-5">
            {data.channels.map((channel) => (
              <Link
                key={channel.id}
                to={drilldownUrl(routes.revenueTransactions, {
                  ...queryBase,
                  paymentMethod: channel.id,
                })}
                className="block rounded-lg p-2 transition hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-primary">
                      <CircleDollarSign className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{channel.name}</p>
                      <p className="text-xs text-muted">{formatPercent(channel.sharePct)} ulush</p>
                    </div>
                  </div>
                  <MoneyText value={channel.amountUzs} className="font-bold text-ink" />
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(channel.sharePct ?? 0, 100))}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Filiallar bo‘yicha yig‘im"
        description="Kutilgan tushumga nisbatan amaldagi tushum"
        className="mt-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.branches.map((item) => (
            <Link
              key={item.branchId}
              to={drilldownUrl(routes.revenueReport, { period, branch: item.branchId })}
              className="rounded-xl border border-border p-5 transition hover:border-blue-300 hover:bg-blue-50/30"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{item.name}</p>
                  <p className="mt-1 text-xs text-muted">Reja: {formatMoney(item.planUzs)}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                  <PercentText value={item.collectionPct} />
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-muted">Amalda</p>
                  <MoneyText value={item.actualUzs} className="text-xl font-bold text-ink" />
                </div>
                <ArrowRight className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(item.collectionPct ?? 0, 100))}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Link
          to={drilldownUrl(routes.revenueTransactions, queryBase)}
          className="flex items-center gap-3 rounded-card border border-border bg-white p-4 shadow-card hover:border-blue-300"
        >
          <CircleDollarSign className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Tushum ledgeri</p>
            <p className="text-xs text-muted">Kanal va kassir bo‘yicha ochish</p>
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
        {hasPermission('import.run') ? (
          <Link
            to={drilldownUrl(routes.dataQuality, queryBase)}
            className="flex items-center gap-3 rounded-card border border-border bg-white p-4 shadow-card hover:border-blue-300"
          >
            <AlertTriangle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-semibold">Reconciliation</p>
              <p className="text-xs text-muted">Manba va ledger tengligini tekshirish</p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-card border border-border bg-white p-4 text-muted shadow-card">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-semibold text-ink">Reconciliation</p>
              <p className="text-xs">Faqat moliya va direktor uchun</p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted">
        <Scale className="h-4 w-4" />
        Foiz va sof natija backend hisobidan olinadi; frontend moliyaviy source of truth emas.
      </p>
    </div>
  );
}
