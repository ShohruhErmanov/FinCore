import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FilterX,
  Pencil,
  Save,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth-context';
import { authApi, expenseApi, referenceApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { invalidateExpenseAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { getActiveWritableBranches } from '@/shared/lib/branch-scopes';
import { downloadCsv } from '@/shared/lib/csv';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import type { Expense, ExpenseType } from '@/shared/types/domain';
import { downloadJournalXlsx, journalCsvRows, loadAllJournalExpenses } from './journal-export';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  type Column,
} from '@/shared/ui';

const expenseFormSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani YYYY-MM-DD formatida kiriting.'),
  branchId: z.string().optional(),
  categoryId: z.string().min(1, 'Kategoriyani tanlang.'),
  description: z
    .string()
    .trim()
    .min(3, 'Kamida 3 ta belgi kiriting.')
    .max(500, '500 belgidan oshmasin.'),
  amountUzs: z
    .string()
    .regex(/^\d+$/, 'Faqat butun so‘m kiriting.')
    .refine((value) => BigInt(value) > 0n, 'Summa 0 dan katta bo‘lishi kerak.'),
  paymentMethodId: z.string().min(1, 'To‘lov usulini tanlang.'),
  departmentId: z.string().min(1, 'Bo‘limni tanlang.'),
  responsibleUserId: z.string().min(1, 'Mas’ul xodimni tanlang.'),
  comment: z.string().max(1000, '1000 belgidan oshmasin.').optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function updateQueryParam(
  current: URLSearchParams,
  setter: ReturnType<typeof useSearchParams>[1],
  key: string,
  value: string,
) {
  const next = new URLSearchParams(current);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key !== 'page') next.delete('page');
  setter(next, { replace: true });
}

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

  // The ledger follows the period chosen in the top bar. An explicit
  // year/month filter on this page still wins, so a user can look outside
  // the selected period without changing it for every other screen.
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 300_000,
  });
  const selectedPeriodId = searchParams.get('period');
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === selectedPeriodId);
  const year = searchParams.get('year') ?? selectedPeriod?.year?.toString();
  const month = searchParams.get('month') ?? selectedPeriod?.month?.toString();

  const listFilters = {
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
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

  const branchesQuery = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
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

  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = [...searchParams.keys()].some(
    (key) => !['page', 'pageSize', 'sort'].includes(key),
  );

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
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" /> Excel’dan import
              </Link>
            ) : null}
            {hasPermission('expense.create') ? (
              <Link
                to={routes.expenseNew}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-700"
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
              value={searchParams.get('dateFrom') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'dateFrom', event.target.value)
              }
            />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="expense-date-to">
            <Input
              id="expense-date-to"
              type="date"
              value={searchParams.get('dateTo') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'dateTo', event.target.value)
              }
            />
          </FormField>
          <FormField label="Filial" htmlFor="expense-branch">
            <Select
              id="expense-branch"
              value={branch}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'branch', event.target.value)
              }
            >
              <option value="all">Barchasi</option>
              {(branchesQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Kategoriya" htmlFor="expense-category">
            <Select
              id="expense-category"
              value={searchParams.get('category') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'category', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'expenseType', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'department', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'paymentMethod', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'responsible', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'enteredBy', event.target.value)
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
                updateQueryParam(searchParams, setSearchParams, 'sort', event.target.value)
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
        <Card
          className="overflow-hidden"
          title={`${query.data.total} ta xarajat`}
          description={
            query.isFetching ? 'Natijalar yangilanmoqda…' : 'Ruxsat doirasidagi natijalar'
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
                updateQueryParam(searchParams, setSearchParams, 'page', String(nextPage))
              }
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function useExpenseReferences() {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const categories = useQuery({
    queryKey: queryKeys.master('categories'),
    queryFn: ({ signal }) => referenceApi.categories(signal),
    staleTime: 300_000,
  });
  const departments = useQuery({
    queryKey: queryKeys.master('departments'),
    queryFn: ({ signal }) => referenceApi.departments(signal),
    staleTime: 300_000,
  });
  const paymentMethods = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
    staleTime: 300_000,
  });
  const users = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
    staleTime: 60_000,
  });
  return { me, branches, periods, categories, departments, paymentMethods, users };
}

export function ExpenseCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const references = useExpenseReferences();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      transactionDate: '',
      branchId: '',
      categoryId: '',
      description: '',
      amountUzs: '',
      paymentMethodId: '',
      departmentId: '',
      responsibleUserId: '',
      comment: '',
    },
  });

  const watchedCategory = watch('categoryId');
  const watchedDate = watch('transactionDate');
  const currentUser = references.me.data;
  const writableBranches = getActiveWritableBranches(
    references.branches.data ?? [],
    currentUser?.writeBranchScopes,
  );
  const fixedWriteBranch = writableBranches.length === 1 ? (writableBranches[0] ?? null) : null;
  const canChooseBranch = writableBranches.length > 1;
  const hasNoWritableBranch = Boolean(currentUser) && writableBranches.length === 0;
  const selectedCategory = references.categories.data?.find((item) => item.id === watchedCategory);
  const selectedPeriod = references.periods.data?.find(
    (period) =>
      `${period.year}-${String(period.month).padStart(2, '0')}` === watchedDate.slice(0, 7),
  );

  useEffect(() => {
    if (!canChooseBranch && fixedWriteBranch) setValue('branchId', fixedWriteBranch.id);
    if (!watch('responsibleUserId') && currentUser?.id)
      setValue('responsibleUserId', currentUser.id);
  }, [canChooseBranch, fixedWriteBranch, currentUser?.id, setValue, watch]);

  const mutation = useMutation({
    mutationFn: expenseApi.create,
    onSuccess: async (created) => {
      await invalidateExpenseAggregates(queryClient);
      navigate(routes.expenseDetail(created.id), { replace: true });
    },
  });

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || mutation.isSuccess) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty, mutation.isSuccess]);

  const cancelCreate = () => {
    if (
      !isDirty ||
      window.confirm('Saqlanmagan o‘zgarishlar bor. Formadan chiqishni tasdiqlaysizmi?')
    ) {
      navigate(routes.expenses);
    }
  };

  const onSubmit = handleSubmit((values) => {
    const branchId = canChooseBranch ? values.branchId : (fixedWriteBranch?.id ?? values.branchId);
    if (!branchId || !writableBranches.some((branch) => branch.id === branchId)) {
      setError('branchId', { message: 'Yozish ruxsati bor filialni tanlang.' });
      return;
    }
    if (selectedPeriod?.status === 'closed') {
      setError('transactionDate', { message: 'Tanlangan sana yopiq hisob davriga tegishli.' });
      return;
    }
    mutation.mutate({
      ...values,
      branchId,
      comment: values.comment?.trim() || undefined,
      idempotencyKey: idempotencyKey.current,
    });
  });

  const referenceLoading = Object.values(references).some((query) => query.isLoading);
  const referenceError = Object.values(references).find((query) => query.isError)?.error;

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs items={[{ label: 'Xarajatlar' }, { label: 'Yangi xarajat', current: true }]} />
      <PageHeader
        title="Yangi xarajat"
        description="Qo‘lda kiritiladigan qiymatlar tekshiriladi; davr va kategoriya turi server tomonidan hosil qilinadi."
      />
      {referenceLoading ? <LoadingState label="Forma ma’lumotlari yuklanmoqda…" /> : null}
      {referenceError ? <ErrorState message={getApiErrorMessage(referenceError)} /> : null}
      {!referenceLoading && !referenceError ? (
        <form onSubmit={onSubmit} noValidate>
          <Card
            title="Tranzaksiya ma’lumotlari"
            description="* bilan belgilangan maydonlar majburiy."
          >
            {mutation.isError ? (
              <Alert title="Xarajat saqlanmadi" tone="danger" className="mb-5">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            {hasNoWritableBranch ? (
              <Alert title="Xarajat kiritish bloklangan" tone="danger" className="mb-5">
                Sizga yozish mumkin bo‘lgan aktiv filial biriktirilmagan. Administratorga murojaat
                qiling.
              </Alert>
            ) : null}
            {selectedPeriod?.status === 'closed' ? (
              <LockedNotice>
                Bu sana {selectedPeriod.label} yopiq davriga tegishli. Boshqa sana tanlang.
              </LockedNotice>
            ) : null}
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <FormField
                label="Xarajat sanasi"
                htmlFor="transaction-date"
                required
                error={errors.transactionDate?.message}
                hint={
                  selectedPeriod
                    ? `Hisob davri: ${selectedPeriod.label} — ${selectedPeriod.status === 'open' ? 'ochiq' : 'yopiq'}`
                    : 'Hisob davri sanadan serverda aniqlanadi.'
                }
              >
                <Input
                  id="transaction-date"
                  type="date"
                  aria-invalid={Boolean(errors.transactionDate)}
                  aria-describedby={errors.transactionDate ? 'transaction-date-error' : undefined}
                  {...register('transactionDate')}
                />
              </FormField>
              {canChooseBranch ? (
                <FormField
                  label="Filial"
                  htmlFor="expense-form-branch"
                  required
                  error={errors.branchId?.message}
                >
                  <Select
                    id="expense-form-branch"
                    aria-invalid={Boolean(errors.branchId)}
                    aria-describedby={errors.branchId ? 'expense-form-branch-error' : undefined}
                    {...register('branchId')}
                  >
                    <option value="">Filialni tanlang</option>
                    {writableBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <FormField
                  label="Filial"
                  htmlFor="expense-form-branch-readonly"
                  error={errors.branchId?.message}
                  hint="Filial login scope’idan olinadi va qo‘lda almashtirilmaydi."
                >
                  <Input
                    id="expense-form-branch-readonly"
                    readOnly
                    value={
                      fixedWriteBranch?.name ?? 'Yozish mumkin bo‘lgan aktiv filial mavjud emas'
                    }
                  />
                </FormField>
              )}
              <FormField
                label="Kategoriya"
                htmlFor="expense-form-category"
                required
                error={errors.categoryId?.message}
              >
                <Select
                  id="expense-form-category"
                  aria-invalid={Boolean(errors.categoryId)}
                  aria-describedby={errors.categoryId ? 'expense-form-category-error' : undefined}
                  {...register('categoryId')}
                >
                  <option value="">Kategoriyani tanlang</option>
                  {(references.categories.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Xarajat turi (hisoblanadi)"
                htmlFor="expense-form-type"
                hint="Kategoriya turining tarixiy snapshot’i serverda saqlanadi."
              >
                <Input
                  id="expense-form-type"
                  readOnly
                  value={
                    selectedCategory
                      ? selectedCategory.expenseType === 'fixed'
                        ? 'Doimiy'
                        : 'O‘zgaruvchan'
                      : 'Kategoriya tanlang'
                  }
                />
              </FormField>
              <FormField
                label="Summa"
                htmlFor="expense-form-amount"
                required
                error={errors.amountUzs?.message}
                hint="Musbat, butun UZS qiymati."
              >
                <CurrencyInput
                  id="expense-form-amount"
                  aria-invalid={Boolean(errors.amountUzs)}
                  aria-describedby={errors.amountUzs ? 'expense-form-amount-error' : undefined}
                  {...register('amountUzs')}
                />
              </FormField>
              <FormField
                label="To‘lov usuli"
                htmlFor="expense-form-payment"
                required
                error={errors.paymentMethodId?.message}
              >
                <Select
                  id="expense-form-payment"
                  aria-invalid={Boolean(errors.paymentMethodId)}
                  aria-describedby={
                    errors.paymentMethodId ? 'expense-form-payment-error' : undefined
                  }
                  {...register('paymentMethodId')}
                >
                  <option value="">To‘lov usulini tanlang</option>
                  {(references.paymentMethods.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Bo‘lim"
                htmlFor="expense-form-department"
                required
                error={errors.departmentId?.message}
              >
                <Select
                  id="expense-form-department"
                  aria-invalid={Boolean(errors.departmentId)}
                  aria-describedby={
                    errors.departmentId ? 'expense-form-department-error' : undefined
                  }
                  {...register('departmentId')}
                >
                  <option value="">Bo‘limni tanlang</option>
                  {(references.departments.data ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField
                label="Mas’ul xodim"
                htmlFor="expense-form-responsible"
                required
                error={errors.responsibleUserId?.message}
                hint="Erkin matn emas, xavfsiz user katalogidan tanlanadi."
              >
                <Select
                  id="expense-form-responsible"
                  aria-invalid={Boolean(errors.responsibleUserId)}
                  aria-describedby={
                    errors.responsibleUserId ? 'expense-form-responsible-error' : undefined
                  }
                  {...register('responsibleUserId')}
                >
                  <option value="">Mas’ul xodimni tanlang</option>
                  {(references.users.data ?? [])
                    .filter((item) => item.status === 'active')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                </Select>
              </FormField>
              <div className="md:col-span-2">
                <FormField
                  label="Tavsif"
                  htmlFor="expense-form-description"
                  required
                  error={errors.description?.message}
                  hint="Nima uchun xarajat qilinganini aniq yozing."
                >
                  <Textarea
                    id="expense-form-description"
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={
                      errors.description ? 'expense-form-description-error' : undefined
                    }
                    {...register('description')}
                  />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField
                  label="Qo‘shimcha izoh"
                  htmlFor="expense-form-comment"
                  error={errors.comment?.message}
                >
                  <Textarea
                    id="expense-form-comment"
                    aria-invalid={Boolean(errors.comment)}
                    aria-describedby={errors.comment ? 'expense-form-comment-error' : undefined}
                    {...register('comment')}
                  />
                </FormField>
              </div>
            </div>
            <Alert title="Server tekshiruvi majburiy" tone="info" className="mt-5">
              Filial scope’i, ochiq davr, kategoriya turi va audit maydonlari backend tomonidan
              qayta tekshiriladi. Frontenddagi cheklov xavfsizlik chegarasi emas.
            </Alert>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={cancelCreate}>
                Bekor qilish
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={hasNoWritableBranch || selectedPeriod?.status === 'closed'}
              >
                <Save className="h-4 w-4" /> Xarajatni saqlash
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}

function DefinitionItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function ExpenseEditForm({ expense, onDone }: { expense: Expense; onDone: () => void }) {
  const queryClient = useQueryClient();
  const references = useExpenseReferences();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      transactionDate: expense.transactionDate,
      branchId: expense.branchId,
      categoryId: expense.categoryId,
      description: expense.description,
      amountUzs: expense.amountUzs,
      paymentMethodId: expense.paymentMethodId,
      departmentId: expense.departmentId,
      responsibleUserId: expense.responsibleUserId,
      comment: expense.comment ?? '',
    },
  });
  const selectedCategory = references.categories.data?.find(
    (category) => category.id === watch('categoryId'),
  );
  const mutation = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      expenseApi.update(expense.id, {
        transactionDate: values.transactionDate,
        categoryId: values.categoryId,
        description: values.description,
        amountUzs: values.amountUzs,
        paymentMethodId: values.paymentMethodId,
        departmentId: values.departmentId,
        responsibleUserId: values.responsibleUserId,
        comment: values.comment?.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.expense(expense.id) }),
        invalidateExpenseAggregates(queryClient),
      ]);
      onDone();
    },
  });

  if (
    references.categories.isLoading ||
    references.departments.isLoading ||
    references.paymentMethods.isLoading ||
    references.users.isLoading
  )
    return <LoadingState label="Tahrirlash formasi yuklanmoqda…" />;

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="space-y-5"
    >
      {mutation.isError ? (
        <Alert title="O‘zgarishlar saqlanmadi" tone="danger">
          {getApiErrorMessage(mutation.error)}
        </Alert>
      ) : null}
      <Alert title="Immutable maydon" tone="info">
        Filial, kiritgan xodim, hisob davri va audit maydonlari tahrir qilinmaydi.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Sana"
          htmlFor="edit-expense-date"
          required
          error={errors.transactionDate?.message}
        >
          <Input id="edit-expense-date" type="date" {...register('transactionDate')} />
        </FormField>
        <FormField label="Filial" htmlFor="edit-expense-branch">
          <Input id="edit-expense-branch" readOnly value={expense.branchName} />
        </FormField>
        <FormField
          label="Kategoriya"
          htmlFor="edit-expense-category"
          required
          error={errors.categoryId?.message}
        >
          <Select id="edit-expense-category" {...register('categoryId')}>
            {(references.categories.data ?? [])
              .filter((item) => item.isActive || item.id === expense.categoryId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {!item.isActive ? ' (inaktiv)' : ''}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Turi (hisoblanadi)" htmlFor="edit-expense-type">
          <Input
            id="edit-expense-type"
            readOnly
            value={selectedCategory?.expenseType === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
          />
        </FormField>
        <FormField
          label="Summa"
          htmlFor="edit-expense-amount"
          required
          error={errors.amountUzs?.message}
        >
          <CurrencyInput id="edit-expense-amount" {...register('amountUzs')} />
        </FormField>
        <FormField
          label="To‘lov usuli"
          htmlFor="edit-expense-payment"
          required
          error={errors.paymentMethodId?.message}
        >
          <Select id="edit-expense-payment" {...register('paymentMethodId')}>
            {(references.paymentMethods.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Bo‘lim"
          htmlFor="edit-expense-department"
          required
          error={errors.departmentId?.message}
        >
          <Select id="edit-expense-department" {...register('departmentId')}>
            {(references.departments.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Mas’ul"
          htmlFor="edit-expense-responsible"
          required
          error={errors.responsibleUserId?.message}
        >
          <Select id="edit-expense-responsible" {...register('responsibleUserId')}>
            {(references.users.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
                {item.status !== 'active' ? ' (tarixiy)' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="md:col-span-2">
          <FormField
            label="Tavsif"
            htmlFor="edit-expense-description"
            required
            error={errors.description?.message}
          >
            <Textarea id="edit-expense-description" {...register('description')} />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="Izoh" htmlFor="edit-expense-comment" error={errors.comment?.message}>
            <Textarea id="edit-expense-comment" {...register('comment')} />
          </FormField>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onDone}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          <Save className="h-4 w-4" /> Saqlash
        </Button>
      </div>
    </form>
  );
}

export function ExpenseDetailPage() {
  const { expenseId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.expense(expenseId),
    queryFn: ({ signal }) => expenseApi.detail(expenseId, signal),
    enabled: Boolean(expenseId),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });

  if (query.isLoading) return <LoadingState label="Xarajat tafsilotlari yuklanmoqda…" />;
  if (query.isError)
    return (
      <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (!query.data)
    return (
      <EmptyState
        title="Xarajat topilmadi"
        description="Yozuv o‘chirilgan yoki bu filialni ko‘rishga ruxsatingiz yo‘q."
      />
    );

  const expense = query.data;
  const period = periodsQuery.data?.find((item) => item.id === expense.periodId);
  const canWriteBranch = Boolean(meQuery.data?.writeBranchScopes.includes(expense.branchId));
  const canEdit =
    Boolean(meQuery.data?.permissions.includes('expense.edit')) &&
    canWriteBranch &&
    period?.status !== 'closed';

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Xarajatlar' }, { label: expense.id, current: true }]} />
      <PageHeader
        title={expense.description}
        description={`Xarajat ID: ${expense.id}`}
        actions={
          <>
            <Link
              to={routes.expenses}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Jurnalga qaytish
            </Link>
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
                <Pencil className="h-4 w-4" /> {editing ? 'Ko‘rish rejimi' : 'Tahrirlash'}
              </Button>
            ) : null}
          </>
        }
      />

      {period?.status === 'closed' ? (
        <LockedNotice>{period.label} yopilgan. Original xarajat tahrirlanmaydi.</LockedNotice>
      ) : null}

      {editing ? (
        <Card title="Xarajatni tahrirlash">
          <ExpenseEditForm expense={expense} onDone={() => setEditing(false)} />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-5">
            <Card title="Asosiy ma’lumotlar">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <DefinitionItem label="Summa">
                  <MoneyText value={expense.amountUzs} className="text-xl font-bold" />
                </DefinitionItem>
                <DefinitionItem label="Sana">{formatDate(expense.transactionDate)}</DefinitionItem>
                <DefinitionItem label="Hisob davri">
                  {period?.label ?? expense.periodId}{' '}
                  {period ? (
                    <span className="text-xs text-muted">
                      ({period.status === 'open' ? 'ochiq' : 'yopiq'})
                    </span>
                  ) : null}
                </DefinitionItem>
                <DefinitionItem label="Filial">{expense.branchName}</DefinitionItem>
                <DefinitionItem label="Kategoriya">{expense.categoryNameSnapshot}</DefinitionItem>
                <DefinitionItem label="Tarixiy turi">
                  {expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </DefinitionItem>
                <DefinitionItem label="To‘lov usuli">{expense.paymentMethodName}</DefinitionItem>
                <DefinitionItem label="Bo‘lim">{expense.departmentName}</DefinitionItem>
                <DefinitionItem label="Mas’ul">{expense.responsibleUserName}</DefinitionItem>
                <DefinitionItem label="Kiritgan xodim">{expense.enteredByName}</DefinitionItem>
                <DefinitionItem label="Yaratilgan">
                  {formatDateTime(expense.createdAt)}
                </DefinitionItem>
                <DefinitionItem label="Yangilangan">
                  {formatDateTime(expense.updatedAt)}
                </DefinitionItem>
              </dl>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tavsif</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{expense.description}</p>
              </div>
              {expense.comment ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Izoh</p>
                  <p className="mt-2 text-sm text-slate-700">{expense.comment}</p>
                </div>
              ) : null}
            </Card>
          </div>
          <div className="space-y-5">
            <Card title="Manba va izchillik">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold text-ink">Server hosil qilgan ID</p>
                  <p className="mt-1 break-all text-xs text-muted">{expense.id}</p>
                </div>
              </div>
            </Card>
            <Card
              title="Biriktirmalar"
              description="Receipt, invoice va foto oqimi V1.1 doirasida."
            >
              <EmptyState
                title="Biriktirma mavjud emas"
                description="V1 ekranida holat ko‘rinadi; yuklash funksiyasi V1.1’da yoqiladi."
              />
            </Card>
            <Card title="Hisob semantikasi">
              <p className="text-sm leading-6 text-slate-600">
                Kategoriya nomi yoki turi keyinchalik o‘zgarsa ham bu tranzaksiyada{' '}
                <strong className="text-ink">{expense.categoryNameSnapshot}</strong> va{' '}
                <strong className="text-ink">
                  {expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                </strong>{' '}
                snapshot’i saqlanadi.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ExpenseFormValues, ExpenseType };
