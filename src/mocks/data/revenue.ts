import type { MoneyUzs, RevenuePlanBoard, RevenuePlanYear } from '@/shared/types/domain';
import { branches, ids } from '../fixtures';
import { db, periodRows, revenuePlanMeta, revenuePlanRows } from '../state';
import { daysInMonth, percentageValue, sumMoney } from '../support/money';
import { buildBudgetPlan } from './budget';

export function revenuePlanFor(periodId: string, branchId: string): MoneyUzs | null {
  return revenuePlanRows[periodId]?.[branchId] ?? null;
}

export function monthlyRevenuePlanUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney([...branchIds].map((branchId) => revenuePlanFor(periodId, branchId) ?? '0'));
}

export function monthlyRevenueActualUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    db.revenueRows
      .filter((row) => row.periodId === periodId && branchIds.has(row.branchId))
      .map((row) => row.totalUzs),
  );
}

export function monthlyExpensePlanUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    buildBudgetPlan(periodId)
      .lines.filter((line) => branchIds.has(line.branchId) && line.hasPlan)
      .map((line) => line.plannedAmountUzs ?? '0'),
  );
}

export function monthlyExpenseActualUzs(periodId: string, branchIds: Set<string>): MoneyUzs {
  return sumMoney(
    db.expenseRows
      .filter((row) => row.periodId === periodId && branchIds.has(row.branchId))
      .map((row) => row.amountUzs),
  );
}

export function buildRevenuePlanBoard(periodId: string): RevenuePlanBoard {
  const period = periodRows.find((row) => row.id === periodId);
  const days = period ? daysInMonth(period.year, period.month) : 30;
  const meta = revenuePlanMeta.get(periodId);
  return {
    id: `revenue-plan-${periodId}`,
    periodId,
    periodLabel: period?.label ?? periodId,
    daysInMonth: days,
    updatedAt: meta?.updatedAt ?? '2026-08-01T09:00:00+05:00',
    updatedByName: meta?.updatedByName ?? 'Madina Karimova',
    lines: branches.map((branch) => {
      const plannedAmountUzs = revenuePlanFor(periodId, branch.id);
      const actualAmountUzs = monthlyRevenueActualUzs(periodId, new Set([branch.id]));
      const hasPlan = plannedAmountUzs !== null;
      return {
        id: `rp-${periodId}-${branch.code}`,
        branchId: branch.id,
        branchName: branch.name,
        plannedAmountUzs,
        actualAmountUzs,
        varianceUzs: hasPlan
          ? (BigInt(plannedAmountUzs) - BigInt(actualAmountUzs)).toString()
          : null,
        completionPercent: hasPlan ? percentageValue(actualAmountUzs, plannedAmountUzs) : null,
        hasPlan,
        dailyPlanUzs: hasPlan ? (BigInt(plannedAmountUzs) / BigInt(days)).toString() : null,
      };
    }),
  };
}

/** Mirrors backend/src/revenue-plans/revenue-plan-year.ts on the mock's own rows. */
export function buildRevenuePlanYear(year: number): RevenuePlanYear {
  const short = [
    'Yan',
    'Fev',
    'Mar',
    'Apr',
    'May',
    'Iyn',
    'Iyl',
    'Avg',
    'Sen',
    'Okt',
    'Noy',
    'Dek',
  ];
  const pct = (actual: bigint, planned: bigint | null) =>
    planned === null || planned === 0n
      ? null
      : percentageValue(actual.toString(), planned.toString());
  const totals = new Map(
    branches.map((branch) => [branch.id, { planned: 0n, actual: 0n, against: 0n, months: 0 }]),
  );
  const yearTotals = { planned: 0n, actual: 0n, against: 0n, months: 0 };

  const months = short.map((label, index) => {
    const period = periodRows.find((row) => row.year === year && row.month === index + 1);
    let planned: bigint | null = null;
    let actual = 0n;
    let against = 0n;
    const cells = branches.map((branch) => {
      const plan = period ? revenuePlanFor(period.id, branch.id) : null;
      const fact = period ? BigInt(monthlyRevenueActualUzs(period.id, new Set([branch.id]))) : 0n;
      const branchTotals = totals.get(branch.id)!;
      actual += fact;
      branchTotals.actual += fact;
      if (plan !== null) {
        planned = (planned ?? 0n) + BigInt(plan);
        against += fact;
        branchTotals.planned += BigInt(plan);
        branchTotals.against += fact;
        branchTotals.months += 1;
      }
      return {
        branchId: branch.id,
        plannedAmountUzs: plan,
        actualAmountUzs: fact.toString(),
        completionPercent: pct(fact, plan === null ? null : BigInt(plan)),
      };
    });
    yearTotals.actual += actual;
    if (planned !== null) {
      yearTotals.planned += planned;
      yearTotals.against += against;
      yearTotals.months += 1;
    }
    return {
      month: index + 1,
      label,
      periodId: period?.id ?? null,
      plannedAmountUzs: planned === null ? null : (planned as bigint).toString(),
      actualAmountUzs: actual.toString(),
      actualAgainstPlanUzs: against.toString(),
      completionPercent: pct(against, planned),
      branches: cells,
    };
  });

  return {
    year,
    plannedAmountUzs: yearTotals.planned.toString(),
    actualAmountUzs: yearTotals.actual.toString(),
    actualAgainstPlanUzs: yearTotals.against.toString(),
    completionPercent: pct(yearTotals.against, yearTotals.months ? yearTotals.planned : null),
    plannedMonths: yearTotals.months,
    branches: branches.map((branch) => {
      const branchTotals = totals.get(branch.id)!;
      return {
        branchId: branch.id,
        branchName: branch.name,
        plannedAmountUzs: branchTotals.planned.toString(),
        actualAmountUzs: branchTotals.actual.toString(),
        actualAgainstPlanUzs: branchTotals.against.toString(),
        completionPercent: pct(
          branchTotals.against,
          branchTotals.months ? branchTotals.planned : null,
        ),
        plannedMonths: branchTotals.months,
      };
    }),
    months,
  };
}

/** Tanlangan filial(lar)ning umumiy rejadagi ulushi — tarixiy oylarni masshtablash uchun. */
export function branchSharePercent(branchIds: Set<string>, kind: 'revenue' | 'expense'): bigint {
  const all = new Set(branches.map((branch) => branch.id));
  const totalUzs =
    kind === 'revenue'
      ? monthlyRevenuePlanUzs(ids.periodAug, all)
      : monthlyExpensePlanUzs(ids.periodAug, all);
  const selectedUzs =
    kind === 'revenue'
      ? monthlyRevenuePlanUzs(ids.periodAug, branchIds)
      : monthlyExpensePlanUzs(ids.periodAug, branchIds);
  if (BigInt(totalUzs) === 0n) return 100n;
  return (BigInt(selectedUzs) * 100n) / BigInt(totalUzs);
}
