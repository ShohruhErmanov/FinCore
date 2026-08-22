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
import type { BudgetLine, BudgetPlan, ExpenseType } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CurrencyInput,
  ErrorState,
  FormField,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Select,
  VarianceText,
} from '@/shared/ui';

type BudgetLineDraft = Pick<
  BudgetLine,
  'id' | 'branchId' | 'categoryId' | 'hasPlan' | 'plannedAmountUzs'
>;

function getLinePresentation(line: Pick<BudgetLine, 'hasPlan' | 'plannedAmountUzs' | 'actualAmountUzs' | 'varianceUzs'>) {
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
    ['Davr', 'Kategoriya', 'Turi', 'Filial', 'Reja mavjud', 'Reja', 'Fakt', 'Farq (reja−fakt)'],
    ...plan.lines.map((line) => [
      plan.periodLabel,
      line.categoryNameSnapshot,
      line.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan',
      line.branchName,
      line.hasPlan ? 'Ha' : 'Yo‘q',
      line.plannedAmountUzs,
      line.actualAmountUzs,
      line.varianceUzs,
    ]),
  ]);
}

export function BudgetPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const planQuery = useQuery({
    queryKey: queryKeys.budget(selectedPeriodId),
    queryFn: ({ signal }) => budgetApi.get(selectedPeriodId, signal),
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
      }));
      return budgetApi.saveLines(selectedPeriodId, inputs);
    },
    onSuccess: async (updated: BudgetPlan) => {
      queryClient.setQueryData(queryKeys.budget(updated.periodId), updated);
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
          drafts={drafts}
          editable={canEdit}
          onChangeLine={(next) => setDrafts((current) => ({ ...current, [next.id]: next }))}
        />
      ) : null}
    </div>
  );
}

function BudgetPageContent({
  plan,
  drafts,
  editable,
  onChangeLine,
}: {
  plan: BudgetPlan;
  drafts: Record<string, BudgetLineDraft>;
  editable: boolean;
  onChangeLine: (next: BudgetLineDraft) => void;
}) {
  const updatedLabel = useMemo(
    () => `${plan.updatedByName} · ${formatDateTime(plan.updatedAt)}`,
    [plan.updatedByName, plan.updatedAt],
  );
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBlock label="Umumiy" lines={plan.lines} />
        <SummaryBlock label="Doimiy xarajat" type="fixed" lines={plan.lines} />
        <SummaryBlock label="O‘zgaruvchan xarajat" type="variable" lines={plan.lines} />
        <div className="rounded-card border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Oxirgi saqlash
          </p>
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
                <th className="px-4 py-3 text-right">Fakt</th>
                <th className="px-4 py-3 text-right">Farq</th>
                <th className="px-4 py-3">Holat</th>
              </tr>
            </thead>
            <tbody>
              {plan.lines.map((line) => (
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
