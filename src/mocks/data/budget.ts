import type { BudgetHistory, BudgetPlan } from '@/shared/types/domain';
import { branches } from '../fixtures';
import { db, periodRows } from '../state';
import { sumMoney } from '../support/money';

/** Director baseline grid cells, keyed "categoryId:branchId". */
export const baselineCells: Record<string, string> = {};

export function buildBaselineBoard() {
  const live = branches.filter((branch) => branch.isActive);
  const byBranch: Record<string, bigint> = {};
  for (const branch of live) byBranch[branch.id] = 0n;
  let grand = 0n;

  const rows = [...db.categoryRows]
    .sort((a, b) => a.expenseType.localeCompare(b.expenseType) || a.name.localeCompare(b.name))
    .map((category) => {
      const amounts: Record<string, string> = {};
      let rowTotal = 0n;
      for (const branch of live) {
        const amount = baselineCells[`${category.id}:${branch.id}`] ?? '0';
        amounts[branch.id] = amount;
        rowTotal += BigInt(amount);
        byBranch[branch.id] = (byBranch[branch.id] ?? 0n) + BigInt(amount);
      }
      grand += rowTotal;
      return {
        categoryId: category.id,
        code: category.code,
        name: category.name,
        expenseType: category.expenseType,
        isActive: category.isActive,
        amounts,
        totalUzs: rowTotal.toString(),
      };
    });

  return {
    branches: live.map((branch) => ({ branchId: branch.id, code: branch.code, name: branch.name })),
    rows,
    totals: {
      byBranch: Object.fromEntries(
        Object.entries(byBranch).map(([id, total]) => [id, total.toString()]),
      ),
      grandTotalUzs: grand.toString(),
    },
  };
}

export function buildBudgetPlan(periodId: string): BudgetPlan {
  const existing = db.budgetPlanRows.find((row) => row.periodId === periodId);
  const period = periodRows.find((row) => row.id === periodId);
  const lines = db.categoryRows
    .filter((category) => category.isActive)
    .flatMap((category) =>
      branches.map((branch) => {
        const savedLine = existing?.lines.find(
          (line) => line.branchId === branch.id && line.categoryId === category.id,
        );
        const actualAmountUzs = sumMoney(
          db.expenseRows
            .filter(
              (expense) =>
                expense.periodId === periodId &&
                expense.branchId === branch.id &&
                expense.categoryId === category.id,
            )
            .map((expense) => expense.amountUzs),
        );
        const plannedAmountUzs = savedLine?.plannedAmountUzs ?? null;
        const hasPlan = plannedAmountUzs !== null;
        return {
          id: savedLine?.id ?? `bl-${category.code}-${branch.code}`,
          branchId: branch.id,
          branchName: branch.name,
          categoryId: category.id,
          categoryCodeSnapshot: category.code,
          categoryNameSnapshot: category.name,
          expenseTypeSnapshot: category.expenseType,
          plannedAmountUzs,
          actualAmountUzs,
          varianceUzs: hasPlan
            ? (BigInt(plannedAmountUzs) - BigInt(actualAmountUzs)).toString()
            : null,
          hasPlan,
          reason: savedLine?.reason ?? null,
        };
      }),
    );
  return {
    id: existing?.id ?? `budget-${periodId}`,
    periodId,
    periodLabel: period?.label ?? existing?.periodLabel ?? periodId,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    updatedByName: existing?.updatedByName ?? '—',
    lines,
  };
}

export function buildBudgetHistory(year?: number): BudgetHistory {
  const selectedPeriods = periodRows
    .filter((period) => year === undefined || period.year === year)
    .sort((left, right) => left.year - right.year || left.month - right.month);
  return {
    year:
      year ??
      (new Set(selectedPeriods.map((period) => period.year)).size === 1
        ? (selectedPeriods[0]?.year ?? null)
        : null),
    branches: branches.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      isActive: branch.isActive,
    })),
    periods: selectedPeriods.map((period) => {
      const stored = db.budgetPlanRows.find((plan) => plan.periodId === period.id);
      const plan = buildBudgetPlan(period.id);
      const rows = db.categoryRows
        .filter((category) => category.isActive)
        .map((category) => {
          const branchPlans = branches.map((branch) => {
            const line = plan.lines.find(
              (candidate) =>
                candidate.branchId === branch.id && candidate.categoryId === category.id,
            );
            return {
              branchId: branch.id,
              branchName: branch.name,
              plannedAmountUzs: line?.plannedAmountUzs ?? null,
              hasPlan: line?.hasPlan ?? false,
              reason: line?.reason ?? null,
            };
          });
          const planned = branchPlans.filter((item) => item.hasPlan);
          const reasons = branchPlans.filter((item): item is typeof item & { reason: string } =>
            Boolean(item.reason),
          );
          const uniqueReasons = [...new Set(reasons.map((item) => item.reason))];
          return {
            categoryId: category.id,
            categoryCodeSnapshot: category.code,
            categoryNameSnapshot: category.name,
            expenseTypeSnapshot: category.expenseType,
            branches: branchPlans,
            totalPlannedAmountUzs:
              planned.length === 0
                ? null
                : sumMoney(planned.map((item) => item.plannedAmountUzs ?? '0')),
            reason:
              uniqueReasons.length === 0
                ? null
                : uniqueReasons.length === 1
                  ? uniqueReasons[0]!
                  : reasons.map((item) => `${item.branchName}: ${item.reason}`).join(' · '),
          };
        });
      const totalsByBranch = branches.map((branch) => {
        const planned = plan.lines.filter((line) => line.branchId === branch.id && line.hasPlan);
        return {
          branchId: branch.id,
          branchName: branch.name,
          plannedAmountUzs:
            planned.length === 0
              ? null
              : sumMoney(planned.map((line) => line.plannedAmountUzs ?? '0')),
          hasPlan: planned.length > 0,
          reason: null,
        };
      });
      const plannedTotals = totalsByBranch.filter((item) => item.hasPlan);
      return {
        periodId: period.id,
        year: period.year,
        month: period.month,
        periodLabel: plan.periodLabel,
        periodStatus: period.status,
        budgetVersionId: stored?.id ?? null,
        revisionNo: stored ? 1 : null,
        versionStatus: stored ? 'draft' : null,
        versionReason: null,
        updatedAt: stored?.updatedAt ?? null,
        updatedByName: stored?.updatedByName ?? '',
        rows,
        totalsByBranch,
        totalPlannedAmountUzs:
          plannedTotals.length === 0
            ? null
            : sumMoney(plannedTotals.map((item) => item.plannedAmountUzs ?? '0')),
      };
    }),
  };
}
