import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monthRange, presetRange } from '@/features/dashboard/expense-analytics-range';

describe('xarajat analitikasi sana oralig‘i', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 1-mart, Toshkent vaqti bilan ertalab: oy va yil chegaralarini sinash uchun qulay kun.
    vi.setSystemTime(new Date('2026-03-01T05:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('oyning birinchi va oxirgi kunini beradi, kabisa yili ham hisobga olinadi', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('bugun, kecha va so‘nggi 7 kun oy chegarasidan o‘tadi', () => {
    expect(presetRange('today', undefined, '', '')).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
    expect(presetRange('yesterday', undefined, '', '')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(presetRange('week', undefined, '', '')).toEqual({
      from: '2026-02-23',
      to: '2026-03-01',
    });
  });

  it('o‘tgan oy yanvarda o‘tgan yilning dekabriga tushadi', () => {
    expect(presetRange('previousMonth', undefined, '', '')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    vi.setSystemTime(new Date('2026-01-10T05:00:00Z'));
    expect(presetRange('previousMonth', undefined, '', '')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('oy tanlangan hisob davridan, qo‘lda oraliq esa kiritilganidan olinadi', () => {
    expect(presetRange('month', { year: 2026, month: 8 }, '', '')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(presetRange('month', undefined, '', '')).toEqual({ from: '', to: '' });
    expect(presetRange('custom', undefined, '2026-08-03', '2026-08-09')).toEqual({
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });
});
