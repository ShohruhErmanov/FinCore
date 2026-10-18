import { formatMoney, formatPercent } from '@/shared/lib/format';

export function axisMoney(value: number): string {
  return formatMoney(String(value));
}

export function expensePlanComparison(
  planUzs: string,
  varianceUzs: string,
  completionPct: number | null,
): string {
  const variance = BigInt(varianceUzs);
  const difference = formatMoney((variance < 0n ? -variance : variance).toString());
  const differenceLabel = variance >= 0n ? 'Rejagacha yetmagan' : 'Rejadan oshgan';
  return `Reja ${formatMoney(planUzs)} · ${differenceLabel} ${difference} · Bajarilish ${formatPercent(completionPct)}`;
}

export function percentOf(actualUzs: string, planUzs: string): number | null {
  const plan = BigInt(planUzs);
  if (plan === 0n) return null;
  return Number((BigInt(actualUzs) * 10_000n) / plan) / 100;
}
