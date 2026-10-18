import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FilePlus2, FileSpreadsheet, FilterX, Upload } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { expenseApi, referenceApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { downloadCsv } from '@/shared/lib/csv';
import { accountingPeriodDateRange, formatDate } from '@/shared/lib/format';
import { updateSearchParam } from '@/shared/lib/url';
import type { Expense } from '@/shared/types/domain';
import { downloadJournalXlsx, journalCsvRows, loadAllJournalExpenses } from './journal-export';
import {
  Alert,
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
  Select,
  type Column,
} from '@/shared/ui';

function exportCurrentPage(rows: Expense[], startSequence: number) {
  downloadCsv('jurnal', journalCsvRows(rows, startSequence));
}

export function ExpenseLedgerPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = [10, 20, 50].includes(Number(searchParams.get('pageSize')))
    ? Number(searchParams.get('pageSize'))
    : 20;
  const branch = searchParams.get('branch') ?? 'all';

  // Navbar davri va filiali barcha sahifalar uchun yagona kontekst hisoblanadi.
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const selectedPeriodId = searchParams.get('period');
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === selectedPeriodId);
  const year = selectedPeriod?.year?.toString();
  const month = selectedPeriod?.month?.toString();
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

  const listFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    year,
    month,
    branch,
    categoryId: searchParams.get('category') ?? undefined,
    expenseType: searchParams.get('expenseType') ?? undefined,
    departmentId: searchParams.get('department') ?? undefined,
    paymentMethodId: searchParams.get('paymentMethod') ?? undefined,
    responsibleUserId: searchParams.get('responsible') ?? undefined,
    enteredByUserId: searchParams.get('enteredBy') ?? undefined,
    sort: searchParams.get('sort') ?? 'transactionDate:desc',
  };
  const queryString = `${searchParams.toString()}|${year ?? ''}-${month ?? ''}`;
  const query = useQuery({
    queryKey: queryKeys.expenses(queryString),
    queryFn: ({ signal }) =>
      expenseApi.list(
        {
          ...listFilters,
          page,
          pageSize,
        },
        signal,
      ),
  });

  const excelExport = useMutation({
    mutationFn: async () => {
      const rows = await loadAllJournalExpenses((filters) => expenseApi.list(filters), listFilters);
      await downloadJournalXlsx(rows);
    },
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.master('categories'),
    queryFn: ({ signal }) => referenceApi.categories(signal),
    staleTime: 300_000,
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.master('departments'),
    queryFn: ({ signal }) => referenceApi.departments(signal),
    staleTime: 300_000,
  });
  const paymentMethodsQuery = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
    staleTime: 300_000,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
    staleTime: 60_000,
  });

  const rowNumberById = useMemo(
    () =>
      new Map(
        (query.data?.items ?? []).map((row, index) => [row.id, (page - 1) * pageSize + index + 1]),
      ),
    [page, pageSize, query.data?.items],
  );

  const columns = useMemo<Column<Expense>[]>(
    () => [
      {
        key: 'number',
        header: '№',
        className: 'text-center',
        cell: (row) => rowNumberById.get(row.id) ?? '—',
      },
      {
        key: 'date',
        header: 'Sana',
        cell: (row) => (
          <span className="whitespace-nowrap font-medium">{formatDate(row.transactionDate)}</span>
        ),
      },
      { key: 'year', header: 'Yil', cell: (row) => row.transactionDate.slice(0, 4) },
      {
        key: 'month',
        header: 'Oy',
        cell: (row) => String(Number(row.transactionDate.slice(5, 7))),
      },
      {
        key: 'category',
        header: 'Kategoriya',
        cell: (row) => (
          <span className="min-w-48 font-medium text-ink">{row.categoryNameSnapshot}</span>
        ),
      },
      {
        key: 'type',
        header: 'Turi',
        cell: (row) => (row.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'),
      },
      {
        key: 'description',
        header: 'Tavsif / nima uchun',
        cell: (row) => <span className="line-clamp-2 min-w-64">{row.description}</span>,
      },
      {
        key: 'amount',
        header: 'Summa, so‘m',
        className: 'text-right',
        cell: (row) => (
          <MoneyText value={row.amountUzs} className="whitespace-nowrap font-bold text-ink" />
        ),
      },
      {
        key: 'payment',
        header: 'To‘lov usuli',
        cell: (row) => <span className="whitespace-nowrap">{row.paymentMethodName}</span>,
      },
      { key: 'department', header: 'Bo‘lim', cell: (row) => row.departmentName },
      { key: 'responsible', header: 'Mas’ul', cell: (row) => row.responsibleUserName || '—' },
      { key: 'branch', header: 'Filial', cell: (row) => row.branchName },
      {
        key: 'comment',
        header: 'Izoh',
        cell: (row) => <span className="line-clamp-2 min-w-40">{row.comment || '—'}</span>,
      },
    ],
    [rowNumberById],
  );

  const clearFilters = () => {
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
  const hasFilters =
    [...searchParams.keys()].some(
      (key) =>
        !['page', 'pageSize', 'sort', 'period', 'branch', 'dateFrom', 'dateTo'].includes(key),
    ) ||
    (automaticRange !== null &&
      (searchParams.get('dateFrom') !== automaticRange.from ||
        searchParams.get('dateTo') !== automaticRange.to));
  const pageSummary = useMemo(() => {
    const amounts = (query.data?.items ?? []).map((row) => BigInt(row.amountUzs));
    const total = amounts.reduce((sum, amount) => sum + amount, 0n);
    const largest = amounts.reduce((maximum, amount) => (amount > maximum ? amount : maximum), 0n);
    return {
      total,
      largest,
      average: amounts.length > 0 ? total / BigInt(amounts.length) : 0n,
    };
  }, [query.data?.items]);

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Operatsiyalar' }, { label: 'Jurnal', current: true }]} />
      <PageHeader
        title="Jurnal"
        description="Excel’dagi Sayxun_kassa va Xalqlar_kassa yozuvlari bilan bir xil 13 ustunli yagona server jurnali."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!query.data?.items.length}
              onClick={() => exportCurrentPage(query.data?.items ?? [], (page - 1) * pageSize + 1)}
            >
              <Download className="h-4 w-4" /> Joriy sahifa CSV
            </Button>
            <Button
              variant="secondary"
              loading={excelExport.isPending}
              disabled={!query.data?.total}
              onClick={() => excelExport.mutate()}
            >
              <FileSpreadsheet className="h-4 w-4" /> To‘liq Excel
            </Button>
            {hasPermission('import.run') ? (
              <Link
                to={routes.imports}
                className="inline-flex min-h-11 items-center gap-2 neu-raised-sm neu-interactive rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-raised"
              >
                <Upload className="h-4 w-4" /> Excel’dan import
              </Link>
            ) : null}
            {hasPermission('expense.create') ? (
              <Link
                to={routes.expenseNew}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-[rgb(var(--primary-contrast))] shadow-[var(--neu-shadow-1)] hover:bg-blue-600"
              >
                <FilePlus2 className="h-4 w-4" /> Yangi xarajat
              </Link>
            ) : null}
          </>
        }
      />

      {excelExport.isError ? (
        <Alert title="Excel eksport bajarilmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(excelExport.error)}
        </Alert>
      ) : null}

      <Card
        title="Filtrlar"
        description="Natijalar serverda filtrlanadi va deterministic tartibda qaytariladi."
        className="mb-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Boshlanish sanasi" htmlFor="expense-date-from">
            <Input
              id="expense-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'dateFrom', event.target.value)
              }
            />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="expense-date-to">
            <Input
              id="expense-date-to"
              type="date"
              value={dateTo}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'dateTo', event.target.value)
              }
            />
          </FormField>
          <FormField label="Kategoriya" htmlFor="expense-category">
            <Select
              id="expense-category"
              value={searchParams.get('category') ?? ''}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'category', event.target.value)
              }
            >
              <option value="">Barcha kategoriyalar</option>
              {(categoriesQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Xarajat turi" htmlFor="expense-type">
            <Select
              id="expense-type"
              value={searchParams.get('expenseType') ?? ''}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'expenseType', event.target.value)
              }
            >
              <option value="">Barcha turlar</option>
              <option value="fixed">Doimiy</option>
              <option value="variable">O‘zgaruvchan</option>
            </Select>
          </FormField>
          <FormField label="Bo‘lim" htmlFor="expense-department">
            <Select
              id="expense-department"
              value={searchParams.get('department') ?? ''}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'department', event.target.value)
              }
            >
              <option value="">Barcha bo‘limlar</option>
              {(departmentsQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="To‘lov usuli" htmlFor="expense-payment-method">
            <Select
              id="expense-payment-method"
              value={searchParams.get('paymentMethod') ?? ''}
              onChange={(event) =>
                updateSearchParam(
                  searchParams,
                  setSearchParams,
                  'paymentMethod',
                  event.target.value,
                )
              }
            >
              <option value="">Barcha usullar</option>
              {(paymentMethodsQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Mas’ul" htmlFor="expense-responsible">
            <Select
              id="expense-responsible"
              value={searchParams.get('responsible') ?? ''}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'responsible', event.target.value)
              }
            >
              <option value="">Barcha mas’ullar</option>
              {(usersQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                  {item.status !== 'active' ? ' (tarixiy)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Kiritgan xodim" htmlFor="expense-entered-by">
            <Select
              id="expense-entered-by"
              value={searchParams.get('enteredBy') ?? ''}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'enteredBy', event.target.value)
              }
            >
              <option value="">Barcha xodimlar</option>
              {(usersQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Saralash" htmlFor="expense-sort">
            <Select
              id="expense-sort"
              value={searchParams.get('sort') ?? 'transactionDate:desc'}
              onChange={(event) =>
                updateSearchParam(searchParams, setSearchParams, 'sort', event.target.value)
              }
            >
              <option value="transactionDate:desc">Yangi sanadan</option>
              <option value="transactionDate:asc">Eski sanadan</option>
            </Select>
          </FormField>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              <FilterX className="h-4 w-4" /> Filtrlarni tozalash
            </Button>
          </div>
        </div>
      </Card>

      {query.isLoading ? <LoadingState label="Jurnal yuklanmoqda…" /> : null}
      {query.isError ? (
        <ErrorState
          message={getApiErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <>
          <section
            aria-label="Jurnal ko‘rsatkichlari"
            className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label="Jami xarajat"
              value={<MoneyText value={pageSummary.total.toString()} />}
              helper={`${query.data.items.length} ta yozuv · joriy sahifa`}
              tone="warning"
            />
            <KpiCard
              label="Filtrlangan yozuvlar"
              value={query.data.total}
              helper="Tanlangan davr va filtrlar bo‘yicha"
              tone="info"
            />
            <KpiCard
              label="O‘rtacha xarajat"
              value={<MoneyText value={pageSummary.average.toString()} />}
              helper="Joriy sahifadagi bitta yozuv hisobida"
              tone="neutral"
            />
            <KpiCard
              label="Eng katta xarajat"
              value={<MoneyText value={pageSummary.largest.toString()} />}
              helper="Joriy sahifadagi eng yuqori summa"
              tone="neutral"
            />
          </section>

          <Card
            className="overflow-hidden"
            title={`${query.data.total} ta xarajat`}
            description={
              query.isFetching ? 'Natijalar yangilanmoqda…' : 'Batafsil xarajat yozuvlari'
            }
          >
            <div className="-m-5">
              <DataTable
                columns={columns}
                rows={query.data.items}
                caption="Filtrlangan umumiy Jurnal"
                onRowClick={(row) => navigate(routes.expenseDetail(row.id))}
              />
              <Pagination
                page={page}
                pageSize={pageSize}
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
