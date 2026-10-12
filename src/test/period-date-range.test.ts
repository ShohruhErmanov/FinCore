import { describe, expect, it } from 'vitest';
import { accountingPeriodDateRange } from '@/shared/lib/format';

describe('accountingPeriodDateRange', () => {
  it('uses month start through today for the current Tashkent month', () => {
    expect(accountingPeriodDateRange(2026, 10, '2026-10-10')).toEqual({
      from: '2026-10-01',
      to: '2026-10-10',
    });
  });

  it('uses the complete month when another navbar month is selected', () => {
    expect(accountingPeriodDateRange(2026, 8, '2026-10-10')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('handles leap-year February without an off-by-one error', () => {
    expect(accountingPeriodDateRange(2028, 2, '2026-10-10')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});
