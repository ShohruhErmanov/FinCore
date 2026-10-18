import { downloadCsv } from '@/shared/lib/csv';
import type { BudgetLine, BudgetPlan } from '@/shared/types/domain';

export type BudgetLineDraft = Pick<
  BudgetLine,
  'id' | 'branchId' | 'categoryId' | 'hasPlan' | 'plannedAmountUzs' | 'reason'
>;

export const MAX_BUDGET_AMOUNT = 9223372036854775807n;

export function getLinePresentation(
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

export function exportBudgetPlan(plan: BudgetPlan) {
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
