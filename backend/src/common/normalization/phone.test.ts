import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['+998901234567', '+998901234567'],
  ])('%s qiymatini %s ko‘rinishiga keltiradi', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
