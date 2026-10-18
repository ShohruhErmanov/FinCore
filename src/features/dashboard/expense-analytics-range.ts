import { tashkentBusinessDate } from '@/shared/lib/format';

export type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'previousMonth' | 'custom';

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: isoDate(year, month, 1), to: isoDate(year, month, lastDay) };
}

export function presetRange(
  preset: DatePreset,
  period: { year: number; month: number } | undefined,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = tashkentBusinessDate();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = shiftDate(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'week') return { from: shiftDate(today, -6), to: today };
  if (preset === 'previousMonth') {
    const [year, month] = today.split('-').map(Number);
    return month === 1 ? monthRange((year ?? 0) - 1, 12) : monthRange(year ?? 0, (month ?? 1) - 1);
  }
  if (preset === 'custom') return { from: customFrom, to: customTo };
  return period ? monthRange(period.year, period.month) : { from: '', to: '' };
}
