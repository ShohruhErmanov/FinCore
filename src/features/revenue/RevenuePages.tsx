import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Download, FilterX, Pencil, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getApiErrorMessage } from '@/shared/api/client';
import { authApi, referenceApi, revenueApi } from '@/shared/api/contracts';
import { invalidateRevenueAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { downloadCsv } from '@/shared/lib/csv';
import { getActiveWritableBranches } from '@/shared/lib/branch-scopes';
import { formatDate, formatDateLong, formatDateTime, formatMoney } from '@/shared/lib/format';
import type { DailyRevenue, RevenuePlanBoard } from '@/shared/types/domain';
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
  PercentText,
  Select,
  Textarea,
  VarianceText,
  type Column,
} from '@/shared/ui';

const money = z.string().regex(/^\d+$/, 'Faqat butun so‘m kiriting.');

const revenueFormSchema = z
  .object({
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani YYYY-MM-DD formatida kiriting.'),
    branchId: z.string().optional(),
    cashUzs: money,
    cardUzs: money,
    transferUzs: money,
    comment: z.string().max(500, '500 belgidan oshmasin.').optional(),
  })
  .refine(
    (values) =>
      BigInt(values.cashUzs || '0') + BigInt(values.cardUzs || '0') + BigInt(values.transferUzs || '0') >
      0n,
    { message: 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.', path: ['cashUzs'] },
  );

type RevenueFormValues = z.infer<typeof revenueFormSchema>;

function totalOf(values: Pick<RevenueFormValues, 'cashUzs' | 'cardUzs' | 'transferUzs'>): string {
  return (
    BigInt(values.cashUzs || '0') +
    BigInt(values.cardUzs || '0') +
    BigInt(values.transferUzs || '0')
  ).toString();
}

function useRevenueReferences() {
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
  return { me, branches, periods };
}

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
  const queryString = searchParams.toString();
  const query = useQuery({
    queryKey: queryKeys.revenues(queryString),
    queryFn: ({ signal }) =>
      revenueApi.list(
        {
          branch,
          periodId: searchParams.get('period') ?? undefined,
          dateFrom: searchParams.get('dateFrom') ?? undefined,
          dateTo: searchParams.get('dateTo') ?? undefined,
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

  const hasFilters = [...searchParams.keys()].some((key) => !['page', 'sort'].includes(key));
  const pageTotal = (query.data?.items ?? []).reduce(
    (total, row) => total + BigInt(row.totalUzs),
    0n,
  );

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Operatsiyalar' }, { label: 'Kunlik tushum', current: true }]} />
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
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <CalendarPlus className="h-4 w-4" /> Tushum kiritish
              </Link>
            ) : null}
          </>
        }
      />

      <Card title="Filtrlar" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Davr" htmlFor="revenue-period">
            <Select
              id="revenue-period"
              value={searchParams.get('period') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'period', event.target.value)
              }
            >
              <option value="">Barcha davrlar</option>
              {(references.periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Filial" htmlFor="revenue-branch-filter">
            <Select
              id="revenue-branch-filter"
              value={branch}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'branch', event.target.value)
              }
            >
              <option value="all">Barchasi</option>
              {(references.branches.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Boshlanish sanasi" htmlFor="revenue-date-from">
            <Input
              id="revenue-date-from"
              type="date"
              value={searchParams.get('dateFrom') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'dateFrom', event.target.value)
              }
            />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="revenue-date-to">
            <Input
              id="revenue-date-to"
              type="date"
              value={searchParams.get('dateTo') ?? ''}
              onChange={(event) =>
                updateQueryParam(searchParams, setSearchParams, 'dateTo', event.target.value)
              }
            />
          </FormField>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              disabled={!hasFilters}
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
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
        <Card
          className="overflow-hidden"
          title={`${query.data.total} ta kunlik yozuv`}
          description={`Ushbu sahifadagi jami: ${formatMoney(pageTotal.toString())}`}
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
                updateQueryParam(searchParams, setSearchParams, 'page', String(nextPage))
              }
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RevenueAmountFields({
  register,
  errors,
  total,
  prefix,
}: {
  register: ReturnType<typeof useForm<RevenueFormValues>>['register'];
  errors: ReturnType<typeof useForm<RevenueFormValues>>['formState']['errors'];
  total: string;
  prefix: string;
}) {
  return (
    <>
      <FormField
        label="Naqd pul"
        htmlFor={`${prefix}-cash`}
        required
        error={errors.cashUzs?.message}
      >
        <CurrencyInput id={`${prefix}-cash`} {...register('cashUzs')} />
      </FormField>
      <FormField
        label="Plastik karta"
        htmlFor={`${prefix}-card`}
        required
        error={errors.cardUzs?.message}
      >
        <CurrencyInput id={`${prefix}-card`} {...register('cardUzs')} />
      </FormField>
      <FormField
        label="Bank o‘tkazmasi"
        htmlFor={`${prefix}-transfer`}
        required
        error={errors.transferUzs?.message}
      >
        <CurrencyInput id={`${prefix}-transfer`} {...register('transferUzs')} />
      </FormField>
      <FormField
        label="Kunlik jami (hisoblanadi)"
        htmlFor={`${prefix}-total`}
        hint="Uch kanal yig‘indisi; serverda qayta hisoblanadi."
      >
        <Input id={`${prefix}-total`} readOnly value={`${total} so‘m`} />
      </FormField>
    </>
  );
}

export function RevenueCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const references = useRevenueReferences();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueFormSchema),
    defaultValues: {
      businessDate: '',
      branchId: '',
      cashUzs: '0',
      cardUzs: '0',
      transferUzs: '0',
      comment: '',
    },
  });

  const currentUser = references.me.data;
  const writableBranches = getActiveWritableBranches(
    references.branches.data ?? [],
    currentUser?.writeBranchScopes,
  );
  const fixedWriteBranch =
    writableBranches.length === 1 ? (writableBranches[0] ?? null) : null;
  const canChooseBranch = writableBranches.length > 1;
  const hasNoWritableBranch = Boolean(currentUser) && writableBranches.length === 0;
  const watchedDate = watch('businessDate');
  const selectedPeriod = references.periods.data?.find(
    (period) =>
      `${period.year}-${String(period.month).padStart(2, '0')}` === watchedDate.slice(0, 7),
  );
  const total = totalOf({
    cashUzs: watch('cashUzs'),
    cardUzs: watch('cardUzs'),
    transferUzs: watch('transferUzs'),
  });

  useEffect(() => {
    if (!canChooseBranch && fixedWriteBranch) setValue('branchId', fixedWriteBranch.id);
  }, [canChooseBranch, fixedWriteBranch, setValue]);

  const mutation = useMutation({
    mutationFn: revenueApi.create,
    onSuccess: async (created) => {
      await invalidateRevenueAggregates(queryClient);
      navigate(routes.revenueDetail(created.id), { replace: true });
    },
  });

  const onSubmit = handleSubmit((values) => {
    const branchId = canChooseBranch ? values.branchId : (fixedWriteBranch?.id ?? values.branchId);
    if (!branchId || !writableBranches.some((branch) => branch.id === branchId)) {
      setError('branchId', { message: 'Yozish ruxsati bor filialni tanlang.' });
      return;
    }
    if (selectedPeriod?.status === 'closed') {
      setError('businessDate', { message: 'Tanlangan sana yopiq hisob davriga tegishli.' });
      return;
    }
    mutation.mutate({
      businessDate: values.businessDate,
      branchId,
      cashUzs: values.cashUzs || '0',
      cardUzs: values.cardUzs || '0',
      transferUzs: values.transferUzs || '0',
      comment: values.comment?.trim() || undefined,
      idempotencyKey: idempotencyKey.current,
    });
  });

  const referenceLoading = Object.values(references).some((query) => query.isLoading);

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[{ label: 'Kunlik tushum' }, { label: 'Yangi yozuv', current: true }]}
      />
      <PageHeader
        title="Kunlik tushum kiritish"
        description="Bir kun va bir filial uchun bitta yozuv. Hisob davri sanadan serverda aniqlanadi."
      />
      {referenceLoading ? <LoadingState label="Forma ma’lumotlari yuklanmoqda…" /> : null}
      {!referenceLoading ? (
        <form onSubmit={onSubmit} noValidate>
          <Card title="Kun ma’lumotlari" description="* bilan belgilangan maydonlar majburiy.">
            {mutation.isError ? (
              <Alert title="Tushum saqlanmadi" tone="danger" className="mb-5">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            ) : null}
            {hasNoWritableBranch ? (
              <Alert title="Tushum kiritish bloklangan" tone="danger" className="mb-5">
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
                label="Sana"
                htmlFor="revenue-date"
                required
                error={errors.businessDate?.message}
                hint={
                  selectedPeriod
                    ? `Hisob davri: ${selectedPeriod.label} — ${selectedPeriod.status === 'open' ? 'ochiq' : 'yopiq'}`
                    : 'Hisob davri sanadan serverda aniqlanadi.'
                }
              >
                <Input id="revenue-date" type="date" {...register('businessDate')} />
              </FormField>
              {canChooseBranch ? (
                <FormField
                  label="Filial"
                  htmlFor="revenue-branch"
                  required
                  error={errors.branchId?.message}
                >
                  <Select id="revenue-branch" {...register('branchId')}>
                    <option value="">Filialni tanlang</option>
                    {writableBranches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <FormField
                  label="Filial"
                  htmlFor="revenue-branch-readonly"
                  error={errors.branchId?.message}
                  hint="Filial login scope’idan olinadi."
                >
                  <Input
                    id="revenue-branch-readonly"
                    readOnly
                    value={
                      fixedWriteBranch?.name ?? 'Yozish mumkin bo‘lgan aktiv filial mavjud emas'
                    }
                  />
                </FormField>
              )}
              <RevenueAmountFields
                register={register}
                errors={errors}
                total={total}
                prefix="revenue"
              />
              <div className="md:col-span-2">
                <FormField label="Izoh" htmlFor="revenue-comment" error={errors.comment?.message}>
                  <Textarea id="revenue-comment" {...register('comment')} />
                </FormField>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (
                    !isDirty ||
                    window.confirm('Saqlanmagan o‘zgarishlar bor. Chiqishni tasdiqlaysizmi?')
                  )
                    navigate(routes.revenues);
                }}
              >
                Bekor qilish
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={hasNoWritableBranch || selectedPeriod?.status === 'closed'}
              >
                <Save className="h-4 w-4" /> Tushumni saqlash
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}

function RevenueEditForm({ revenue, onDone }: { revenue: DailyRevenue; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueFormSchema),
    defaultValues: {
      businessDate: revenue.businessDate,
      branchId: revenue.branchId,
      cashUzs: revenue.cashUzs,
      cardUzs: revenue.cardUzs,
      transferUzs: revenue.transferUzs,
      comment: revenue.comment ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: RevenueFormValues) =>
      revenueApi.update(revenue.id, {
        cashUzs: values.cashUzs,
        cardUzs: values.cardUzs,
        transferUzs: values.transferUzs,
        comment: values.comment?.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.revenue(revenue.id) }),
        invalidateRevenueAggregates(queryClient),
      ]);
      onDone();
    },
  });
  const total = totalOf({
    cashUzs: watch('cashUzs'),
    cardUzs: watch('cardUzs'),
    transferUzs: watch('transferUzs'),
  });

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
        Sana, filial va hisob davri tahrir qilinmaydi — faqat summalar va izoh yangilanadi.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Sana" htmlFor="edit-revenue-date">
          <Input id="edit-revenue-date" readOnly value={formatDate(revenue.businessDate)} />
        </FormField>
        <FormField label="Filial" htmlFor="edit-revenue-branch">
          <Input id="edit-revenue-branch" readOnly value={revenue.branchName} />
        </FormField>
        <RevenueAmountFields
          register={register}
          errors={errors}
          total={total}
          prefix="edit-revenue"
        />
        <div className="md:col-span-2">
          <FormField label="Izoh" htmlFor="edit-revenue-comment" error={errors.comment?.message}>
            <Textarea id="edit-revenue-comment" {...register('comment')} />
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

function DefinitionItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export function RevenueDetailPage() {
  const { revenueId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.revenue(revenueId),
    queryFn: ({ signal }) => revenueApi.detail(revenueId, signal),
    enabled: Boolean(revenueId),
  });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });

  if (query.isLoading) return <LoadingState label="Tushum tafsilotlari yuklanmoqda…" />;
  if (query.isError)
    return (
      <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  if (!query.data)
    return (
      <EmptyState
        title="Tushum topilmadi"
        description="Yozuv o‘chirilgan yoki bu filialni ko‘rishga ruxsatingiz yo‘q."
      />
    );

  const revenue = query.data;
  const period = periodsQuery.data?.find((item) => item.id === revenue.periodId);
  const canEdit =
    Boolean(
      meQuery.data?.permissions.includes('revenue.edit') ||
        meQuery.data?.permissions.includes('revenue.create'),
    ) &&
    Boolean(meQuery.data?.writeBranchScopes.includes(revenue.branchId)) &&
    period?.status !== 'closed';

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Kunlik tushum' }, { label: formatDate(revenue.businessDate), current: true }]}
      />
      <PageHeader
        title={`${formatDateLong(revenue.businessDate)} · ${revenue.branchName}`}
        description={`Kunlik tushum yozuvi · ${revenue.id}`}
        actions={
          <>
            <Link
              to={routes.revenues}
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
        <LockedNotice>{period.label} yopilgan. Yozuv tahrirlanmaydi.</LockedNotice>
      ) : null}

      {editing ? (
        <Card title="Kunlik tushumni tahrirlash">
          <RevenueEditForm revenue={revenue} onDone={() => setEditing(false)} />
        </Card>
      ) : (
        <Card title="Kun kesimi">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <DefinitionItem label="Jami tushum">
              <MoneyText value={revenue.totalUzs} className="text-xl font-bold" />
            </DefinitionItem>
            <DefinitionItem label="Naqd pul">
              <MoneyText value={revenue.cashUzs} />
            </DefinitionItem>
            <DefinitionItem label="Plastik karta">
              <MoneyText value={revenue.cardUzs} />
            </DefinitionItem>
            <DefinitionItem label="Bank o‘tkazmasi">
              <MoneyText value={revenue.transferUzs} />
            </DefinitionItem>
            <DefinitionItem label="Hisob davri">
              {period?.label ?? revenue.periodId}{' '}
              <span className="text-xs text-muted">
                ({period?.status === 'open' ? 'ochiq' : 'yopiq'})
              </span>
            </DefinitionItem>
            <DefinitionItem label="Kiritgan xodim">{revenue.enteredByName}</DefinitionItem>
            <DefinitionItem label="Yaratilgan">{formatDateTime(revenue.createdAt)}</DefinitionItem>
            <DefinitionItem label="Yangilangan">{formatDateTime(revenue.updatedAt)}</DefinitionItem>
          </dl>
          {revenue.comment ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Izoh</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{revenue.comment}</p>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

export function RevenuePlanPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Top-bar branch narrows the board; saving still sends every branch.
  const planBranch = searchParams.get('branch') ?? 'all';
  const [drafts, setDrafts] = useState<Record<string, string | null>>({});
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const selectedPeriodId =
    searchParams.get('period') ??
    periodsQuery.data?.find((period) => period.status === 'open')?.id ??
    periodsQuery.data?.[0]?.id ??
    '';
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === selectedPeriodId);
  const planQuery = useQuery({
    queryKey: queryKeys.revenuePlan(selectedPeriodId),
    queryFn: ({ signal }) => revenueApi.plan(selectedPeriodId, signal),
    enabled: Boolean(selectedPeriodId),
  });

  useEffect(() => {
    if (!searchParams.get('period') && selectedPeriodId) {
      const next = new URLSearchParams(searchParams);
      next.set('period', selectedPeriodId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedPeriodId, setSearchParams]);

  useEffect(() => {
    if (planQuery.data)
      setDrafts(
        Object.fromEntries(
          planQuery.data.lines.map((line) => [line.branchId, line.plannedAmountUzs]),
        ),
      );
  }, [planQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      revenueApi.savePlan(
        selectedPeriodId,
        Object.entries(drafts).map(([branchId, plannedAmountUzs]) => ({
          branchId,
          plannedAmountUzs,
        })),
      ),
    onSuccess: async (updated: RevenuePlanBoard) => {
      queryClient.setQueryData(queryKeys.revenuePlan(updated.periodId), updated);
      await invalidateRevenueAggregates(queryClient);
    },
  });

  const canEdit =
    Boolean(meQuery.data?.permissions.includes('revenue_plan.manage')) &&
    selectedPeriod?.status === 'open';

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Rejalashtirish' }, { label: 'Tushum rejasi', current: true }]}
      />
      <PageHeader
        title="Tushum rejasi"
        description="Filial bo‘yicha oylik tushum rejasi. Kunlik va haftalik reja shu summadan avtomatik bo‘linadi."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!planQuery.data?.lines.length}
              onClick={() =>
                planQuery.data &&
                downloadCsv(
                  `tushum-rejasi-${planQuery.data.periodLabel.replace(/\s+/g, '-').toLowerCase()}`,
                  [
                    ['Davr', 'Filial', 'Oylik reja', 'Kunlik reja', 'Amalda', 'Farq', 'Bajarilish %'],
                    ...planQuery.data.lines.map((line) => [
                      planQuery.data.periodLabel,
                      line.branchName,
                      line.plannedAmountUzs,
                      line.dailyPlanUzs,
                      line.actualAmountUzs,
                      line.varianceUzs,
                      line.completionPercent,
                    ]),
                  ],
                )
              }
            >
              <Download className="h-4 w-4" /> CSV yuklab olish
            </Button>
            {canEdit ? (
              <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="h-4 w-4" /> Saqlash
              </Button>
            ) : null}
          </>
        }
      />

      <Card title="Hisob davri" className="mb-5">
        {periodsQuery.isLoading ? <LoadingState label="Davrlar yuklanmoqda…" /> : null}
        {periodsQuery.data ? (
          <div className="max-w-md">
            <FormField label="Davr" htmlFor="revenue-plan-period">
              <Select
                id="revenue-plan-period"
                value={selectedPeriodId}
                onChange={(event) =>
                  setSearchParams({ period: event.target.value }, { replace: true })
                }
              >
                {periodsQuery.data.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label} — {period.status === 'open' ? 'Ochiq' : 'Yopiq'}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        ) : null}
      </Card>

      {selectedPeriod?.status === 'closed' ? (
        <LockedNotice>Yopilgan davr rejasi tahrirlanmaydi, faqat ko‘rish mumkin.</LockedNotice>
      ) : null}
      {saveMutation.error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(saveMutation.error)}
        </Alert>
      ) : null}

      {planQuery.isLoading ? <LoadingState label="Tushum rejasi yuklanmoqda…" /> : null}
      {planQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(planQuery.error)}
          onRetry={() => void planQuery.refetch()}
        />
      ) : null}
      {planQuery.data ? (
        <>
          <Card
            title={`${planQuery.data.periodLabel} · filiallar rejasi`}
            description={`Oyda ${planQuery.data.daysInMonth} kun. Kunlik reja = oylik reja ÷ ${planQuery.data.daysInMonth}.`}
            className="overflow-hidden"
          >
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <caption className="sr-only">{planQuery.data.periodLabel} tushum rejasi</caption>
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Filial</th>
                    <th className="px-4 py-3 text-right">Oylik reja</th>
                    <th className="px-4 py-3 text-right">Kunlik reja</th>
                    <th className="px-4 py-3 text-right">Amalda</th>
                    <th className="px-4 py-3 text-right">Farq</th>
                    <th className="px-4 py-3 text-right">Bajarilish</th>
                  </tr>
                </thead>
                <tbody>
                  {planQuery.data.lines
                    .filter(
                      (line) => planBranch === 'all' || line.branchId === planBranch,
                    )
                    .map((line) => {
                    const draft = drafts[line.branchId] ?? null;
                    const dailyPlan =
                      draft === null
                        ? null
                        : (BigInt(draft || '0') / BigInt(planQuery.data.daysInMonth)).toString();
                    const variance =
                      draft === null
                        ? null
                        : (BigInt(draft || '0') - BigInt(line.actualAmountUzs)).toString();
                    return (
                      <tr key={line.id} className="border-b border-border last:border-0">
                        <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                          {line.branchName}
                        </th>
                        <td className="min-w-52 px-4 py-3 text-right">
                          {canEdit ? (
                            <CurrencyInput
                              aria-label={`${line.branchName} oylik tushum rejasi`}
                              value={draft ?? '0'}
                              onChange={(event) => {
                                if (/^\d*$/.test(event.target.value))
                                  setDrafts((current) => ({
                                    ...current,
                                    [line.branchId]: event.target.value || '0',
                                  }));
                              }}
                            />
                          ) : (
                            <MoneyText value={draft} className="font-semibold text-ink" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                          <MoneyText value={dailyPlan} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <MoneyText value={line.actualAmountUzs} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {variance === null ? (
                            <span className="text-sm text-muted">—</span>
                          ) : (
                            <VarianceText value={variance} />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                          <PercentText value={line.completionPercent} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Alert title="Kunlik va haftalik reja avtomatik" tone="info" className="mt-5">
            Oylik reja kiritilgach, kunlik reja teng bo‘linadi (qoldiqsiz), haftalik reja esa shu
            kunlik rejalar yig‘indisi bo‘ladi. Dashboard diagrammasida uchala kesim ham ko‘rinadi.
            Oxirgi saqlash: {planQuery.data.updatedByName} ·{' '}
            {formatDateTime(planQuery.data.updatedAt)}.
          </Alert>
        </>
      ) : null}
    </div>
  );
}
