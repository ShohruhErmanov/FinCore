import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Landmark, WalletCards } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { drilldownUrl } from '@/shared/lib/url';
import type { RevenueChannelSummary, RevenueKpiSummary } from '@/shared/types/domain';
import {
  Alert,
  Card,
  DataTable,
  ErrorState,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  type Column,
} from '@/shared/ui';
import { FilterCard, NativeFilter, querySignature, useRevenueReferences } from './revenue-shared';

export function RevenueReportPage() {
  const { user, hasPermission } = useAuth();
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodId =
    searchParams.get('period') ||
    references.periods.data?.find((period) => period.status === 'open')?.id ||
    references.periods.data?.[0]?.id ||
    '';
  const canViewAll = hasPermission('revenue.view_all');
  const requestedBranch = searchParams.get('branch');
  const firstScopedBranch = references.branches.data?.find((item) =>
    user?.branchScopes.includes(item.id),
  )?.id;
  const branch = canViewAll
    ? requestedBranch || 'all'
    : references.branches.data?.some(
          (item) => item.id === requestedBranch && user?.branchScopes.includes(item.id),
        )
      ? (requestedBranch ?? firstScopedBranch ?? '')
      : (firstScopedBranch ?? '');
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || !value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };
  const report = useQuery({
    queryKey: queryKeys.report('revenue', `${periodId}:${branch}:${querySignature(searchParams)}`),
    queryFn: ({ signal }) => revenueApi.report({ periodId, branch }, signal),
    enabled: periodId.length > 0,
  });
  const channelColumns: Column<RevenueChannelSummary>[] = [
    {
      key: 'channel',
      header: 'To‘lov kanali',
      cell: (row) => <span className="font-semibold text-ink">{row.paymentMethodName}</span>,
    },
    {
      key: 'count',
      header: 'Tranzaksiya',
      cell: (row) => <span className="tabular-nums">{row.transactionCount}</span>,
    },
    {
      key: 'amount',
      header: 'Fakt',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.amountUzs} className="font-semibold" />,
    },
    {
      key: 'share',
      header: 'Ulush',
      className: 'text-right',
      cell: (row) => <PercentText value={row.sharePercent} />,
    },
    {
      key: 'detail',
      header: '',
      cell: (row) => (
        <Link
          to={drilldownUrl(routes.revenueTransactions, {
            period: periodId,
            branch,
            paymentMethod: row.paymentMethodId,
            status: 'posted',
          })}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Drill-down
          <ArrowRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];
  const isLoading = report.isLoading;
  const error = report.error;
  return (
    <>
      <PageHeader
        title="Tushum hisoboti"
        description="Reja, haqiqiy posted tushum, yetishmagan summa va yig‘ilish foizi filial hamda kanal kesimida."
      />
      <FilterCard>
        <NativeFilter
          label="Davr"
          value={periodId}
          onChange={(value) => setFilter('period', value)}
        >
          {references.periods.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="Filial"
          value={branch}
          allLabel={canViewAll ? 'Barcha filiallar' : undefined}
          onChange={(value) => setFilter('branch', value)}
        >
          {references.branches.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeFilter>
      </FilterCard>
      {isLoading ? (
        <LoadingState label="Tushum hisoboti hisoblanmoqda…" />
      ) : error ? (
        <ErrorState message={getApiErrorMessage(error)} onRetry={() => void report.refetch()} />
      ) : report.data ? (
        <>
          <Alert title="Ko‘rsatkich ta’rifi" tone="info" className="mb-5">
            <strong>Yig‘ilish foizi</strong> = haqiqiy tushum / tasdiqlangan reja. Bu sof foyda
            emas.
          </Alert>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Tasdiqlangan reja"
              value={<MoneyText value={report.data.center.expectedRevenueUzs} />}
              helper="Tanlangan filiallar rejasi yig‘indisi."
              tone="info"
              to={drilldownUrl(routes.revenuePlans, { period: periodId })}
            />
            <KpiCard
              label="Haqiqiy tushum"
              value={<MoneyText value={report.data.center.actualRevenueUzs} />}
              helper="Faqat posted tranzaksiyalar."
              tone="success"
              to={drilldownUrl(routes.revenueTransactions, {
                period: periodId,
                branch,
                status: 'posted',
              })}
            />
            <KpiCard
              label={
                report.data.center.overPlanUzs !== '0'
                  ? 'Rejadan ortiq tushum'
                  : 'Rejaga yetmagan summa'
              }
              value={
                <MoneyText
                  value={
                    report.data.center.overPlanUzs !== '0'
                      ? report.data.center.overPlanUzs
                      : report.data.center.shortfallUzs
                  }
                />
              }
              helper={
                report.data.center.overPlanUzs !== '0'
                  ? 'Tasdiqlangan rejadan ortiq yig‘ilgan summa.'
                  : 'Rejani yopish uchun qolgan summa.'
              }
              tone={report.data.center.shortfallUzs !== '0' ? 'warning' : 'success'}
            />
            <KpiCard
              label="Yig‘ilish foizi"
              value={<PercentText value={report.data.center.collectionPercent} />}
              helper={
                report.data.center.expectedRevenueUzs === '0'
                  ? 'Reja 0: foiz hisoblanmaydi.'
                  : 'Fakt / tasdiqlangan reja.'
              }
              tone={(report.data.center.collectionPercent ?? 0) >= 100 ? 'success' : 'warning'}
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <Card
              title="To‘lov kanallari"
              description="Har bir satr canonical jurnal filtriga olib boradi."
            >
              <DataTable
                columns={channelColumns}
                rows={report.data.channels}
                caption="Tushumning to‘lov kanallari bo‘yicha taqsimoti"
              />
            </Card>
            <Card
              title="Filiallar kesimi"
              description="Barcha filiallar filtri yozuv huquqini anglatmaydi."
            >
              <div className="space-y-5">
                {report.data.branches.map((item) => (
                  <BranchProgress
                    key={item.branchId}
                    name={item.branchName}
                    kpi={item.kpi}
                    periodId={periodId}
                    branchId={item.branchId}
                  />
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

function BranchProgress({
  name,
  kpi,
  periodId,
  branchId,
}: {
  name: string;
  kpi: RevenueKpiSummary;
  periodId: string;
  branchId: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Landmark className="h-4 w-4 text-primary" />
            {name}
          </p>
          <p className="mt-1 text-xs text-muted">
            Reja: <MoneyText value={kpi.expectedRevenueUzs} />
          </p>
        </div>
        <span className="text-lg font-bold text-ink">
          <PercentText value={kpi.collectionPercent} />
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${name}: rejaning ${kpi.collectionPercent ?? 0} foizi yig‘ilgan`}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, kpi.collectionPercent ?? 0))}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-1 font-semibold text-success">
          <WalletCards className="h-4 w-4" />
          <MoneyText value={kpi.actualRevenueUzs} />
        </span>
        <Link
          className="font-semibold text-primary hover:underline"
          to={drilldownUrl(routes.revenueTransactions, {
            period: periodId,
            branch: branchId,
            status: 'posted',
          })}
        >
          Tafsilot
        </Link>
      </div>
    </div>
  );
}
