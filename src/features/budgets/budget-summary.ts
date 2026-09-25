import type { BudgetLine } from '@/shared/types/domain';

/** Display aggregation of saved API rows; integer money and existing reja − fakt rule. */
export function summarizeBudget(lines: BudgetLine[]) {
  const planned = lines.filter((line) => line.hasPlan && line.plannedAmountUzs !== null);
  const budget = planned.reduce((sum, line) => sum + BigInt(line.plannedAmountUzs!), 0n);
  const actual = lines.reduce((sum, line) => sum + BigInt(line.actualAmountUzs), 0n);
  const unplanned = lines.filter((line) => !line.hasPlan && BigInt(line.actualAmountUzs) > 0n);
  const exceeded = planned.filter(
    (line) => BigInt(line.actualAmountUzs) > BigInt(line.plannedAmountUzs!),
  );
  return {
    budget: planned.length ? budget : null,
    actual,
    remaining: planned.length ? budget - actual : null,
    percent: budget > 0n ? Number((actual * 10_000n) / budget) / 100 : null,
    unplanned,
    exceeded,
  };
}
