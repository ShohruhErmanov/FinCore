import { useQuery } from '@tanstack/react-query';
import { ArrowRight, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { drilldownUrl } from '@/shared/lib/url';
import type { CashierSummary } from '@/shared/types/domain';
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

type CashierRow = CashierSummary & { id: string };

export function CashierReportPage() {
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodId =
    searchParams.get('period') ||
    references.periods.data?.find((period) => period.status === 'open')?.id ||
    references.periods.data?.[0]?.id ||
    '';
  const branch = searchParams.get('branch') || 'all';
  const collector = searchParams.get('collector') || 'all';
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || !value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };
  const report = useQuery({
    queryKey: queryKeys.report('cashiers', querySignature(searchParams)),
    queryFn: ({ signal }) =>
      revenueApi.cashiers(
        {
          periodId,
          branch: branch === 'all' ? undefined : branch,
          collector: collector === 'all' ? undefined : collector,
        },
        signal,
      ),
    enabled: periodId.length > 0,
  });
  const rows = useMemo<CashierRow[]>(
    () =>
      (report.data?.items ?? []).map((item) => ({
        ...item,
        id: `${item.collectorUserId}-${item.branchId}`,
      })),
    [report.data?.items],
  );
  const columns: Column<CashierRow>[] = [
    {
      key: 'cashier',
      header: 'Kassir',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.collectorName}</p>
          <p
            className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${row.isActive ? 'text-success' : 'text-slate-600'}`}
          >
            {row.isActive ? (
              <UserRoundCheck className="h-3.5 w-3.5" />
            ) : (
              <UserRoundX className="h-3.5 w-3.5" />
            )}
            {row.isActive ? 'Faol' : 'Nofaol · tarixiy yozuv'}
          </p>
        </div>
      ),
    },
    { key: 'branch', header: 'Filial', cell: (row) => row.branchName },
    {
      key: 'count',
      header: 'Tranzaksiya',
      cell: (row) => <span className="tabular-nums">{row.transactionCount}</span>,
    },
    {
      key: 'cash',
      header: 'Naqd',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.cashUzs} />,
    },
    {
      key: 'card',
      header: 'Karta',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.cardUzs} />,
    },
    {
      key: 'bank',
      header: 'Bank',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.bankUzs} />,
    },
    {
      key: 'total',
      header: 'Jami',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.totalUzs} className="font-bold text-ink" />,
    },
    {
      key: 'share',
      header: 'Filial ulushi',
      className: 'text-right',
      cell: (row) => <PercentText value={row.branchSharePct} />,
    },
    {
      key: 'detail',
      header: '',
      cell: (row) => (
        <Link
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          to={drilldownUrl(routes.revenueTransactions, {
            period: periodId,
            branch: row.branchId,
            collector: row.collectorUserId,
            status: 'posted',
          })}
        >
          Tranzaksiyalar
          <ArrowRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Kassirlar hisoboti"
        description="Kim, qaysi filialda va qaysi kanal orqali qancha tushum qabul qilganini ko‘rsatadi."
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
          allLabel="Barcha filiallar"
          onChange={(value) => setFilter('branch', value)}
        >
          {references.branches.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="Kassir"
          value={collector}
          allLabel="Barcha kassirlar"
          onChange={(value) => setFilter('collector', value)}
        >
          {references.users.data
            ?.filter((item) => item.roles.some((role) => role.role === 'cashier'))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
                {item.status !== 'active' ? ' (nofaol)' : ''}
              </option>
            ))}
        </NativeFilter>
      </FilterCard>
      <Alert title="Tarixiy kassirlar saqlanadi" tone="info" className="mb-5">
        User nofaol qilingan bo‘lsa ham uning oldingi tushumlari hisobotdan yo‘qolmaydi va alohida
        belgi bilan ko‘rinadi.
      </Alert>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Kassirlar tushumi"
          value={<MoneyText value={report.data?.summary.totalUzs ?? '0'} />}
          helper="Filtrlangan kassirlar posted tushumlari."
          tone="success"
        />
        <KpiCard
          label="Kassirlar"
          value={report.data?.summary.cashierCount ?? 0}
          helper="Tarixiy kassirlar bilan birga."
        />
        <KpiCard
          label="Nofaol tarixiy kassir"
          value={report.data?.summary.inactiveCount ?? 0}
          helper="Hisobotdan chiqarib tashlanmagan qatorlar."
          tone={(report.data?.summary.inactiveCount ?? 0) > 0 ? 'info' : 'neutral'}
        />
      </div>
      {report.isLoading ? (
        <LoadingState label="Kassirlar hisoboti yuklanmoqda…" />
      ) : report.isError ? (
        <ErrorState
          message={getApiErrorMessage(report.error)}
          onRetry={() => void report.refetch()}
        />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={rows}
            caption="Kassirlarning filial va to‘lov kanallari bo‘yicha tushumi"
          />
        </Card>
      )}
    </>
  );
}
