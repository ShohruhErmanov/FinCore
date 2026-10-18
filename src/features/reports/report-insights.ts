import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { PlanActual } from '@/shared/types/domain';

export function reportStatusMeta(status: PlanActual['status']) {
  const values: Record<PlanActual['status'], { label: string; className: string }> = {
    no_plan: { label: 'Reja mavjud emas', className: 'bg-slate-100 text-slate-700' },
    unplanned: { label: 'Rejadan tashqari / Unplanned', className: 'bg-amber-50 text-amber-800' },
    under_plan: { label: 'Tejash', className: 'bg-green-50 text-green-800' },
    on_plan: { label: 'Reja bilan teng', className: 'bg-sky-50 text-sky-800' },
    over_plan: { label: 'Reja oshgan', className: 'bg-red-50 text-red-800' },
  };
  return values[status];
}

type InsightTone = 'danger' | 'warning' | 'success' | 'neutral';

export interface ReportInsight {
  key: string;
  text: string;
  detail: string;
  tone: InsightTone;
  priority: number;
}

export const insightToneClass: Record<InsightTone, string> = {
  danger: 'border-red-200 bg-red-50/70',
  warning: 'border-amber-200 bg-amber-50/70',
  success: 'border-green-200 bg-green-50/70',
  neutral: 'border-border/70 bg-canvas',
};

export function planActualInsight(
  key: string,
  subject: string,
  data: PlanActual,
): ReportInsight | null {
  const actual = BigInt(data.actualAmountUzs);
  const planned = data.plannedAmountUzs === null ? null : BigInt(data.plannedAmountUzs);
  if (actual === 0n && planned === null) return null;
  const detail = `Reja ${formatMoney(data.plannedAmountUzs)} · fakt ${formatMoney(data.actualAmountUzs)}`;
  if (planned === null || planned === 0n) {
    if (actual === 0n) return null;
    return {
      key,
      text: `${subject} rejasiz ${formatMoney(data.actualAmountUzs)} sarflangan.`,
      detail,
      tone: 'warning',
      priority: 10_000,
    };
  }
  const completion = data.completionPercent ?? 0;
  if (actual > planned)
    return {
      key,
      text: `${subject} rejadan ${formatPercent(completion, 0)} oshgan.`,
      detail,
      tone: 'danger',
      priority: completion,
    };
  if (actual < planned)
    return {
      key,
      text: `${subject} rejaning ${formatPercent(completion, 0)}ini tashkil qilgan.`,
      detail,
      tone: 'success',
      priority: 100 - completion,
    };
  return {
    key,
    text: `${subject} reja bilan aynan teng bajarilgan.`,
    detail,
    tone: 'neutral',
    priority: 0,
  };
}
