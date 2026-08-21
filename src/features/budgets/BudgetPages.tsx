import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CopyPlus,
  FilePenLine,
  Save,
  Send,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authApi, budgetApi, referenceApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { routes } from '@/shared/config/routes';
import { formatDateTime, formatPercent } from '@/shared/lib/format';
import type { BudgetLine, BudgetVersion, ExpenseType } from '@/shared/types/domain';
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
  Select,
  StatusBadge,
  Textarea,
  VarianceText,
  type Column,
} from '@/shared/ui';

type BudgetLineDraft = Pick<
  BudgetLine,
  'id' | 'branchId' | 'categoryId' | 'hasPlan' | 'plannedAmountUzs' | 'reason'
>;

function statusDescription(status: BudgetVersion['status']) {
  if (status === 'draft') return 'Moliya rahbari tahrirlaydi va tasdiqqa yuboradi.';
  if (status === 'submitted') return 'Direktor ko‘rib chiqishi va tasdiqlashi kutilmoqda.';
  if (status === 'approved')
    return 'Amaldagi tasdiqlangan versiya. O‘zgartirish yangi reviziya talab qiladi.';
  return 'Davr bilan birga qulflangan tarixiy versiya.';
}

function CreateBudgetRevisionPanel({
  periodId,
  periodLabel,
  sourceRevisionNo,
  onCancel,
  onCreated,
}: {
  periodId: string;
  periodLabel: string;
  sourceRevisionNo: number;
  onCancel: () => void;
  onCreated: (created: BudgetVersion) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: () => budgetApi.createRevision(periodId, { reason: reason.trim() }),
    onSuccess: onCreated,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5) {
      setValidationError('Reviziya sababi kamida 5 ta belgidan iborat bo‘lsin.');
      return;
    }
    setValidationError(null);
    createMutation.mutate();
  };

  return (
    <Card
      title="Yangi budjet reviziyasi"
      description={`${periodLabel} · #${sourceRevisionNo} tasdiqlangan/locked versiya nusxalanadi.`}
      className="mb-5"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Alert title="Server yangi draft yaratadi" tone="info">
          Reviziya raqami serverda avtomatik beriladi. Tasdiqlangan tarix o‘zgarmaydi; yangi draft
          eng so‘nggi tasdiqlangan yoki locked versiyadan olinadi.
        </Alert>
        <FormField
          label="Reviziya sababi"
          htmlFor={`budget-revision-reason-${periodId}`}
          required
          hint="Masalan: ijara xarajatlari bo‘yicha yangilangan prognoz."
          error={validationError ?? undefined}
        >
          <Textarea
            id={`budget-revision-reason-${periodId}`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (validationError) setValidationError(null);
            }}
            maxLength={500}
            aria-invalid={Boolean(validationError)}
            aria-describedby={
              validationError ? `budget-revision-reason-${periodId}-error` : undefined
            }
            placeholder="Reviziya nima sababdan kerakligini yozing"
            disabled={createMutation.isPending}
          />
        </FormField>
        {createMutation.error ? (
          <Alert title="Reviziya yaratilmadi" tone="danger">
            {getApiErrorMessage(createMutation.error)}
          </Alert>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={createMutation.isPending}
          >
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            <CopyPlus className="h-4 w-4" /> Draft reviziya yaratish
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function BudgetListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false);
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
  const versionsQuery = useQuery({
    queryKey: queryKeys.budgets(selectedPeriodId),
    queryFn: ({ signal }) => budgetApi.list(selectedPeriodId, signal),
    enabled: Boolean(selectedPeriodId),
  });
  const selectedPeriod = periodsQuery.data?.find((period) => period.id === selectedPeriodId);
  const periodVersions = versionsQuery.data ?? [];
  const sourceVersion = periodVersions
    .filter((version) => version.status === 'approved' || version.status === 'locked')
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
  const inProgressVersion = periodVersions.find(
    (version) => version.status === 'draft' || version.status === 'submitted',
  );
  const hasCreatePermission = Boolean(meQuery.data?.permissions.includes('budget.create_edit'));
  const revisionBlockedReason =
    selectedPeriod?.status === 'closed'
      ? 'Yopiq davr uchun yangi reviziya yaratib bo‘lmaydi.'
      : inProgressVersion
        ? `#${inProgressVersion.revisionNo} reviziya hali ${inProgressVersion.status === 'draft' ? 'qoralama' : 'tasdiqda'}.`
        : !sourceVersion
          ? 'Tasdiqlangan yoki locked manba versiya mavjud emas.'
          : undefined;
  const canCreateRevision =
    hasCreatePermission &&
    selectedPeriod?.status === 'open' &&
    Boolean(sourceVersion) &&
    !inProgressVersion;

  useEffect(() => {
    if (!searchParams.get('period') && selectedPeriodId) {
      const next = new URLSearchParams(searchParams);
      next.set('period', selectedPeriodId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedPeriodId, setSearchParams]);

  const columns = useMemo<Column<BudgetVersion>[]>(
    () => [
      {
        key: 'revision',
        header: 'Reviziya',
        cell: (row) => <span className="font-bold text-ink">#{row.revisionNo}</span>,
      },
      { key: 'period', header: 'Davr', cell: (row) => row.periodLabel },
      { key: 'status', header: 'Holat', cell: (row) => <StatusBadge status={row.status} /> },
      {
        key: 'lines',
        header: 'Qatorlar',
        cell: (row) => <span className="tabular-nums">{row.lines.length}</span>,
      },
      {
        key: 'creator',
        header: 'Yaratgan',
        cell: (row) => (
          <div>
            <p>{row.createdByName}</p>
            <p className="mt-0.5 text-xs text-muted">{formatDateTime(row.createdAt)}</p>
          </div>
        ),
      },
      {
        key: 'workflow',
        header: 'Workflow',
        cell: (row) => (
          <span className="max-w-xs text-xs leading-5 text-muted">
            {statusDescription(row.status)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Rejalashtirish' }, { label: 'Budjet', current: true }]} />
      <PageHeader
        title="Budjet versiyalari"
        description="Kategoriya × filial × davr bo‘yicha revisionli xarajat rejasi. Eski qiymat overwrite qilinmaydi."
        actions={
          hasCreatePermission ? (
            <Button
              disabled={!canCreateRevision}
              title={revisionBlockedReason}
              onClick={() => setRevisionPanelOpen(true)}
            >
              <CopyPlus className="h-4 w-4" /> Yangi reviziya
            </Button>
          ) : undefined
        }
      />
      <Card
        title="Hisob davri"
        description="Ochiq va tarixiy davrlarni alohida ko‘ring."
        className="mb-5"
      >
        {periodsQuery.isLoading ? <LoadingState label="Davrlar yuklanmoqda…" /> : null}
        {periodsQuery.isError ? (
          <ErrorState
            message={getApiErrorMessage(periodsQuery.error)}
            onRetry={() => void periodsQuery.refetch()}
          />
        ) : null}
        {periodsQuery.data ? (
          <div className="max-w-md">
            <FormField label="Davr" htmlFor="budget-period-filter">
              <Select
                id="budget-period-filter"
                value={selectedPeriodId}
                onChange={(event) => {
                  setRevisionPanelOpen(false);
                  setSearchParams({ period: event.target.value }, { replace: true });
                }}
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

      {inProgressVersion ? (
        <Alert title="Davom etayotgan reviziya mavjud" tone="warning" className="mb-5">
          #{inProgressVersion.revisionNo} reviziya{' '}
          {inProgressVersion.status === 'draft' ? 'qoralama holatida' : 'direktor tasdig‘ida'}.
          Yangi draft ochishdan oldin shu oqim yakunlanishi kerak.{' '}
          <Link
            to={routes.budgetDetail(inProgressVersion.id)}
            className="font-semibold underline underline-offset-2"
          >
            Reviziyani ochish
          </Link>
        </Alert>
      ) : null}
      {revisionPanelOpen && canCreateRevision && selectedPeriod && sourceVersion ? (
        <CreateBudgetRevisionPanel
          key={selectedPeriod.id}
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          sourceRevisionNo={sourceVersion.revisionNo}
          onCancel={() => setRevisionPanelOpen(false)}
          onCreated={async (created) => {
            setRevisionPanelOpen(false);
            queryClient.setQueryData(queryKeys.budget(created.id), created);
            await queryClient.invalidateQueries({ queryKey: queryKeys.budgets(created.periodId) });
            navigate(routes.budgetDetail(created.id));
          }}
        />
      ) : null}

      {versionsQuery.isLoading ? <LoadingState label="Budjet versiyalari yuklanmoqda…" /> : null}
      {versionsQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(versionsQuery.error)}
          onRetry={() => void versionsQuery.refetch()}
        />
      ) : null}
      {versionsQuery.data?.length === 0 ? (
        <EmptyState
          title="Budjet versiyasi mavjud emas"
          description="Bu davrda reviziya uchun nusxalanadigan tasdiqlangan yoki locked budjet versiyasi mavjud emas."
        />
      ) : null}
      {versionsQuery.data?.length ? (
        <Card
          title={`${versionsQuery.data.length} ta versiya`}
          description="Qatorni bosib matritsa va workflow tafsilotlarini oching."
          className="overflow-hidden"
        >
          <div className="-m-5">
            <DataTable
              rows={versionsQuery.data}
              columns={columns}
              caption="Budjet versiyalari"
              onRowClick={(row) => navigate(routes.budgetDetail(row.id))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function getLinePresentation(line: BudgetLine | (BudgetLine & BudgetLineDraft)) {
  if (!line.hasPlan || line.plannedAmountUzs === null)
    return {
      label: 'Reja mavjud emas',
      className: 'bg-slate-100 text-slate-700',
      completion: null,
    };
  const plan = BigInt(line.plannedAmountUzs);
  const actual = BigInt(line.actualAmountUzs);
  if (plan === 0n && actual > 0n)
    return {
      label: 'Rejadan tashqari / Unplanned',
      className: 'bg-amber-50 text-amber-800',
      completion: null,
    };
  if (plan === 0n)
    return { label: 'Nol reja', className: 'bg-sky-50 text-sky-800', completion: null };
  const variance = line.varianceUzs === null ? plan - actual : BigInt(line.varianceUzs);
  const completion = Number((actual * 10_000n) / plan) / 100;
  if (variance < 0n)
    return { label: 'Reja oshgan', className: 'bg-red-50 text-red-800', completion };
  if (variance === 0n)
    return { label: 'Reja bilan teng', className: 'bg-green-50 text-green-800', completion };
  return { label: 'Tejash', className: 'bg-green-50 text-green-800', completion };
}

function BudgetLineRow({
  line,
  draft,
  editable,
  onChange,
}: {
  line: BudgetLine;
  draft: BudgetLineDraft;
  editable: boolean;
  onChange: (next: BudgetLineDraft) => void;
}) {
  const previewPlan = draft.hasPlan ? (draft.plannedAmountUzs ?? '0') : null;
  const previewVariance =
    previewPlan === null
      ? null
      : (BigInt(previewPlan || '0') - BigInt(line.actualAmountUzs)).toString();
  const previewLine: BudgetLine = {
    ...line,
    hasPlan: draft.hasPlan,
    plannedAmountUzs: previewPlan,
    varianceUzs: previewVariance,
    reason: draft.reason,
  };
  const presentation = getLinePresentation(previewLine);

  return (
    <tr className="border-b border-border align-top last:border-0">
      <th scope="row" className="sticky left-0 z-10 min-w-56 bg-white px-4 py-3 text-left">
        <p className="text-sm font-semibold text-ink">{line.categoryNameSnapshot}</p>
        <p className="mt-1 text-xs text-muted">
          {line.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
        </p>
      </th>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{line.branchName}</td>
      <td className="min-w-48 px-4 py-3">
        {editable ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={draft.hasPlan}
              onChange={(event) =>
                onChange({
                  ...draft,
                  hasPlan: event.target.checked,
                  plannedAmountUzs: event.target.checked ? (draft.plannedAmountUzs ?? '0') : null,
                })
              }
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Reja qatori mavjud
          </label>
        ) : draft.hasPlan ? (
          <span className="text-sm font-semibold text-success">Mavjud</span>
        ) : (
          <span className="text-sm font-semibold text-muted">Mavjud emas</span>
        )}
      </td>
      <td className="min-w-52 px-4 py-3 text-right">
        {editable && draft.hasPlan ? (
          <CurrencyInput
            aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja summasi`}
            value={draft.plannedAmountUzs ?? '0'}
            onChange={(event) => {
              if (/^\d*$/.test(event.target.value))
                onChange({ ...draft, plannedAmountUzs: event.target.value || '0' });
            }}
          />
        ) : (
          <MoneyText
            value={previewPlan}
            className={draft.hasPlan ? 'font-semibold text-ink' : 'text-muted'}
          />
        )}
        {draft.hasPlan && previewPlan === '0' ? (
          <p className="mt-1 text-xs text-info">0 so‘m — valid nol reja</p>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <MoneyText value={line.actualAmountUzs} className="font-semibold" />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {previewVariance === null ? (
          <span className="text-sm text-muted">—</span>
        ) : (
          <VarianceText value={previewVariance} />
        )}
      </td>
      <td className="min-w-56 px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
        >
          {presentation.label}
        </span>
        <p className="mt-1 text-xs text-muted">
          Bajarilish: {formatPercent(presentation.completion)}
        </p>
      </td>
      <td className="min-w-64 px-4 py-3">
        {editable && draft.hasPlan ? (
          <Input
            aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja sababi`}
            value={draft.reason ?? ''}
            onChange={(event) => onChange({ ...draft, reason: event.target.value })}
            placeholder="Reja sababi"
          />
        ) : (
          <span className="text-sm text-slate-600">
            {draft.reason ?? (draft.hasPlan ? 'Sabab kiritilmagan' : 'Reja qatori yo‘q')}
          </span>
        )}
      </td>
    </tr>
  );
}

function SummaryBlock({
  label,
  type,
  lines,
}: {
  label: string;
  type?: ExpenseType;
  lines: BudgetLine[];
}) {
  const selected = type ? lines.filter((line) => line.expenseTypeSnapshot === type) : lines;
  const planned = selected.filter((line) => line.hasPlan).length;
  const noPlan = selected.filter((line) => !line.hasPlan).length;
  const zeroPlan = selected.filter((line) => line.hasPlan && line.plannedAmountUzs === '0').length;
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
        <div>
          <p className="text-xs text-muted">Jami qator</p>
          <p className="mt-1 text-xl font-bold text-ink">{selected.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Rejalangan</p>
          <p className="mt-1 text-xl font-bold text-ink">{planned}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        {noPlan} ta rejasiz · {zeroPlan} ta valid nol reja
      </p>
    </div>
  );
}

export function BudgetDetailPage() {
  const { versionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, BudgetLineDraft>>({});
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false);
  const versionQuery = useQuery({
    queryKey: queryKeys.budget(versionId),
    queryFn: ({ signal }) => budgetApi.detail(versionId, signal),
    enabled: Boolean(versionId),
  });
  const siblingPeriodId = versionQuery.data?.periodId ?? '';
  const siblingVersionsQuery = useQuery({
    queryKey: queryKeys.budgets(siblingPeriodId),
    queryFn: ({ signal }) => budgetApi.list(siblingPeriodId, signal),
    enabled: Boolean(siblingPeriodId),
  });
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const periodsQuery = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (versionQuery.data) {
      setDrafts(
        Object.fromEntries(
          versionQuery.data.lines.map((line) => [
            line.id,
            {
              id: line.id,
              branchId: line.branchId,
              categoryId: line.categoryId,
              hasPlan: line.hasPlan,
              plannedAmountUzs: line.plannedAmountUzs,
              reason: line.reason,
            },
          ]),
        ),
      );
    }
  }, [versionQuery.data]);

  const updateCache = async (updated: BudgetVersion) => {
    queryClient.setQueryData(queryKeys.budget(versionId), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets(updated.periodId) }),
      invalidatePlanningAggregates(queryClient),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: () => {
      const inputs = Object.values(drafts).map((line) => ({
        branchId: line.branchId,
        categoryId: line.categoryId,
        plannedAmountUzs: line.hasPlan ? (line.plannedAmountUzs ?? '0') : null,
        reason: line.hasPlan ? line.reason?.trim() || null : null,
      }));
      return budgetApi.saveLines(versionId, inputs);
    },
    onSuccess: updateCache,
  });
  const submitMutation = useMutation({
    mutationFn: () => budgetApi.submit(versionId),
    onSuccess: updateCache,
  });
  const approveMutation = useMutation({
    mutationFn: () => budgetApi.approve(versionId),
    onSuccess: updateCache,
  });

  if (versionQuery.isLoading) return <LoadingState label="Budjet matritsasi yuklanmoqda…" />;
  if (versionQuery.isError)
    return (
      <ErrorState
        message={getApiErrorMessage(versionQuery.error)}
        onRetry={() => void versionQuery.refetch()}
      />
    );
  if (!versionQuery.data) return <EmptyState title="Budjet versiyasi topilmadi" />;

  const version = versionQuery.data;
  const period = periodsQuery.data?.find((item) => item.id === version.periodId);
  const canEdit =
    version.status === 'draft' &&
    period?.status === 'open' &&
    Boolean(meQuery.data?.permissions.includes('budget.create_edit'));
  const canSubmit =
    version.status === 'draft' &&
    period?.status === 'open' &&
    Boolean(meQuery.data?.permissions.includes('budget.submit'));
  const canApprove =
    version.status === 'submitted' &&
    period?.status === 'open' &&
    Boolean(meQuery.data?.permissions.includes('budget.approve'));
  const siblingVersions = siblingVersionsQuery.data ?? [];
  const sourceVersion = siblingVersions
    .filter((candidate) => candidate.status === 'approved' || candidate.status === 'locked')
    .sort((a, b) => b.revisionNo - a.revisionNo)[0];
  const inProgressVersion = siblingVersions.find(
    (candidate) => candidate.status === 'draft' || candidate.status === 'submitted',
  );
  const hasCreatePermission = Boolean(meQuery.data?.permissions.includes('budget.create_edit'));
  const revisionBlockedReason =
    period?.status === 'closed'
      ? 'Yopiq davr uchun yangi reviziya yaratib bo‘lmaydi.'
      : siblingVersionsQuery.isLoading
        ? 'Budjet versiyalari tekshirilmoqda.'
        : siblingVersionsQuery.isError
          ? 'Budjet versiyalarini tekshirib bo‘lmadi.'
          : inProgressVersion
            ? `#${inProgressVersion.revisionNo} reviziya hali ${inProgressVersion.status === 'draft' ? 'qoralama' : 'tasdiqda'}.`
            : !sourceVersion
              ? 'Tasdiqlangan yoki locked manba versiya mavjud emas.'
              : undefined;
  const canCreateRevision =
    hasCreatePermission &&
    period?.status === 'open' &&
    Boolean(sourceVersion) &&
    !inProgressVersion &&
    !siblingVersionsQuery.isError;
  const mutationError = saveMutation.error ?? submitMutation.error ?? approveMutation.error;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Budjet' },
          { label: `${version.periodLabel} · reviziya ${version.revisionNo}`, current: true },
        ]}
      />
      <PageHeader
        title={`${version.periodLabel} budjeti`}
        description={`Reviziya #${version.revisionNo}. ${statusDescription(version.status)}`}
        badge={<StatusBadge status={version.status} />}
        actions={
          <>
            <Link
              to={`${routes.budgets}?period=${version.periodId}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Versiyalarga qaytish
            </Link>
            {hasCreatePermission ? (
              <Button
                variant="secondary"
                disabled={!canCreateRevision}
                title={revisionBlockedReason}
                onClick={() => setRevisionPanelOpen(true)}
              >
                <CopyPlus className="h-4 w-4" /> Yangi reviziya
              </Button>
            ) : null}
            {canEdit ? (
              <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                <Save className="h-4 w-4" /> Draftni saqlash
              </Button>
            ) : null}
            {canSubmit ? (
              <Button
                variant="secondary"
                loading={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                <Send className="h-4 w-4" /> Tasdiqqa yuborish
              </Button>
            ) : null}
            {canApprove ? (
              <Button loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                <ClipboardCheck className="h-4 w-4" /> Tasdiqlash
              </Button>
            ) : null}
          </>
        }
      />

      {revisionPanelOpen && canCreateRevision && sourceVersion ? (
        <CreateBudgetRevisionPanel
          periodId={version.periodId}
          periodLabel={version.periodLabel}
          sourceRevisionNo={sourceVersion.revisionNo}
          onCancel={() => setRevisionPanelOpen(false)}
          onCreated={async (created) => {
            setRevisionPanelOpen(false);
            queryClient.setQueryData(queryKeys.budget(created.id), created);
            await queryClient.invalidateQueries({ queryKey: queryKeys.budgets(created.periodId) });
            navigate(routes.budgetDetail(created.id));
          }}
        />
      ) : null}

      {period?.status === 'closed' || version.status === 'locked' ? (
        <LockedNotice>
          Yopilgan davr yoki locked budjet oddiy edit bilan o‘zgarmaydi. Auditli reopen yoki yangi
          reviziya kerak.
        </LockedNotice>
      ) : null}
      {version.status === 'approved' ? (
        <Alert title="Tasdiqlangan versiya" tone="success" className="mb-5">
          Bu qiymatlar tarixiy source of truth. O‘zgartirish overwrite emas, yangi revision oqimi
          orqali bajariladi.
        </Alert>
      ) : null}
      {inProgressVersion && inProgressVersion.id !== version.id ? (
        <Alert title="Davom etayotgan reviziya mavjud" tone="warning" className="mb-5">
          #{inProgressVersion.revisionNo} reviziya{' '}
          {inProgressVersion.status === 'draft' ? 'qoralama holatida' : 'direktor tasdig‘ida'}.
          Yangi draft faqat shu oqim yakunlangandan keyin yaratiladi.{' '}
          <Link
            to={routes.budgetDetail(inProgressVersion.id)}
            className="font-semibold underline underline-offset-2"
          >
            Reviziyani ochish
          </Link>
        </Alert>
      ) : null}
      {mutationError ? (
        <Alert title="Amal bajarilmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(mutationError)}
        </Alert>
      ) : null}

      <Card title="Reviziya sababi" className="mb-5">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {version.reason ?? 'Reviziya sababi kiritilmagan.'}
        </p>
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBlock label="Umumiy" lines={version.lines} />
        <SummaryBlock label="Doimiy xarajat" type="fixed" lines={version.lines} />
        <SummaryBlock label="O‘zgaruvchan xarajat" type="variable" lines={version.lines} />
        <div className="rounded-card border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Workflow</p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <FilePenLine className="h-4 w-4 text-info" /> Yaratdi: {version.createdByName}
            </p>
            <p className="flex items-center gap-2">
              <Send className="h-4 w-4 text-info" /> Yubordi: {version.submittedByName ?? '—'}
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> Tasdiqladi:{' '}
              {version.approvedByName ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <Card
        title="Filial × kategoriya matritsasi"
        description={
          canEdit
            ? 'Reja qatori mavjudligini alohida boshqaring. 0 va reja yo‘q bir xil emas.'
            : 'Server qaytargan tasdiq holati sabab matritsa read-only.'
        }
        actions={
          canEdit ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-info">
              <Sparkles className="h-4 w-4" /> Draft preview
            </span>
          ) : undefined
        }
        className="overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left">
            <caption className="sr-only">{version.periodLabel} budjet matritsasi</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3">Kategoriya</th>
                <th className="px-4 py-3">Filial</th>
                <th className="px-4 py-3">Reja mavjudligi</th>
                <th className="px-4 py-3 text-right">Reja</th>
                <th className="px-4 py-3 text-right">Fakt</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Sabab</th>
              </tr>
            </thead>
            <tbody>
              {version.lines.map((line) => (
                <BudgetLineRow
                  key={line.id}
                  line={line}
                  draft={
                    drafts[line.id] ?? {
                      id: line.id,
                      branchId: line.branchId,
                      categoryId: line.categoryId,
                      hasPlan: line.hasPlan,
                      plannedAmountUzs: line.plannedAmountUzs,
                      reason: line.reason,
                    }
                  }
                  editable={canEdit}
                  onChange={(next) => setDrafts((current) => ({ ...current, [line.id]: next }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Alert title="0 — haqiqiy qiymat" tone="info">
          Reja qatori mavjud va summa 0 bo‘lsa, jadval <strong>0 so‘m</strong>ni ko‘rsatadi. Fakt
          musbat bo‘lsa holat <strong>Rejadan tashqari / Unplanned</strong>.
        </Alert>
        <Alert title="Reja mavjud emas" tone="warning">
          Kategoriya uchun plan line bo‘lmasa, foiz va farq hisoblanmaydi. Bu holat 0 so‘mlik
          rejadan alohida saqlanadi.
        </Alert>
      </div>
      {version.lines.some((line) => !line.hasPlan) ? (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
          <AlertTriangle className="h-4 w-4 text-warning" /> Matritsada kamida bitta rejasiz
          kategoriya bor; u hisobotda yashirilmaydi.
        </p>
      ) : null}
    </div>
  );
}
