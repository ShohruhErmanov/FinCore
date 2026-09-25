import { describe, expect, it } from 'vitest';
import {
  annualShare,
  availability,
  formatDecimalUzs,
  fromWholeUzs,
  parseDecimalUzs,
  shareOf,
  totalHundredths,
} from './payout-math';

describe('parseDecimalUzs / formatDecimalUzs', () => {
  it('round-trips what PostgreSQL returns for NUMERIC(20,2)', () => {
    expect(formatDecimalUzs(parseDecimalUzs('6056829.42'))).toBe('6056829.42');
    expect(formatDecimalUzs(parseDecimalUzs('0.00'))).toBe('0.00');
    expect(formatDecimalUzs(parseDecimalUzs('0.05'))).toBe('0.05');
  });

  it('accepts the looser shapes a client or a driver may send', () => {
    expect(formatDecimalUzs(parseDecimalUzs('6056829'))).toBe('6056829.00');
    expect(formatDecimalUzs(parseDecimalUzs('6056829.4'))).toBe('6056829.40');
    expect(formatDecimalUzs(parseDecimalUzs('  12.34  '))).toBe('12.34');
  });

  it('keeps negatives, which a reversal can genuinely produce', () => {
    expect(formatDecimalUzs(parseDecimalUzs('-12.34'))).toBe('-12.34');
    expect(parseDecimalUzs('-0.01')).toBe(-1n);
  });

  it('truncates beyond two decimals rather than rounding into money', () => {
    expect(formatDecimalUzs(parseDecimalUzs('1.999'))).toBe('1.99');
  });

  it('refuses anything that is not a decimal number', () => {
    for (const bad of ['', 'abc', '1,5', '1.2.3', '1e5', 'NaN']) {
      expect(() => parseDecimalUzs(bad)).toThrow();
    }
  });

  it('stays exact far beyond what a JS number can hold', () => {
    // 2^53 so'm and one tiyin — a float loses the tiyin here.
    const huge = '9007199254740993.01';
    expect(formatDecimalUzs(parseDecimalUzs(huge))).toBe(huge);
  });
});

describe('shareOf', () => {
  it('reproduces the worked example exactly', () => {
    // The verification target: August 2026 actual revenue at a 2% stake.
    expect(formatDecimalUzs(shareOf(302_841_471n, '2.00'))).toBe('6056829.42');
  });

  it('agrees with PostgreSQL round() — half-up, away from zero', () => {
    // 1 so'm at 0.05% is 0.0005, which rounds to 0.00.
    expect(formatDecimalUzs(shareOf(1n, '0.05'))).toBe('0.00');
    // 11 so'm at 4.55% is 0.5005 -> 0.50.
    expect(formatDecimalUzs(shareOf(11n, '4.55'))).toBe('0.50');
    // 5 so'm at 5.00% is exactly 0.25.
    expect(formatDecimalUzs(shareOf(5n, '5.00'))).toBe('0.25');
    // 1 so'm at 50.00% is exactly 0.5 -> half-up gives 0.50, no rounding needed.
    expect(formatDecimalUzs(shareOf(1n, '50.00'))).toBe('0.50');
    // 3 so'm at 50.00% is 1.5 -> 1.50.
    expect(formatDecimalUzs(shareOf(3n, '50.00'))).toBe('1.50');
  });

  it('rounds the half up rather than to even', () => {
    // 1 so'm at 0.5% = 0.005 -> half-up is 0.01, banker's rounding would say 0.00.
    expect(formatDecimalUzs(shareOf(1n, '0.50'))).toBe('0.01');
    // 3 so'm at 0.5% = 0.015 -> 0.02, not 0.02-vs-0.01 ambiguity.
    expect(formatDecimalUzs(shareOf(3n, '0.50'))).toBe('0.02');
  });

  it('is zero at either end of the range', () => {
    expect(formatDecimalUzs(shareOf(0n, '2.00'))).toBe('0.00');
    expect(formatDecimalUzs(shareOf(302_841_471n, '0.00'))).toBe('0.00');
  });

  it('returns the whole revenue at a 100% stake', () => {
    expect(formatDecimalUzs(shareOf(302_841_471n, '100.00'))).toBe('302841471.00');
  });

  it('never loses precision on a large revenue', () => {
    // A float would already be wrong here; bigint is not.
    expect(formatDecimalUzs(shareOf(999_999_999_999n, '33.33'))).toBe('333299999999.67');
  });
});

describe('annualShare', () => {
  const million = (n: number) => BigInt(n) * 1_000_000n;

  it('sums the months, then applies the percentage once', () => {
    // 100m + 200m + 300m = 600m; 600m at 2% is 12m.
    const months = [million(100), million(200), million(300)];
    expect(formatDecimalUzs(annualShare(months, '2.00'))).toBe('12000000.00');
  });

  it('produces the worked example from a single month', () => {
    expect(formatDecimalUzs(annualShare([302_841_471n], '2.00'))).toBe('6056829.42');
  });

  it('is zero at a zero stake', () => {
    expect(formatDecimalUzs(annualShare([million(600)], '0.00'))).toBe('0.00');
  });

  it('is the whole revenue at a 100% stake', () => {
    expect(formatDecimalUzs(annualShare([million(600)], '100.00'))).toBe('600000000.00');
  });

  it('is zero for a year with no revenue at all', () => {
    expect(formatDecimalUzs(annualShare([], '2.00'))).toBe('0.00');
    expect(formatDecimalUzs(annualShare(Array(12).fill(0n), '2.00'))).toBe('0.00');
  });

  it('does not require twelve months — a partial year is just fewer numbers', () => {
    // January to August only; the missing four contribute nothing.
    const partial = Array.from({ length: 8 }, () => million(50));
    const padded = [...partial, 0n, 0n, 0n, 0n];
    expect(annualShare(partial, '2.00')).toBe(annualShare(padded, '2.00'));
    expect(formatDecimalUzs(annualShare(partial, '2.00'))).toBe('8000000.00');
  });

  it('treats a missing month exactly as a zero month', () => {
    const withGap = [million(100), 0n, million(300)];
    const withoutGap = [million(100), million(300)];
    expect(annualShare(withGap, '2.00')).toBe(annualShare(withoutGap, '2.00'));
  });

  it('rounds once for the year, not twelve times', () => {
    // Each month alone is 0.005 -> 0.01, so twelve rounded months add to 0.12.
    // The year is 12 so'm at 0.5% = 0.06, and that is the canonical figure.
    const months = Array.from({ length: 12 }, () => 1n);
    const summedMonths = totalHundredths(months.map((fact) => shareOf(fact, '0.50')));
    expect(formatDecimalUzs(summedMonths)).toBe('0.12');
    expect(formatDecimalUzs(annualShare(months, '0.50'))).toBe('0.06');
  });

  it('keeps a billion-so‘m year exact', () => {
    // A JS number loses so'm at this magnitude; bigint does not.
    const months = Array.from({ length: 12 }, () => 999_999_999_999n);
    expect(formatDecimalUzs(annualShare(months, '2.00'))).toBe('239999999999.76');
  });

  it('matches shareOf applied to the yearly total', () => {
    const months = [million(100), million(250), million(333)];
    const total = months.reduce((sum, value) => sum + value, 0n);
    // The list path aggregates in SQL and calls shareOf; the summary path has
    // the months and calls annualShare. They must never disagree.
    expect(annualShare(months, '2.00')).toBe(shareOf(total, '2.00'));
  });
});

describe('availability', () => {
  const share = parseDecimalUzs('6056829.42');

  it('offers the floor of the share, never the rounded-up so‘m', () => {
    const result = availability(share, 0n, 0n);
    expect(result.shareUzs).toBe('6056829.42');
    expect(result.remainingUzs).toBe('6056829.42');
    // The 42 tiyin can never be handed over, so they are reported separately.
    expect(result.residualUzs).toBe('0.42');
    // 6 056 829.42 is payable as 6 056 829 whole so'm — asking for 6 056 830
    // would exceed the share, which is exactly what the guards reject.
    expect(result.payableUzs).toBe('6056829');
    expect(result.isSettled).toBe(false);
  });

  it('subtracts what was paid and what is already asked for', () => {
    const result = availability(share, fromWholeUzs(4_000_000n), fromWholeUzs(1_000_000n));
    expect(result.paidUzs).toBe('4000000.00');
    expect(result.openUzs).toBe('1000000.00');
    expect(result.remainingUzs).toBe('1056829.42');
    expect(result.payableUzs).toBe('1056829');
  });

  it('leaves the sub-so‘m remainder visible instead of writing it off', () => {
    const result = availability(share, fromWholeUzs(6_056_829n), 0n);
    // The 42 tiyin are still owed in principle and still shown...
    expect(result.remainingUzs).toBe('0.42');
    // ...but nothing further can actually be paid, so the period is settled.
    expect(result.payableUzs).toBe('0');
    expect(result.isSettled).toBe(true);
  });

  it('surfaces an overpayment rather than clamping it to zero', () => {
    // Revenue reversed after the money went out: the share shrank below what
    // was paid. Hiding that would make the books look balanced when they are not.
    const result = availability(parseDecimalUzs('1000.00'), fromWholeUzs(1_500n), 0n);
    expect(result.remainingUzs).toBe('-500.00');
    expect(result.payableUzs).toBe('0');
    expect(result.isSettled).toBe(true);
  });

  it('treats a zero share as settled with nothing payable', () => {
    const result = availability(0n, 0n, 0n);
    expect(result.remainingUzs).toBe('0.00');
    expect(result.payableUzs).toBe('0');
    expect(result.isSettled).toBe(true);
  });

  it('counts an open request as unavailable even before it is paid', () => {
    // Otherwise an investor could request the same month twice and, between the
    // two approvals, be owed more than the share.
    const result = availability(share, 0n, fromWholeUzs(6_056_829n));
    expect(result.payableUzs).toBe('0');
  });
});

describe('residual', () => {
  it('is what is left once every payable so‘m is taken out', () => {
    expect(availability(parseDecimalUzs('20000000.75'), 0n, 0n)).toMatchObject({
      payableUzs: '20000000',
      residualUzs: '0.75',
    });
  });

  it('is zero when the share is a whole number of so‘m', () => {
    expect(availability(parseDecimalUzs('12000000.00'), 0n, 0n).residualUzs).toBe('0.00');
  });

  it('is zero once nothing is left to pay', () => {
    expect(availability(parseDecimalUzs('100.00'), fromWholeUzs(100n), 0n).residualUzs).toBe('0.00');
  });

  it('reports zero for an overpayment rather than a negative residual', () => {
    expect(availability(parseDecimalUzs('100.00'), fromWholeUzs(150n), 0n)).toMatchObject({
      remainingUzs: '-50.00',
      residualUzs: '0.00',
    });
  });
});

describe('totalHundredths', () => {
  it('sums months exactly, with no intermediate rounding', () => {
    const months = ['6056829.42', '220000.00', '0.00'].map(parseDecimalUzs);
    expect(formatDecimalUzs(totalHundredths(months))).toBe('6276829.42');
  });

  it('is zero for an empty year', () => {
    expect(formatDecimalUzs(totalHundredths([]))).toBe('0.00');
  });

  it('adds twelve .42 remainders without drift', () => {
    const twelve = Array.from({ length: 12 }, () => parseDecimalUzs('0.42'));
    // 12 x 0.42 = 5.04 exactly. Floats give 5.039999999999999 here.
    expect(formatDecimalUzs(totalHundredths(twelve))).toBe('5.04');
  });
});
