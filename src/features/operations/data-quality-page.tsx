import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, DatabaseZap, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { operationsApi, referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime } from '@/shared/lib/format';
import type {
  DataQualityException,
  DataQualityResolutionInput,
  ReconciliationResult,
} from '@/shared/types/domain';
import {
  Alert,
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
  StatusBadge,
  Textarea,
  type Column,
} from '@/shared/ui';
import {
  FilterCard,
  NativeFilter,
  numericPage,
  querySignature,
  useRevenueReferences,
} from '@/features/revenue/revenue-shared';

export function DataQualityPage() {
  const { hasPermission } = useAuth();
  const references = useRevenueReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<DataQualityException | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');
  const [correctedDate, setCorrectedDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const queryClient = useQueryClient();
  const page = numericPage(searchParams.get('page'));
  const pageSize = 20;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next);
  };
  const filters = {
    status: searchParams.get('status') ?? 'open',
    severity: searchParams.get('severity') ?? undefined,
    issueType: searchParams.get('issueType') ?? undefined,
    branch: searchParams.get('branch') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    page,
    pageSize,
  };
  const exceptions = useQuery({
    queryKey: queryKeys.dataQuality(querySignature(searchParams)),
    queryFn: ({ signal }) => operationsApi.exceptions(filters, signal),
  });
  const reconciliation = useQuery({
    queryKey: ['reconciliations'],
    queryFn: ({ signal }) => operationsApi.reconciliations(signal),
  });
  const categories = useQuery({
    queryKey: queryKeys.master('categories'),
    queryFn: ({ signal }) => referenceApi.categories(signal),
    staleTime: 300_000,
  });
  const resolve = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DataQualityResolutionInput }) =>
      operationsApi.resolveException(id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-quality'] }),
        queryClient.invalidateQueries({ queryKey: ['reconciliations'] }),
        queryClient.invalidateQueries({ queryKey: ['period-readiness'] }),
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
      ]);
      setResolving(null);
      setResolutionReason('');
      setCorrectedDate('');
      setCategoryId('');
    },
  });
  const mismatch = reconciliation.data?.find((item) => item.status === 'mismatch');
  const excluded = exceptions.data?.summary.openAmountUzs ?? '0';
  const exceptionColumns: Column<DataQualityException>[] = [
    { key: 'severity', header: 'Daraja', cell: (row) => <SeverityBadge value={row.severity} /> },
    {
      key: 'issue',
      header: 'Muammo',
      cell: (row) => (
        <div>
          <button
            type="button"
            className="text-left font-semibold text-primary hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(expanded === row.id ? null : row.id);
            }}
          >
            {row.title}
          </button>
          <p className="mt-1 text-xs text-muted">{row.issueType}</p>
          {expanded === row.id ? (
            <div className="mt-2 max-w-xl rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              <p>{row.detail}</p>
              {row.transactionDate ? (
                <p className="mt-1 font-semibold">Manbadagi sana: {row.transactionDate}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Manba',
      cell: (row) => (
        <div>
          <p>{row.sourceSheet}</p>
          <p className="text-xs text-muted">{row.sourceRow}-satr</p>
          {row.transactionDate ? (
            <p className="mt-1 text-xs font-medium text-slate-700">{row.transactionDate}</p>
          ) : null}
        </div>
      ),
    },
    { key: 'branch', header: 'Filial', cell: (row) => row.branchName ?? 'Umumiy' },
    {
      key: 'amount',
      header: 'Chiqarilgan summa',
      className: 'text-right',
      cell: (row) => <MoneyText value={row.amountUzs} className="font-semibold text-danger" />,
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) =>
        row.status === 'ignored' ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            E’tiborsiz qoldirilgan
          </span>
        ) : (
          <StatusBadge status={row.status} />
        ),
    },
    {
      key: 'action',
      header: '',
      cell: (row) =>
        row.status === 'open' && hasPermission('import.resolve_exception') ? (
          <Button
            size="sm"
            variant="secondary"
            loading={resolve.isPending && resolve.variables?.id === row.id}
            onClick={(event) => {
              event.stopPropagation();
              setResolving(row);
              setResolutionReason('');
              setCategoryId('');
              const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(row.transactionDate ?? '');
              setCorrectedDate(match ? `${match[3]}-${match[2]}-${match[1]}` : '');
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Tuzatish
          </Button>
        ) : null,
    },
  ];
  const recRows = reconciliation.data ?? [];
  const recColumns: Column<ReconciliationResult>[] = [
    {
      key: 'scope',
      header: 'Tekshiruv',
      cell: (row) => <span className="font-semibold text-ink">{row.scope}</span>,
    },
    {
      key: 'source',
      header: 'Manba',
      className: 'text-right',
      cell: (row) => (
        <div>
          <MoneyText value={row.sourceSumUzs} />
          <p className="text-xs text-muted">{row.sourceCount} satr</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Ledger',
      className: 'text-right',
      cell: (row) => (
        <div>
          <MoneyText value={row.targetSumUzs} />
          <p className="text-xs text-muted">{row.targetCount} satr</p>
        </div>
      ),
    },
    {
      key: 'diff',
      header: 'Tafovut',
      className: 'text-right',
      cell: (row) => (
        <div className={row.status === 'match' ? 'text-success' : 'text-danger'}>
          <MoneyText value={row.diffSumUzs} className="font-bold" />
          <p className="text-xs">{row.diffCount} satr</p>
        </div>
      ),
    },
    { key: 'status', header: 'Natija', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'checked',
      header: 'Tekshirildi',
      cell: (row) => (
        <time className="whitespace-nowrap text-xs">{formatDateTime(row.checkedAt)}</time>
      ),
    },
  ];
  const isLoading = exceptions.isLoading || reconciliation.isLoading;
  const error = exceptions.error ?? reconciliation.error;
  return (
    <>
      <PageHeader
        title="Data quality va reconciliation"
        description="Import qilingan manba satrlari, canonical ledger va close-readiness orasidagi tafovutlarni boshqarish."
        actions={
          <Link
            to={routes.periods}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Davrni yopish
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      {mismatch ? (
        <Alert title="Davrni yopishga to‘sqinlik qiluvchi tafovut" tone="danger" className="mb-5">
          Manba <MoneyText value={mismatch.sourceSumUzs} />, ledger{' '}
          <MoneyText value={mismatch.targetSumUzs} />. Farq:{' '}
          <strong>
            <MoneyText value={mismatch.diffSumUzs} />
          </strong>{' '}
          va {mismatch.diffCount} ta satr.
        </Alert>
      ) : null}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Manba summasi"
          value={<MoneyText value={mismatch?.sourceSumUzs ?? '0'} />}
          helper="Filial kassalari / legacy manba."
        />
        <KpiCard
          label="Unified ledger"
          value={<MoneyText value={mismatch?.targetSumUzs ?? '0'} />}
          helper="Canonical jurnalga qabul qilingan fakt."
        />
        <KpiCard
          label="Tafovut"
          value={<MoneyText value={mismatch?.diffSumUzs ?? '0'} />}
          helper="Reconciliation yopilmaguncha close bloklanadi."
          tone={mismatch ? 'danger' : 'success'}
        />
        <KpiCard
          label="Ochiq exception summasi"
          value={<MoneyText value={excluded} />}
          helper="Joriy filtr sahifasidagi tuzatish navbati."
          tone="warning"
        />
      </div>
      <FilterCard title="Exception filtrlari">
        <NativeFilter
          label="Holat"
          value={searchParams.get('status') || 'open'}
          allLabel="Barcha holatlar"
          onChange={(value) => setFilter('status', value)}
        >
          <option value="open">Ochiq</option>
          <option value="resolved">Hal qilingan</option>
          <option value="ignored">E’tiborsiz</option>
        </NativeFilter>
        <NativeFilter
          label="Daraja"
          value={searchParams.get('severity') || 'all'}
          allLabel="Barcha darajalar"
          onChange={(value) => setFilter('severity', value)}
        >
          <option value="error">Kritik</option>
          <option value="warning">Ogohlantirish</option>
          <option value="info">Ma’lumot</option>
        </NativeFilter>
        <NativeFilter
          label="Filial"
          value={searchParams.get('branch') || 'all'}
          allLabel="Barcha filiallar"
          onChange={(value) => setFilter('branch', value)}
        >
          {references.branches.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeFilter>
        <FormField label="Qidiruv" htmlFor="dq-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <Input
              id="dq-search"
              className="pl-9"
              value={searchParams.get('search') || ''}
              onChange={(event) => setFilter('search', event.target.value)}
              placeholder="Manba, satr, muammo"
            />
          </div>
        </FormField>
      </FilterCard>
      {resolving ? (
        <Card
          title={`Exceptionni tuzatish · ${resolving.title}`}
          description={`${resolving.sourceSheet}, ${resolving.sourceRow}-satr. Tanlangan tuzatish va sabab auditda saqlanadi.`}
          className="mb-5 border-amber-200"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {resolving.issueType === 'unknown_category' ? (
              <FormField label="Canonical kategoriya" htmlFor="dq-resolution-category" required>
                <Select
                  id="dq-resolution-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Tanlang</option>
                  {(categories.data ?? [])
                    .filter((category) => category.isActive)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} · {category.code}
                      </option>
                    ))}
                </Select>
              </FormField>
            ) : null}
            {resolving.issueType === 'invalid_date' ? (
              <FormField label="Tuzatilgan biznes sanasi" htmlFor="dq-corrected-date" required>
                <Input
                  id="dq-corrected-date"
                  type="date"
                  value={correctedDate}
                  onChange={(event) => setCorrectedDate(event.target.value)}
                />
              </FormField>
            ) : null}
            <div className="md:col-span-2">
              <FormField
                label="Tuzatish sababi"
                htmlFor="dq-resolution-reason"
                required
                hint="Kamida 5 ta belgi; generic 'hal qilindi' yetarli emas."
              >
                <Textarea
                  id="dq-resolution-reason"
                  value={resolutionReason}
                  onChange={(event) => setResolutionReason(event.target.value)}
                />
              </FormField>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolving(null)}>
              Bekor qilish
            </Button>
            <Button
              loading={resolve.isPending}
              disabled={
                resolutionReason.trim().length < 5 ||
                (resolving.issueType === 'unknown_category' && !categoryId) ||
                (resolving.issueType === 'invalid_date' && !correctedDate)
              }
              onClick={() =>
                resolve.mutate({
                  id: resolving.id,
                  input: {
                    reason: resolutionReason.trim(),
                    ...(resolving.issueType === 'unknown_category' ? { categoryId } : {}),
                    ...(resolving.issueType === 'invalid_date' ? { correctedDate } : {}),
                  },
                })
              }
            >
              Tuzatishni saqlash
            </Button>
          </div>
        </Card>
      ) : null}
      {resolve.isError ? (
        <Alert title="Exception holatini o‘zgartirib bo‘lmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(resolve.error)}
        </Alert>
      ) : null}
      {isLoading ? (
        <LoadingState label="Tekshiruv natijalari yuklanmoqda…" />
      ) : error ? (
        <ErrorState
          message={getApiErrorMessage(error)}
          onRetry={() => {
            void exceptions.refetch();
            void reconciliation.refetch();
          }}
        />
      ) : (
        <div className="space-y-5">
          <Card
            title="Tuzatish navbati"
            description="Rang bilan birga matnli daraja va holat ham ko‘rsatiladi."
          >
            <DataTable
              columns={exceptionColumns}
              rows={exceptions.data?.items ?? []}
              caption="Data quality exceptionlari"
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={exceptions.data?.total ?? 0}
              onPageChange={(nextPage) => {
                const next = new URLSearchParams(searchParams);
                next.set('page', String(nextPage));
                setSearchParams(next);
              }}
            />
          </Card>
          <Card title="Reconciliation tekshiruvlari">
            <DataTable
              columns={recColumns}
              rows={recRows}
              caption="Manba va platforma summalarini solishtirish"
            />
          </Card>
        </div>
      )}
    </>
  );
}

export function ImportsPage() {
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: ['imports', 'latest'],
    queryFn: ({ signal }) => operationsApi.latestImport(signal),
  });
  const run = useMutation({
    mutationFn: operationsApi.runLegacyImport,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['data-quality'] }),
        queryClient.invalidateQueries({ queryKey: ['reconciliations'] }),
        queryClient.invalidateQueries({ queryKey: ['period-readiness'] }),
      ]);
    },
  });

  return (
    <>
      <PageHeader
        title="Importlar"
        description="Legacy Google Sheets ma’lumotlarini preview, validate va auditli tasdiqlash navbati."
      />
      {job.isLoading ? <LoadingState label="Import preview yuklanmoqda…" /> : null}
      {job.isError ? (
        <ErrorState message={getApiErrorMessage(job.error)} onRetry={() => void job.refetch()} />
      ) : null}
      {job.data ? (
        <>
          <Alert
            title={
              job.data.status === 'completed' ? 'Import yakunlandi' : 'Preview tasdiqlashga tayyor'
            }
            tone={job.data.status === 'completed' ? 'success' : 'warning'}
            className="mb-5"
          >
            {job.data.message}
          </Alert>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Manba satrlari"
              value={job.data.totalRows}
              helper={job.data.sourceName}
            />
            <KpiCard
              label="Normalizatsiya"
              value={job.data.normalizedRows}
              helper="Typed biznes sanasiga o‘tkazilgan satrlar."
              tone="success"
            />
            <KpiCard
              label="Explicit exception"
              value={job.data.exceptionRows}
              helper="Jim tashlab ketilmagan, qo‘lda ko‘riladigan satrlar."
              tone={job.data.exceptionRows ? 'warning' : 'success'}
            />
            <KpiCard
              label="Ledgerga qaytarildi"
              value={<MoneyText value={job.data.recoveredAmountUzs} />}
              helper="Normalizatsiyadan keyingi hisobga olingan summa."
              tone="info"
            />
          </div>
          <Card
            title="Xalqlar_kassa text-date normalizatsiyasi"
            description="Preview → typed validation → ledger yoki explicit exception. Har satr traceable qoladi."
          >
            {run.isError ? (
              <Alert title="Import bajarilmadi" tone="danger" className="mb-4">
                {getApiErrorMessage(run.error)}
              </Alert>
            ) : null}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <DatabaseZap className="mt-0.5 h-6 w-6 text-primary" />
                <div>
                  <p className="font-semibold text-ink">Job ID: {job.data.id}</p>
                  <p className="mt-1 text-sm text-muted">
                    {job.data.completedAt
                      ? `Yakunlangan: ${formatDateTime(job.data.completedAt)}`
                      : 'Previewda 44 satr: 1 typed sana va 43 text-date.'}
                  </p>
                </div>
              </div>
              <Button
                loading={run.isPending}
                disabled={job.data.status === 'completed'}
                onClick={() => run.mutate()}
              >
                <DatabaseZap className="h-4 w-4" />
                {job.data.status === 'completed' ? 'Import bajarilgan' : 'Importni ishga tushirish'}
              </Button>
            </div>
            <Link
              to={routes.dataQuality}
              className="mt-5 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
            >
              Reconciliation va exceptionlarni ochish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </>
      ) : null}
    </>
  );
}

function SeverityBadge({ value }: { value: DataQualityException['severity'] }) {
  const meta =
    value === 'error'
      ? ['Kritik', 'bg-red-50 text-red-800']
      : value === 'warning'
        ? ['Ogohlantirish', 'bg-amber-50 text-amber-800']
        : ['Ma’lumot', 'bg-sky-50 text-sky-800'];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta[1]}`}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      {meta[0]}
    </span>
  );
}
