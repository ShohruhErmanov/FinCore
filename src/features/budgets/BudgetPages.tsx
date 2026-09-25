import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Save } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authApi, budgetApi, referenceApi, reportApi } from '@/shared/api/contracts';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { downloadCsv } from '@/shared/lib/csv';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatMoney, formatPercent } from '@/shared/lib/format';
import type { BudgetLine, BudgetPlan } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ErrorState,
  LoadingState,
  LockedNotice,
  MoneyText,
  PageHeader,
  Textarea,
  VarianceText,
} from '@/shared/ui';
import { BudgetOverview, BudgetSkeleton, BudgetTrend } from './budget-overview';
import './budget.css';

type BudgetLineDraft = Pick<
  BudgetLine,
  'id' | 'branchId' | 'categoryId' | 'hasPlan' | 'plannedAmountUzs' | 'reason'
>;
const MAX_BUDGET_AMOUNT = 9223372036854775807n;

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

const BudgetBranchEditor = memo(function BudgetBranchEditor({
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [amountError, setAmountError] = useState('');
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
    <div className="budget-branch-editor">
      <div className="budget-branch-heading">
        <span className="font-medium text-ink">{line.branchName}</span>
        {editable ? (
          <div
            role="group"
            aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja mavjudligi`}
            className="budget-plan-switch"
          >
            <button
              type="button"
              aria-pressed={!draft.hasPlan}
              onClick={() => onChange({ ...draft, hasPlan: false, plannedAmountUzs: null })}
            >
              Reja yo‘q
            </button>
            <button
              type="button"
              aria-pressed={draft.hasPlan}
              onClick={() =>
                onChange({
                  ...draft,
                  hasPlan: true,
                  plannedAmountUzs: draft.plannedAmountUzs ?? '0',
                })
              }
            >
              Reja mavjud
            </button>
          </div>
        ) : (
          <span className="text-sm text-muted">{draft.hasPlan ? 'Reja mavjud' : 'Reja yo‘q'}</span>
        )}
      </div>
      {draft.hasPlan ? (
        <div className="budget-branch-fields">
          <div>
            <label
              className="mb-1.5 block text-xs font-medium text-muted"
              htmlFor={`budget-amount-${line.id}`}
            >
              Reja summasi
            </label>
            {editable ? (
              <div className="budget-amount-wrap">
                <input
                  id={`budget-amount-${line.id}`}
                  data-budget-amount
                  aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja summasi`}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={amountError ? `budget-error-${line.id}` : undefined}
                  value={formatMoney(previewPlan).replace(/ so‘m$/, '')}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[\s\u00a0]/g, '');
                    if (!/^\d*$/.test(raw)) {
                      setAmountError('Faqat musbat butun summa kiriting.');
                      return;
                    }
                    if (BigInt(raw || '0') > MAX_BUDGET_AMOUNT) {
                      setAmountError('Summa ruxsat etilgan chegaradan oshdi.');
                      return;
                    }
                    setAmountError('');
                    onChange({ ...draft, plannedAmountUzs: BigInt(raw || '0').toString() });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    const inputs = [
                      ...document.querySelectorAll<HTMLInputElement>('[data-budget-amount]'),
                    ];
                    const next = inputs[inputs.indexOf(event.currentTarget) + 1];
                    if (next) {
                      event.preventDefault();
                      next.focus();
                      next.select();
                    }
                  }}
                />
                <span>so‘m</span>
              </div>
            ) : (
              <MoneyText value={previewPlan} className="font-semibold text-ink" />
            )}
            {amountError ? (
              <p id={`budget-error-${line.id}`} role="alert" className="mt-1 text-xs text-danger">
                {amountError}
              </p>
            ) : null}
            {previewPlan === '0' ? (
              <p className="mt-1 text-xs text-info">0 so‘m — haqiqiy nol reja</p>
            ) : null}
          </div>
          <div className="budget-note-control">
            {editable ? (
              <button
                type="button"
                className="budget-note-button"
                aria-expanded={noteOpen}
                onClick={() => setNoteOpen((open) => !open)}
              >
                {draft.reason ? 'Izohni tahrirlash' : 'Izoh qo‘shish'}
              </button>
            ) : null}
            {draft.reason && !noteOpen ? (
              <p className="budget-note-preview" title={draft.reason}>
                {draft.reason}
              </p>
            ) : null}
            {editable && noteOpen ? (
              <Textarea
                aria-label={`${line.branchName}, ${line.categoryNameSnapshot} izoh yoki sabab`}
                value={draft.reason ?? ''}
                maxLength={1000}
                className="mt-2 min-h-20"
                placeholder="Izoh yoki reja sababi"
                onChange={(event) => onChange({ ...draft, reason: event.target.value || null })}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <p className="budget-no-plan">Bu filial uchun reja kiritilmagan.</p>
      )}
      <div className="budget-branch-meta">
        <span>
          Fakt: <MoneyText value={line.actualAmountUzs} />
        </span>
        <span>
          Farq: {previewVariance === null ? '—' : <VarianceText value={previewVariance} />}
        </span>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
        >
          {presentation.label}
        </span>
        {presentation.completion !== null ? (
          <span>Bajarilish: {formatPercent(presentation.completion)}</span>
        ) : null}
      </div>
    </div>
  );
});

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
    refetchOnWindowFocus: false,
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.budgetHistory(historyYear),
    queryFn: ({ signal }) => budgetApi.history(historyYear, signal),
    enabled: Boolean(selectedPeriod),
  });
  const canReadReports = Boolean(meQuery.data?.permissions.includes('reports.view'));
  const trendQuery = useQuery({
    queryKey: queryKeys.report(
      'monthly',
      `year=${historyYear}&month=${selectedPeriod?.month}&branch=${branch}`,
    ),
    queryFn: ({ signal }) => reportApi.monthly({ year: historyYear!, branch }, signal),
    enabled: Boolean(selectedPeriod) && canReadReports,
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
  const visibleLines = useMemo(
    () =>
      (planQuery.data?.lines ?? []).filter((line) => branch === 'all' || line.branchId === branch),
    [planQuery.data, branch],
  );
  const context = `${selectedPeriod?.label ?? 'Davr tanlanmagan'} · ${branch === 'all' ? 'Barcha filiallar' : (visibleLines[0]?.branchName ?? historyQuery.data?.branches.find((item) => item.id === branch)?.name ?? 'Tanlangan filial')}`;
  const hasChanges = Boolean(
    planQuery.data?.lines.some((line) => {
      const draft = drafts[line.id];
      return (
        draft &&
        (draft.hasPlan !== line.hasPlan ||
          draft.plannedAmountUzs !== line.plannedAmountUzs ||
          draft.reason !== line.reason)
      );
    }),
  );
  const changedCount =
    planQuery.data?.lines.filter((line) => {
      const draft = drafts[line.id];
      return (
        draft &&
        (draft.hasPlan !== line.hasPlan ||
          draft.plannedAmountUzs !== line.plannedAmountUzs ||
          draft.reason !== line.reason)
      );
    }).length ?? 0;
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);
  const discardChanges = () => {
    if (!planQuery.data) return;
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
    saveMutation.reset();
  };
  const updateDraft = useCallback((next: BudgetLineDraft) => {
    setDrafts((current) => ({ ...current, [next.id]: next }));
  }, []);

  return (
    <div className="budget-page min-w-0 space-y-6">
      <Breadcrumbs items={[{ label: 'Rejalashtirish' }, { label: 'Budjet', current: true }]} />
      <PageHeader
        title="Budjet"
        description={context}
        actions={
          <>
            {canEdit ? (
              <a
                href="#budget-editor"
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-blue-700 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                Reja kiritish
              </a>
            ) : null}
            <Button
              variant="secondary"
              disabled={!planQuery.data?.lines.length}
              onClick={() =>
                planQuery.data && exportBudgetPlan({ ...planQuery.data, lines: visibleLines })
              }
            >
              <Download className="h-4 w-4" /> CSV yuklab olish
            </Button>
          </>
        }
      />

      {hasChanges ? (
        <p role="status" className="rounded-2xl bg-blue-50 px-5 py-3 text-sm text-blue-900">
          Saqlanmagan o‘zgarishlar bor. Yuqoridagi ko‘rsatkichlar oxirgi saqlangan rejani aks
          ettiradi.
        </p>
      ) : saveMutation.isSuccess ? (
        <p role="status" className="text-sm text-green-800">
          Budjet saqlandi.
        </p>
      ) : null}
      {periodsQuery.isError ? (
        <ErrorState
          message="Hisob davrlarini yuklab bo‘lmadi."
          onRetry={() => void periodsQuery.refetch()}
        />
      ) : null}

      {selectedPeriod?.status === 'closed' ? (
        <LockedNotice>Yopilgan davr budjeti tahrirlanmaydi, faqat ko‘rish mumkin.</LockedNotice>
      ) : null}
      {saveMutation.error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-5">
          Budjetni saqlab bo‘lmadi. Kiritilgan qiymatlar saqlanib turibdi; ruxsat va davr holatini
          tekshirib, qayta urinib ko‘ring.
        </Alert>
      ) : null}

      {periodsQuery.isLoading || (Boolean(selectedPeriodId) && planQuery.isLoading) ? (
        <BudgetSkeleton />
      ) : null}
      {periodsQuery.isSuccess && !selectedPeriod ? (
        <Alert title="Hisob davri topilmadi" tone="info">
          Yuqoridagi paneldan mavjud yil va oyni tanlang.
        </Alert>
      ) : null}
      {planQuery.isError ? (
        <ErrorState
          message="Budjet ma’lumotlarini yuklab bo‘lmadi."
          onRetry={() => void planQuery.refetch()}
        />
      ) : null}
      {planQuery.data && selectedPeriod ? (
        <BudgetOverview lines={visibleLines} context={context} />
      ) : null}
      {historyQuery.data && selectedPeriod ? (
        <BudgetTrend
          history={historyQuery.data}
          branch={branch}
          month={selectedPeriod.month}
          report={trendQuery.data}
        />
      ) : null}
      {historyQuery.isLoading ? <LoadingState label="Budjet dinamikasi yuklanmoqda…" /> : null}
      {historyQuery.isError ? (
        <ErrorState
          message="Budjet dinamikasini yuklab bo‘lmadi."
          onRetry={() => void historyQuery.refetch()}
        />
      ) : null}
      {canReadReports && trendQuery.isLoading ? (
        <LoadingState label="Oylik xarajatlar yuklanmoqda…" />
      ) : null}
      {trendQuery.isError ? (
        <ErrorState
          message="Oylik xarajatlar trendini yuklab bo‘lmadi."
          onRetry={() => void trendQuery.refetch()}
        />
      ) : null}
      {planQuery.data && selectedPeriod ? (
        <BudgetPageContent
          plan={planQuery.data}
          branch={branch}
          drafts={drafts}
          editable={canEdit && !saveMutation.isPending}
          onChangeLine={updateDraft}
        />
      ) : null}
      {canEdit && planQuery.data ? (
        <div className="budget-save-bar" role="region" aria-label="Budjetni saqlash">
          <p role="status" className="text-sm font-medium text-slate-700">
            {saveMutation.isPending
              ? 'Saqlanmoqda...'
              : hasChanges
                ? `${changedCount} ta o‘zgarish mavjud`
                : saveMutation.isSuccess
                  ? 'Saqlangan'
                  : 'Barcha o‘zgarishlar saqlangan'}
          </p>
          <div className="flex items-center gap-2">
            {hasChanges ? (
              <Button
                variant="secondary"
                disabled={saveMutation.isPending}
                onClick={discardChanges}
              >
                Bekor qilish
              </Button>
            ) : null}
            <Button
              disabled={!hasChanges || saveMutation.isPending}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-4 w-4" /> Saqlash
            </Button>
          </div>
        </div>
      ) : null}
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'fixed' | 'variable'>('all');
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
  const categories = useMemo(() => {
    const grouped = new Map<string, BudgetLine[]>();
    for (const line of lines) {
      const current = grouped.get(line.categoryId) ?? [];
      current.push(line);
      grouped.set(line.categoryId, current);
    }
    return [...grouped.values()];
  }, [lines]);
  const filteredCategories = categories.filter((categoryLines) => {
    const first = categoryLines[0];
    return (
      first &&
      (typeFilter === 'all' || first.expenseTypeSnapshot === typeFilter) &&
      first.categoryNameSnapshot.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    );
  });
  const totals = useMemo(() => {
    let fixed = 0n;
    let variable = 0n;
    const branches = new Map<string, { name: string; amount: bigint }>();
    for (const line of lines) {
      const draft = drafts[line.id] ?? line;
      const amount = draft.hasPlan ? BigInt(draft.plannedAmountUzs ?? '0') : 0n;
      if (line.expenseTypeSnapshot === 'fixed') fixed += amount;
      else variable += amount;
      const current = branches.get(line.branchId);
      branches.set(line.branchId, {
        name: line.branchName,
        amount: (current?.amount ?? 0n) + amount,
      });
    }
    return { fixed, variable, branches: [...branches.values()] };
  }, [drafts, lines]);
  return (
    <>
      <Card
        title="Budjet rejasi"
        description={
          editable
            ? 'Kategoriyalar va filiallar bo‘yicha reja kiriting, so‘ng saqlang.'
            : 'Reja tafsilotlari · Faqat ko‘rish uchun'
        }
        className="budget-matrix-card"
      >
        <div id="budget-editor" className="scroll-mt-48" />
        <div role="region" aria-label="Budjet rejasini tahrirlash" className="budget-editor">
          {lines.length ? (
            <>
              <div className="budget-entry-summary" aria-label="Kiritilgan reja xulosasi">
                <div>
                  <span>Doimiy</span>
                  <strong>{formatMoney(totals.fixed.toString())}</strong>
                </div>
                <div>
                  <span>O‘zgaruvchan</span>
                  <strong>{formatMoney(totals.variable.toString())}</strong>
                </div>
                <div>
                  <span>Umumiy reja</span>
                  <strong>{formatMoney((totals.fixed + totals.variable).toString())}</strong>
                </div>
                <div className="budget-entry-branches">
                  {totals.branches.map((item) => (
                    <span key={item.name}>
                      {item.name}: <b>{formatMoney(item.amount.toString())}</b>
                    </span>
                  ))}
                </div>
              </div>
              {!lines.some((line) => (drafts[line.id] ?? line).hasPlan) ? (
                <p className="budget-entry-empty" role="status">
                  Budjet rejasi hali kiritilmagan. Quyidagi filial qatoridan “Reja mavjud”ni tanlab,
                  summani kiriting.
                </p>
              ) : null}
              <div className="budget-entry-tools">
                <input
                  type="search"
                  aria-label="Kategoriya qidirish"
                  placeholder="Kategoriya qidirish..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div role="group" aria-label="Kategoriya turi" className="budget-type-filter">
                  {(
                    [
                      ['all', 'Barchasi'],
                      ['fixed', 'Doimiy'],
                      ['variable', 'O‘zgaruvchan'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={typeFilter === value}
                      onClick={() => setTypeFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredCategories.length ? (
                <div className="budget-category-list">
                  {filteredCategories.map((categoryLines) => {
                    const first = categoryLines[0]!;
                    const categoryTotal = categoryLines.reduce((sum, line) => {
                      const draft = drafts[line.id] ?? line;
                      return sum + (draft.hasPlan ? BigInt(draft.plannedAmountUzs ?? '0') : 0n);
                    }, 0n);
                    return (
                      <article className="budget-category-card" key={first.categoryId}>
                        <div className="budget-category-heading">
                          <h3>{first.categoryNameSnapshot}</h3>
                          <span className="budget-type-badge">
                            {first.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
                          </span>
                        </div>
                        <div className="budget-category-branches">
                          {categoryLines.map((line) => (
                            <BudgetBranchEditor
                              key={line.id}
                              line={line}
                              draft={drafts[line.id] ?? line}
                              editable={editable}
                              onChange={onChangeLine}
                            />
                          ))}
                        </div>
                        <div className="budget-category-total">
                          <span>Jami kategoriya</span>
                          <strong>{formatMoney(categoryTotal.toString())}</strong>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="budget-entry-empty">
                  Kategoriya topilmadi. Qidiruv yoki turni o‘zgartiring.
                </p>
              )}
            </>
          ) : (
            <p className="budget-entry-empty">
              Budjet rejasi hali kiritilmagan. Kategoriya va filiallar mavjudligini tekshiring.
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap justify-between gap-3 text-xs leading-5 text-muted">
        <p>0 so‘m — kiritilgan nol reja. Belgilanmagan qator — reja mavjud emas.</p>
        {plan.updatedByName ? <p>Oxirgi saqlash: {updatedLabel}</p> : null}
      </div>
    </>
  );
}
