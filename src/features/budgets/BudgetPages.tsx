import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authApi, budgetApi, referenceApi } from '@/shared/api/contracts';
import { getApiErrorMessage } from '@/shared/api/client';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { downloadCsv } from '@/shared/lib/csv';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatPercent } from '@/shared/lib/format';
import type {
  BudgetHistory,
  BudgetHistoryPeriod,
  BudgetLine,
  BudgetPlan,
  ExpenseType,
} from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  ErrorState,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Textarea,
  VarianceText,
} from '@/shared/ui';

type BudgetLineDraft = Pick<
  BudgetLine,
  'id' | 'branchId' | 'categoryId' | 'hasPlan' | 'plannedAmountUzs' | 'reason'
>;

function getLinePresentation(
  line: Pick<BudgetLine, 'hasPlan' | 'plannedAmountUzs' | 'actualAmountUzs' | 'varianceUzs'>,
) {
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
  const presentation = getLinePresentation({
    hasPlan: draft.hasPlan,
    plannedAmountUzs: previewPlan,
    actualAmountUzs: line.actualAmountUzs,
    varianceUzs: previewVariance,
  });

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
      <td className="min-w-64 px-4 py-3">
        {editable && draft.hasPlan ? (
          <Textarea
            aria-label={`${line.branchName}, ${line.categoryNameSnapshot} izoh yoki sabab`}
            value={draft.reason ?? ''}
            maxLength={1000}
            className="min-h-20"
            placeholder="Izoh yoki reja sababi"
            onChange={(event) => onChange({ ...draft, reason: event.target.value || null })}
          />
        ) : (
          <span className="text-sm text-slate-700">{draft.reason || '—'}</span>
        )}
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

function exportBudgetPlan(plan: BudgetPlan) {
  downloadCsv(`budjet-${plan.periodLabel.replace(/\s+/g, '-').toLowerCase()}`, [
    [
      'Davr',
      'Kategoriya',
      'Turi',
      'Filial',
      'Reja mavjud',
      'Reja',
      'Izoh / sabab',
      'Fakt',
      'Farq (reja−fakt)',
    ],
    ...plan.lines.map((line) => [
      plan.periodLabel,
      line.categoryNameSnapshot,
      line.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan',
      line.branchName,
      line.hasPlan ? 'Ha' : 'Yo‘q',
      line.plannedAmountUzs,
      line.reason,
      line.actualAmountUzs,
      line.varianceUzs,
    ]),
  ]);
}

export function BudgetPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const branch = searchParams.get('branch') ?? 'all';
  const [drafts, setDrafts] = useState<Record<string, BudgetLineDraft>>({});
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
  const historyYear = selectedPeriod?.year;
  const planQuery = useQuery({
    queryKey: queryKeys.budget(selectedPeriodId),
    queryFn: ({ signal }) => budgetApi.get(selectedPeriodId, signal),
    enabled: Boolean(selectedPeriodId),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.budgetHistory(historyYear),
    queryFn: ({ signal }) => budgetApi.history(historyYear, signal),
    enabled: Boolean(selectedPeriod),
  });
  const selectedMonthHistory = useMemo(
    () =>
      historyQuery.data && selectedPeriod
        ? {
            ...historyQuery.data,
            periods: historyQuery.data.periods.filter(
              (period) =>
                period.year === selectedPeriod.year && period.month === selectedPeriod.month,
            ),
          }
        : undefined,
    [historyQuery.data, selectedPeriod],
  );

  useEffect(() => {
    if (!searchParams.get('period') && selectedPeriodId) {
      const next = new URLSearchParams(searchParams);
      next.set('period', selectedPeriodId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedPeriodId, setSearchParams]);

  useEffect(() => {
    if (planQuery.data) {
      setDrafts(
        Object.fromEntries(
          planQuery.data.lines.map((line) => [
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
  }, [planQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const inputs = Object.values(drafts).map((line) => ({
        branchId: line.branchId,
        categoryId: line.categoryId,
        plannedAmountUzs: line.hasPlan ? (line.plannedAmountUzs ?? '0') : null,
        reason: line.hasPlan ? line.reason : null,
      }));
      return budgetApi.saveLines(selectedPeriodId, inputs);
    },
    onSuccess: async (updated: BudgetPlan) => {
      queryClient.setQueryData(queryKeys.budget(updated.periodId), updated);
      await queryClient.invalidateQueries({ queryKey: ['budget-history'] });
      await invalidatePlanningAggregates(queryClient);
    },
  });

  const hasEditPermission = Boolean(meQuery.data?.permissions.includes('budget.create_edit'));
  const canEdit = hasEditPermission && selectedPeriod?.status === 'open';

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Rejalashtirish' }, { label: 'Budjet', current: true }]} />
      <PageHeader
        title="Budjet"
        description="Kategoriya × filial × davr bo‘yicha xarajat rejasi. Qiymatlar to‘g‘ridan-to‘g‘ri tahrirlanadi."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!planQuery.data?.lines.length}
              onClick={() => planQuery.data && exportBudgetPlan(planQuery.data)}
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

      {periodsQuery.isLoading ? <LoadingState label="Davr yuklanmoqda…" /> : null}
      {periodsQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(periodsQuery.error)}
          onRetry={() => void periodsQuery.refetch()}
        />
      ) : null}

      {selectedPeriod?.status === 'closed' ? (
        <LockedNotice>Yopilgan davr budjeti tahrirlanmaydi, faqat ko‘rish mumkin.</LockedNotice>
      ) : null}
      {saveMutation.error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(saveMutation.error)}
        </Alert>
      ) : null}

      {planQuery.isLoading ? <LoadingState label="Budjet matritsasi yuklanmoqda…" /> : null}
      {planQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(planQuery.error)}
          onRetry={() => void planQuery.refetch()}
        />
      ) : null}
      {planQuery.data ? (
        <BudgetPageContent
          plan={planQuery.data}
          branch={branch}
          drafts={drafts}
          editable={canEdit}
          onChangeLine={(next) => setDrafts((current) => ({ ...current, [next.id]: next }))}
        />
      ) : null}

      <Card
        title="Budjet tarixi"
        description="Navbar’da tanlangan hisob oyi: kategoriya turi, filial rejasi, jami va izoh bilan."
        className="mt-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Tanlangan davr:{' '}
            <strong className="font-semibold text-ink">{selectedPeriod?.label ?? '—'}</strong>
          </p>
          <Button
            variant="secondary"
            disabled={!selectedMonthHistory?.periods.length}
            onClick={() =>
              selectedMonthHistory && exportBudgetHistory(selectedMonthHistory, branch)
            }
          >
            <Download className="h-4 w-4" /> Tanlangan oyni CSV yuklab olish
          </Button>
        </div>

        {historyQuery.isLoading ? <LoadingState label="Budjet tarixi yuklanmoqda…" /> : null}
        {historyQuery.isError ? (
          <ErrorState
            message={getApiErrorMessage(historyQuery.error)}
            onRetry={() => void historyQuery.refetch()}
          />
        ) : null}
        {selectedMonthHistory ? (
          <BudgetHistoryBlocks history={selectedMonthHistory} branch={branch} />
        ) : null}
      </Card>
    </div>
  );
}

function BudgetPageContent({
  plan,
  drafts,
  editable,
  onChangeLine,
  branch,
}: {
  plan: BudgetPlan;
  drafts: Record<string, BudgetLineDraft>;
  editable: boolean;
  onChangeLine: (next: BudgetLineDraft) => void;
  /** Top-bar branch, or "all". */
  branch: string;
}) {
  // A display filter only: editing still saves every branch, so narrowing
  // the view to one branch can never drop the other one’s plan.
  const lines = useMemo(
    () => (branch === 'all' ? plan.lines : plan.lines.filter((line) => line.branchId === branch)),
    [plan.lines, branch],
  );
  const updatedLabel = useMemo(
    () => `${plan.updatedByName} · ${formatDateTime(plan.updatedAt)}`,
    [plan.updatedByName, plan.updatedAt],
  );
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBlock label="Umumiy" lines={lines} />
        <SummaryBlock label="Doimiy xarajat" type="fixed" lines={lines} />
        <SummaryBlock label="O‘zgaruvchan xarajat" type="variable" lines={lines} />
        <div className="rounded-card border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Oxirgi saqlash</p>
          <p className="mt-3 text-sm text-slate-700">{updatedLabel}</p>
        </div>
      </div>

      <Card
        title="Filial × kategoriya matritsasi"
        description={
          editable
            ? 'Reja qatori mavjudligini alohida boshqaring. 0 va reja yo‘q bir xil emas.'
            : 'Yopiq davr uchun matritsa read-only.'
        }
        className="overflow-hidden"
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <caption className="sr-only">{plan.periodLabel} budjet matritsasi</caption>
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3">Kategoriya</th>
                <th className="px-4 py-3">Filial</th>
                <th className="px-4 py-3">Reja mavjudligi</th>
                <th className="px-4 py-3 text-right">Reja</th>
                <th className="px-4 py-3">Izoh / sabab</th>
                <th className="px-4 py-3 text-right">Fakt</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3">Holat</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
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
                  editable={editable}
                  onChange={onChangeLine}
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
      {plan.lines.some((line) => !line.hasPlan) ? (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
          <AlertTriangle className="h-4 w-4 text-warning" /> Matritsada kamida bitta rejasiz
          kategoriya bor; u hisobotda yashirilmaydi.
        </p>
      ) : null}
    </>
  );
}

function exportBudgetHistory(history: BudgetHistory, branchFilter: string) {
  const visibleBranches = history.branches.filter(
    (branch) => branchFilter === 'all' || branch.id === branchFilter,
  );
  downloadCsv(`budjet-tarixi-${history.year ?? 'barcha-yillar'}`, [
    [
      'Yil',
      'Oy',
      'Oy nomi',
      'Xarajat kategoriyasi',
      'Turi',
      ...visibleBranches.map((branch) => `${branch.name} reja`),
      'Jami reja',
      'Izoh / sabab',
      'Versiya',
      'Holat',
    ],
    ...history.periods.flatMap((period) =>
      period.rows.map((row) => {
        const visiblePlans = row.branches.filter(
          (plan) => branchFilter === 'all' || plan.branchId === branchFilter,
        );
        const planned = visiblePlans.filter((plan) => plan.hasPlan);
        const total =
          planned.length === 0
            ? null
            : planned
                .reduce((sum, plan) => sum + BigInt(plan.plannedAmountUzs ?? '0'), 0n)
                .toString();
        return [
          period.year,
          period.month,
          period.periodLabel.replace(String(period.year), '').trim(),
          row.categoryNameSnapshot,
          row.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan',
          ...visiblePlans.map((plan) => plan.plannedAmountUzs),
          total,
          getVisibleHistoryReason(row.branches, branchFilter, row.reason),
          period.revisionNo,
          period.versionStatus,
        ];
      }),
    ),
  ]);
}

function getVisibleHistoryReason(
  plans: BudgetHistoryPeriod['rows'][number]['branches'],
  branchFilter: string,
  combinedReason: string | null,
) {
  if (branchFilter === 'all') return combinedReason;
  return plans.find((plan) => plan.branchId === branchFilter)?.reason ?? null;
}

function BudgetHistoryBlocks({ history, branch }: { history: BudgetHistory; branch: string }) {
  const visibleBranches = history.branches.filter((item) => branch === 'all' || item.id === branch);
  if (history.periods.length === 0)
    return (
      <Alert title="Tarix mavjud emas" tone="info">
        Navbar’da tanlangan oy uchun budjet tarixi topilmadi.
      </Alert>
    );

  return (
    <div className="space-y-6">
      {history.periods.map((period) => (
        <BudgetHistoryMonth key={period.periodId} period={period} branch={branch} />
      ))}
      {visibleBranches.length === 0 ? (
        <Alert title="Filial topilmadi" tone="warning">
          Navbar orqali tanlangan filial budjet tarixida mavjud emas.
        </Alert>
      ) : null}
    </div>
  );
}

function BudgetHistoryMonth({ period, branch }: { period: BudgetHistoryPeriod; branch: string }) {
  const visibleBranches = period.totalsByBranch.filter(
    (item) => branch === 'all' || item.branchId === branch,
  );
  const plannedTotals = visibleBranches.filter((item) => item.hasPlan);
  const visibleTotal =
    plannedTotals.length === 0
      ? null
      : plannedTotals
          .reduce((sum, item) => sum + BigInt(item.plannedAmountUzs ?? '0'), 0n)
          .toString();
  const metadata = [
    period.revisionNo === null ? 'Versiya mavjud emas' : `Reviziya ${period.revisionNo}`,
    period.versionStatus ?? 'rejasiz',
    period.updatedAt
      ? `${period.updatedByName || 'Noma’lum xodim'} · ${formatDateTime(period.updatedAt)}`
      : null,
  ].filter(Boolean);

  return (
    <section className="overflow-hidden rounded-card border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div>
          <h3 className="text-base font-bold text-ink">{period.periodLabel}</h3>
          <p className="mt-1 text-xs text-muted">{metadata.join(' · ')}</p>
          {period.versionReason ? (
            <p className="mt-2 text-sm text-slate-700">Versiya sababi: {period.versionReason}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Oy jami</p>
          <MoneyText value={visibleTotal} className="mt-1 text-lg font-bold text-ink" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[980px] text-left"
          aria-label={`${period.periodLabel} budjet tarixi`}
        >
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3">Xarajat kategoriyasi</th>
              <th className="px-4 py-3">Turi</th>
              {visibleBranches.map((item) => (
                <th key={item.branchId} className="px-4 py-3 text-right">
                  {item.branchName} reja
                </th>
              ))}
              <th className="px-4 py-3 text-right">Jami reja</th>
              <th className="px-4 py-3">Izoh / sabab</th>
            </tr>
          </thead>
          <tbody>
            {period.rows.map((row) => {
              const visiblePlans = row.branches.filter(
                (plan) => branch === 'all' || plan.branchId === branch,
              );
              const planned = visiblePlans.filter((plan) => plan.hasPlan);
              const total =
                planned.length === 0
                  ? null
                  : planned
                      .reduce((sum, plan) => sum + BigInt(plan.plannedAmountUzs ?? '0'), 0n)
                      .toString();
              return (
                <tr key={row.categoryId} className="border-b border-border last:border-0">
                  <th scope="row" className="min-w-64 px-4 py-3 text-sm font-semibold text-ink">
                    {row.categoryNameSnapshot}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
                    {row.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                  </td>
                  {visiblePlans.map((plan) => (
                    <td key={plan.branchId} className="whitespace-nowrap px-4 py-3 text-right">
                      {plan.hasPlan ? (
                        <MoneyText value={plan.plannedAmountUzs} />
                      ) : (
                        <span className="text-sm text-muted">Reja mavjud emas</span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <MoneyText value={total} />
                  </td>
                  <td className="min-w-64 px-4 py-3 text-sm text-slate-700">
                    {getVisibleHistoryReason(row.branches, branch, row.reason) || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-sm font-bold text-white">
              <th colSpan={2} className="px-4 py-3">
                OY JAMI
              </th>
              {visibleBranches.map((item) => (
                <td key={item.branchId} className="px-4 py-3 text-right">
                  <MoneyText value={item.plannedAmountUzs} />
                </td>
              ))}
              <td className="px-4 py-3 text-right">
                <MoneyText value={visibleTotal} />
              </td>
              <td className="px-4 py-3">{period.versionReason || '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
