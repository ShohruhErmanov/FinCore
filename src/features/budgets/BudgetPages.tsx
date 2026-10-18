import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authApi, budgetApi, referenceApi, reportApi } from '@/shared/api/contracts';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { formatDateTime, formatMoney, tashkentBusinessDate } from '@/shared/lib/format';
import type { BudgetLine, BudgetPlan } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ErrorState,
  LoadingState,
  LockedNotice,
  PageHeader,
  Select,
} from '@/shared/ui';
import { BudgetOverview, BudgetSkeleton, BudgetTrend } from './budget-overview';
import './budget.css';
import { type BudgetLineDraft, exportBudgetPlan } from './budget-plan';
import { SelectedBudgetCategory } from './budget-branch-editor';

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
  const currentBusinessDate = tashkentBusinessDate();
  const currentYear = Number(currentBusinessDate.slice(0, 4));
  const currentMonth = Number(currentBusinessDate.slice(5, 7));
  const selectedPeriodId =
    searchParams.get('period') ??
    periodsQuery.data?.find(
      (period) => period.year === currentYear && period.month === currentMonth,
    )?.id ??
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.budgetHistoryRoot });
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
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
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
  const selectedCategoryLines = useMemo(
    () =>
      categories.find((categoryLines) => categoryLines[0]?.categoryId === selectedCategoryId) ??
      categories[0] ??
      null,
    [categories, selectedCategoryId],
  );
  const activeCategoryId = selectedCategoryLines?.[0]?.categoryId ?? '';
  const fixedCategories = categories.filter(
    (categoryLines) => categoryLines[0]?.expenseTypeSnapshot === 'fixed',
  );
  const variableCategories = categories.filter(
    (categoryLines) => categoryLines[0]?.expenseTypeSnapshot === 'variable',
  );
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
              <div className="budget-category-picker">
                <div className="budget-category-picker-copy">
                  <label htmlFor="budget-category-select">Xarajat kategoriyasi</label>
                  <p>Reja kiritish uchun kategoriyani tanlang</p>
                </div>
                <div className="budget-category-select-wrap">
                  <Select
                    id="budget-category-select"
                    aria-label="Budjet kategoriyasi"
                    value={activeCategoryId}
                    onChange={(event) => setSelectedCategoryId(event.target.value)}
                  >
                    {fixedCategories.length ? (
                      <optgroup label="Doimiy xarajatlar">
                        {fixedCategories.map((categoryLines) => {
                          const category = categoryLines[0]!;
                          return (
                            <option key={category.categoryId} value={category.categoryId}>
                              {category.categoryNameSnapshot}
                            </option>
                          );
                        })}
                      </optgroup>
                    ) : null}
                    {variableCategories.length ? (
                      <optgroup label="O‘zgaruvchan xarajatlar">
                        {variableCategories.map((categoryLines) => {
                          const category = categoryLines[0]!;
                          return (
                            <option key={category.categoryId} value={category.categoryId}>
                              {category.categoryNameSnapshot}
                            </option>
                          );
                        })}
                      </optgroup>
                    ) : null}
                  </Select>
                </div>
              </div>
              {selectedCategoryLines ? (
                <div className="budget-category-list">
                  <SelectedBudgetCategory
                    categoryLines={selectedCategoryLines}
                    drafts={drafts}
                    editable={editable}
                    onChangeLine={onChangeLine}
                  />
                </div>
              ) : (
                <p className="budget-entry-empty">Kiritish uchun kategoriya mavjud emas.</p>
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
