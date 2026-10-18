import { describe, expect, it } from 'vitest';
import { daysInMonth, monthNameUz, monthShortNameUz, periodLabelUz } from './calendar';

describe('calendar labels', () => {
  it('names a month in Uzbek, long and short', () => {
    expect(monthNameUz(1)).toBe('Yanvar');
    expect(monthNameUz(8)).toBe('Avgust');
    expect(monthShortNameUz(8)).toBe('Avg');
    expect(monthShortNameUz(12)).toBe('Dek');
  });

  it('falls back to the bare number for a month out of range', () => {
    expect(monthNameUz(13)).toBe('13');
    expect(monthShortNameUz(0)).toBe('0');
  });

  it('labels an accounting period as "<month> <year>"', () => {
    expect(periodLabelUz(2026, 8)).toBe('Avgust 2026');
  });

  it('counts the days of a month, leap years included', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
  });
});
