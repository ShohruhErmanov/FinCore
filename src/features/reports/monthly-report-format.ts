import type { MonthlyReport, PlanActual } from '@/shared/types/domain';
import type { MonthlyExecutiveSummary } from './monthly-report';

export const surface = 'neu-raised rounded-[1.5rem]';

export function varianceLabel(data: PlanActual): string {
  if (!data.hasPlan || data.plannedAmountUzs === null)
    return BigInt(data.actualAmountUzs) > 0n ? 'Rejasiz xarajat' : 'Reja mavjud emas';
  const difference = BigInt(data.varianceUzs ?? '0');
  if (difference > 0n) return 'Rejadan kam sarflangan';
  if (difference < 0n) return 'Rejadan oshgan';
  return 'Reja bilan bir xil';
}

export type MonthlyFinancial = NonNullable<MonthlyReport['financialMonths']>[number];

export function financialBarWidth(value: bigint, max: bigint) {
  if (max === 0n || value === 0n) return 0;
  const absolute = value < 0n ? -value : value;
  return Math.max(2, Number((absolute * 10_000n) / max) / 100);
}

export type Category = MonthlyExecutiveSummary['categories'][number];
