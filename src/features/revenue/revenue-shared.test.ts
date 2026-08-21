import { describe, expect, it } from 'vitest';
import { gapMoney, percentage, sumMoney } from './revenue-shared';

describe('revenue financial calculations', () => {
  it('sums integer-string UZS without floating point loss', () => {
    expect(sumMoney(['160000000', '140000000'])).toBe('300000000');
  });

  it('calculates the collection percentage from actual and plan', () => {
    expect(percentage('180000000', '300000000')).toBe(60);
    expect(gapMoney('300000000', '180000000')).toBe('120000000');
  });

  it('keeps a zero plan semantically undefined instead of Infinity or 0%', () => {
    expect(percentage('1000000', '0')).toBeNull();
  });

  it('rounds a repeating share half-up to two decimal places', () => {
    expect(percentage('40000000', '150000000')).toBe(26.67);
  });
});
