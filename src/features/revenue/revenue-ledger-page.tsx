import { useQuery } from '@tanstack/react-query';
import { CirclePlus, Download, RefreshCw, Search } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { revenueApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import type { RevenueTransaction } from '@/shared/types/domain';
import {
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
  StatusBadge,
  type Column,
} from '@/shared/ui';
import {
  FilterCard,
  NativeFilter,
  numericPage,
  querySignature,
  sumMoney,
  useRevenueReferences,
} from './revenue-shared';

function exportCurrentPage(rows: RevenueTransaction[]) {
  const cells = [
    [
      'Sana/vaqt',
      'Biznes sanasi',
      'Kvitansiya',
      'Filial',
      'Kassir',
      'Kiritgan',
      'To‘lov kanali',
      'Summa (UZS)',
      'Status',
      'Tashqi reference',
    ],
    ...rows.map((row) => [
      row.paymentAt,
      row.paymentBusinessDate,
      row.receiptNo,
      row.branchName,
      row.collectorName,
      row.enteredByName,
      row.paymentMethodName,
      row.amountUzs,
      row.status,
      row.externalReference ?? '',
    ]),
  ];
  const csv = cells
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fincore-tushumlar-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RevenueLedgerPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewAll = hasPermission('revenue.view_all');
  const branch = canViewAll
    ? searchParams.get('branch') || 'all'
    : searchParams.get('branch') || references.branches.data?.[0]?.id || 'all';
  const page = numericPage(searchParams.get('page'));
  const pageSize = 20;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next);
  };
  const query = {
    branch,
    periodId: searchParams.get('period') ?? undefined,
    paymentMethod: searchParams.get('paymentMethod') ?? undefined,
    collector: searchParams.get('collector') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    page,
    pageSize,
  };
  const transactions = useQuery({
    queryKey: queryKeys.revenueTransactions(querySignature(searchParams)),
    queryFn: ({ signal }) => revenueApi.transactions(query, signal),
  });
  const pageTotal = useMemo(
    () =>
      sumMoney(
        transactions.data?.items.map((item) => (item.status === 'posted' ? item.amountUzs : '0')) ??
          [],
      ),
    [transactions.data],
  );
  const columns: Column<RevenueTransaction>[] = [
    {
      key: 'date',
      header: 'Sana / vaqt',
      cell: (row) => (
        <div>
          <p className="whitespace-nowrap font-medium text-ink">{formatDateTime(row.paymentAt)}</p>
          {row.timePrecision === 'date_only' ? (
            <p className="text-xs text-warning">Vaqt mavjud emas</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'receipt',
      header: 'Kvitansiya',
      cell: (row) => <span className="font-mono text-xs">#{row.receiptNo}</span>,
    },
    { key: 'branch', header: 'Filial', cell: (row) => row.branchName },
    {
      key: 'collector',
      header: 'Kassir',
      cell: (row) => (
        <div>
          <p className="font-medium text-ink">{row.collectorName}</p>
          {row.enteredOnBehalf ? <p className="text-xs text-info">Boshqa user kiritgan</p> : null}
        </div>
      ),
    },
    { key: 'channel', header: 'Kanal', cell: (row) => row.paymentMethodName },
    {
      key: 'amount',
      header: 'Summa',
      className: 'text-right',
      cell: (row) => (
        <MoneyText
          value={row.amountUzs}
          className={
            row.status === 'reversed' ? 'text-muted line-through' : 'font-semibold text-ink'
          }
        />
      ),
    },
    { key: 'status', header: 'Holat', cell: (row) => <StatusBadge status={row.status} /> },
  ];
  return (
    <>
      <PageHeader
        title="Tushum jurnali"
        description="Barcha posted va reversed tushumlarning auditli, server-side paginationli jurnali."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!transactions.data?.items.length}
              onClick={() => exportCurrentPage(transactions.data?.items ?? [])}
            >
              <Download className="h-4 w-4" />
              Joriy sahifa CSV
            </Button>
            <Button variant="secondary" onClick={() => void transactions.refetch()}>
              <RefreshCw className={`h-4 w-4 ${transactions.isFetching ? 'animate-spin' : ''}`} />
              Yangilash
            </Button>
            {hasPermission('revenue.create') ? (
              <Link
                to={routes.revenueNew}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <CirclePlus className="h-4 w-4" />
                Yangi tushum
              </Link>
            ) : null}
          </div>
        }
      />
      <FilterCard>
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
        <NativeFilter
          label="Davr"
          value={searchParams.get('period') || 'all'}
          allLabel="Barcha davrlar"
          onChange={(value) => setFilter('period', value)}
        >
          {references.periods.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="To‘lov kanali"
          value={searchParams.get('paymentMethod') || 'all'}
          allLabel="Barcha kanallar"
          onChange={(value) => setFilter('paymentMethod', value)}
        >
          {references.paymentMethods.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label="Kassir"
          value={searchParams.get('collector') || 'all'}
          allLabel="Barcha kassirlar"
          onChange={(value) => setFilter('collector', value)}
        >
          {references.users.data
            ?.filter((item) => item.roles.some((role) => role.role === 'cashier'))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
                {item.status !== 'active' ? ' (nofaol, tarixiy)' : ''}
              </option>
            ))}
        </NativeFilter>
        <NativeFilter
          label="Holat"
          value={searchParams.get('status') || 'all'}
          allLabel="Barcha holatlar"
          onChange={(value) => setFilter('status', value)}
        >
          <option value="posted">Qabul qilingan</option>
          <option value="reversed">Bekor qilingan</option>
        </NativeFilter>
        <FormField label="Boshlanish sanasi" htmlFor="revenue-date-from">
          <Input
            id="revenue-date-from"
            type="date"
            value={searchParams.get('dateFrom') || ''}
            onChange={(event) => setFilter('dateFrom', event.target.value)}
          />
        </FormField>
        <FormField label="Tugash sanasi" htmlFor="revenue-date-to">
          <Input
            id="revenue-date-to"
            type="date"
            value={searchParams.get('dateTo') || ''}
            onChange={(event) => setFilter('dateTo', event.target.value)}
          />
        </FormField>
        <FormField label="Qidiruv" htmlFor="revenue-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <Input
              id="revenue-search"
              className="pl-9"
              value={searchParams.get('search') || ''}
              placeholder="Kvitansiya yoki izoh"
              onChange={(event) => setFilter('search', event.target.value)}
            />
          </div>
        </FormField>
      </FilterCard>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Joriy sahifa sof posted summasi"
          value={<MoneyText value={pageTotal} />}
          helper="Bekor qilingan satrlar hisobga olinmaydi."
        />
        <KpiCard
          label="Topilgan tranzaksiyalar"
          value={transactions.data?.total ?? '—'}
          helper="Server-side filtr natijasidagi jami satrlar."
        />
      </div>
      {transactions.isLoading ? (
        <LoadingState label="Tushumlar yuklanmoqda…" />
      ) : transactions.isError ? (
        <ErrorState
          message={getApiErrorMessage(transactions.error)}
          onRetry={() => void transactions.refetch()}
        />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={transactions.data?.items ?? []}
            caption="Tushum tranzaksiyalari"
            onRowClick={(row) => navigate(routes.revenueDetail(row.id))}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={transactions.data?.total ?? 0}
            onPageChange={(nextPage) => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(nextPage));
              setSearchParams(next);
            }}
          />
        </Card>
      )}
    </>
  );
}
