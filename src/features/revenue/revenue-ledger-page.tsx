import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Download, FilterX } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { downloadCsv } from '@/shared/lib/csv';
import { accountingPeriodDateRange, formatDate } from '@/shared/lib/format';
import { updateSearchParam } from '@/shared/lib/url';
import type { DailyRevenue } from '@/shared/types/domain';
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  ErrorState,
  FormField,
  Input,
  KpiCard,
  LoadingState,
  MoneyText,
  PageHeader,
  Pagination,
  type Column,
} from '@/shared/ui';
import { useRevenueReferences } from './revenue-form';

function exportRevenues(rows: DailyRevenue[]) {
  downloadCsv('kunlik-tushum', [
    ['Sana', 'Filial', 'Naqd', 'Karta', 'Bank', 'Jami', 'Kiritgan', 'Izoh'],
    ...rows.map((row) => [
      row.businessDate,
      row.branchName,
      row.cashUzs,
      row.cardUzs,
      row.transferUzs,
      row.totalUzs,
      row.enteredByName,
      row.comment,
    ]),
  ]);
}

export function RevenueLedgerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const branch = searchParams.get('branch') ?? 'all';
  const references = useRevenueReferences();
  const selectedPeriod = references.periods.data?.find(
    (period) => period.id === searchParams.get('period'),
  );
  const automaticRange = selectedPeriod
    ? accountingPeriodDateRange(selectedPeriod.year, selectedPeriod.month)
    : null;
  const explicitDateFrom = searchParams.get('dateFrom');
  const explicitDateTo = searchParams.get('dateTo');
  const dateFrom = explicitDateFrom ?? automaticRange?.from ?? '';
  const dateTo = explicitDateTo ?? automaticRange?.to ?? '';

  useEffect(() => {
    if (!selectedPeriod || !automaticRange) return;
    const monthPrefix = `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}-`;
    if (explicitDateFrom?.startsWith(monthPrefix) && explicitDateTo?.startsWith(monthPrefix))
      return;
    const next = new URLSearchParams(searchParams);
    next.set('dateFrom', automaticRange.from);
    next.set('dateTo', automaticRange.to);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }, [
    automaticRange,
    explicitDateFrom,
    explicitDateTo,
    searchParams,
    selectedPeriod,
    setSearchParams,
  ]);

  const queryString = searchParams.toString();
  const query = useQuery({
    queryKey: queryKeys.revenues(queryString),
    queryFn: ({ signal }) =>
      revenueApi.list(
        {
          branch,
          periodId: searchParams.get('period') ?? undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sort: searchParams.get('sort') ?? 'businessDate:desc',
          page,
          pageSize: 31,
        },
        signal,
      ),
  });

  const columns = useMemo<Column<DailyRevenue>[]>(
    () => [
      {
        key: 'date',
        header: 'Sana',
        cell: (row) => (
          <span className="whitespace-nowrap font-semibold text-ink">
            {formatDate(row.businessDate)}
          </span>
        ),
      },
      { key: 'branch', header: 'Filial', cell: (row) => row.branchName },
      {
        key: 'cash',
        header: 'Naqd',
        className: 'text-right',
        cell: (row) => <MoneyText value={row.cashUzs} className="whitespace-nowrap" />,
      },
      {
        key: 'card',
        header: 'Karta',
        className: 'text-right',
        cell: (row) => <MoneyText value={row.cardUzs} className="whitespace-nowrap" />,
      },
      {
        key: 'transfer',
        header: 'Bank',
        className: 'text-right',
        cell: (row) => <MoneyText value={row.transferUzs} className="whitespace-nowrap" />,
      },
      {
        key: 'total',
        header: 'Jami',
        className: 'text-right',
        cell: (row) => (
          <MoneyText value={row.totalUzs} className="whitespace-nowrap font-bold text-ink" />
        ),
      },
      { key: 'enteredBy', header: 'Kiritgan', cell: (row) => row.enteredByName },
    ],
    [],
  );

  const hasFilters =
    [...searchParams.keys()].some(
      (key) => !['page', 'sort', 'period', 'branch', 'dateFrom', 'dateTo'].includes(key),
    ) ||
    (automaticRange !== null &&
      (searchParams.get('dateFrom') !== automaticRange.from ||
        searchParams.get('dateTo') !== automaticRange.to));
  const clearLocalFilters = () => {
    const next = new URLSearchParams();
    const period = searchParams.get('period');
    const selectedBranch = searchParams.get('branch');
    if (period) next.set('period', period);
    if (selectedBranch) next.set('branch', selectedBranch);
    if (automaticRange) {
      next.set('dateFrom', automaticRange.from);
      next.set('dateTo', automaticRange.to);
    }
    setSearchParams(next, { replace: true });
  };
  const pageSummary = useMemo(
    () =>
      (query.data?.items ?? []).reduce(
        (summary, row) => ({
          cash: summary.cash + BigInt(row.cashUzs),
          card: summary.card + BigInt(row.cardUzs),
          transfer: summary.transfer + BigInt(row.transferUzs),
          total: summary.total + BigInt(row.totalUzs),
        }),
        { cash: 0n, card: 0n, transfer: 0n, total: 0n },
      ),
    [query.data?.items],
  );

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Operatsiyalar' }, { label: 'Kunlik tushum', current: true }]}
      />
      <PageHeader
        title="Kunlik tushum"
        description="Har bir kun va filial uchun bitta yozuv: naqd, karta va bank tushumi."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!query.data?.items.length}
              onClick={() => exportRevenues(query.data?.items ?? [])}
            >
              <Download className="h-4 w-4" /> CSV yuklab olish
            </Button>
            {references.me.data?.permissions.includes('revenue.create') ? (
              <Link
                to={routes.revenueNew}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)] hover:bg-blue-600"
              >
                <CalendarPlus className="h-4 w-4" /> Tushum kiritish
              </Link>
            ) : null}
          </>
        }
      />

      <Card title="Qo‘shimcha filtrlar" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:max-w-3xl">
          <FormField label="Boshlanish sanasi" htmlFor="revenue-date-from">
            <Input
              id="revenue-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'dateFrom', event.target.value)
              }
            />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="revenue-date-to">
            <Input
              id="revenue-date-to"
              type="date"
              value={dateTo}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'dateTo', event.target.value)
              }
            />
          </FormField>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              disabled={!hasFilters}
              onClick={clearLocalFilters}
            >
              <FilterX className="h-4 w-4" /> Filtrlarni tozalash
            </Button>
          </div>
        </div>
      </Card>

      {query.isLoading ? <LoadingState label="Kunlik tushumlar yuklanmoqda…" /> : null}
      {query.isError ? (
        <ErrorState
          message={getApiErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <>
          <section
            aria-label="Kunlik tushum ko‘rsatkichlari"
            className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label="Jami tushum"
              value={<MoneyText value={pageSummary.total.toString()} />}
              helper={`${query.data.items.length} ta yozuv · joriy sahifa`}
              tone="info"
            />
            <KpiCard
              label="Naqd tushum"
              value={<MoneyText value={pageSummary.cash.toString()} />}
              helper="Joriy sahifadagi naqd tushum"
              tone="success"
            />
            <KpiCard
              label="Karta tushumi"
              value={<MoneyText value={pageSummary.card.toString()} />}
              helper="Joriy sahifadagi karta tushumi"
              tone="neutral"
            />
            <KpiCard
              label="Bank o‘tkazmasi"
              value={<MoneyText value={pageSummary.transfer.toString()} />}
              helper="Joriy sahifadagi bank tushumi"
              tone="neutral"
            />
          </section>

          <Card
            className="overflow-hidden"
            title={`${query.data.total} ta kunlik yozuv`}
            description="Tanlangan davr va filtrlar bo‘yicha batafsil yozuvlar"
          >
            <div className="-m-5">
              <DataTable
                columns={columns}
                rows={query.data.items}
                caption="Kunlik tushum jurnali"
                onRowClick={(row) => navigate(routes.revenueDetail(row.id))}
              />
              <Pagination
                page={page}
                pageSize={31}
                total={query.data.total}
                onPageChange={(nextPage) =>
                  updateSearchParam(searchParams, setSearchParams, 'page', String(nextPage))
                }
              />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
