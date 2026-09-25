import { describe, expect, it } from 'vitest';
import { settle, settleTotal, toOwnershipPercent } from './investor-math';

const MLN = (n: number) => BigInt(n) * 1_000_000n;

describe('settle', () => {
  it('splits the worked example: 10 mln entitled, 8 mln paid', () => {
    const result = settle(MLN(10), MLN(8));
    expect(result.entitledAmountUzs).toBe('10000000');
    expect(result.paidAmountUzs).toBe('8000000');
    expect(result.remainingAmountUzs).toBe('2000000');
    expect(result.overpaidAmountUzs).toBe('0');
    expect(result.paidPercent).toBe(80);
    expect(result.remainingPercent).toBe(20);
    expect(result.status).toBe('partially_paid');
  });

  it('keeps paid + remaining equal to entitled', () => {
    for (const [entitled, paid] of [
      [MLN(10), MLN(8)],
      [MLN(7), MLN(0)],
      [MLN(3), MLN(3)],
      [123_456_789n, 45_678n],
    ] as const) {
      const result = settle(entitled, paid);
      expect(BigInt(result.paidAmountUzs) + BigInt(result.remainingAmountUzs)).toBe(entitled);
    }
  });

  it('keeps the two percentages summing to 100 whenever something is owed', () => {
    for (const [entitled, paid] of [
      [MLN(10), MLN(8)],
      [MLN(4), MLN(1)],
      [MLN(9), MLN(9)],
      [MLN(5), 0n],
    ] as const) {
      const result = settle(entitled, paid);
      expect(result.paidPercent + result.remainingPercent).toBeCloseTo(100, 6);
    }
  });

  it('reports nothing paid as 0% / 100%', () => {
    const result = settle(MLN(10), 0n);
    expect(result.paidPercent).toBe(0);
    expect(result.remainingPercent).toBe(100);
    expect(result.remainingAmountUzs).toBe('10000000');
    expect(result.status).toBe('unpaid');
  });

  it('reports a fully settled period as 100% / 0%', () => {
    const result = settle(MLN(10), MLN(10));
    expect(result.paidPercent).toBe(100);
    expect(result.remainingPercent).toBe(0);
    expect(result.remainingAmountUzs).toBe('0');
    expect(result.status).toBe('settled');
  });

  it('surfaces an overpayment instead of showing negative remaining', () => {
    const result = settle(MLN(10), MLN(12));
    expect(result.remainingAmountUzs).toBe('0');
    expect(result.overpaidAmountUzs).toBe('2000000');
    expect(result.paidPercent).toBe(120);
    expect(result.remainingPercent).toBe(0);
    expect(result.status).toBe('overpaid');
    // A progress bar cannot render past full, so the capped figure is separate.
    expect(result.settledPercent).toBe(100);
  });

  it('returns zeros — not NaN or Infinity — when nothing is owed', () => {
    const result = settle(0n, 0n);
    expect(result.paidPercent).toBe(0);
    expect(result.remainingPercent).toBe(0);
    expect(result.settledPercent).toBe(0);
    expect(result.status).toBe('no_entitlement');
    expect(Number.isFinite(result.paidPercent)).toBe(true);
    expect(Number.isFinite(result.remainingPercent)).toBe(true);
  });

  it('treats money paid against no entitlement as an overpayment, not a settlement', () => {
    const result = settle(0n, MLN(1));
    expect(result.status).toBe('overpaid');
    expect(result.overpaidAmountUzs).toBe('1000000');
    expect(result.paidPercent).toBe(0);
  });

  it('survives amounts beyond Number.MAX_SAFE_INTEGER', () => {
    const entitled = 9_007_199_254_740_993n * 2n;
    const result = settle(entitled, entitled / 2n);
    expect(result.entitledAmountUzs).toBe(entitled.toString());
    expect(result.paidPercent).toBe(50);
  });
});

describe('settleTotal', () => {
  it('sums the months rather than trusting a stored yearly figure', () => {
    const months = [
      { entitled: MLN(10), paid: MLN(8) },
      { entitled: MLN(5), paid: MLN(5) },
      { entitled: MLN(0), paid: MLN(0) },
    ];
    const year = settleTotal(months);
    expect(year.entitledAmountUzs).toBe('15000000');
    expect(year.paidAmountUzs).toBe('13000000');
    expect(year.remainingAmountUzs).toBe('2000000');
    expect(year.paidPercent).toBeCloseTo(86.67, 2);
    expect(year.remainingPercent).toBeCloseTo(13.33, 2);
  });

  it('matches the worked yearly example: 100 mln entitled, 80 mln paid', () => {
    const months = Array.from({ length: 10 }, () => ({ entitled: MLN(10), paid: MLN(8) }));
    const year = settleTotal(months);
    expect(year.entitledAmountUzs).toBe('100000000');
    expect(year.paidAmountUzs).toBe('80000000');
    expect(year.remainingAmountUzs).toBe('20000000');
    expect(year.paidPercent).toBe(80);
    expect(year.remainingPercent).toBe(20);
  });

  it('equals the sum of each month computed on its own', () => {
    const months = [
      { entitled: MLN(10), paid: MLN(8) },
      { entitled: MLN(5), paid: MLN(5) },
      { entitled: MLN(7), paid: MLN(1) },
    ];
    const perMonth = months.map((m) => settle(m.entitled, m.paid));
    const summedPaid = perMonth.reduce((acc, m) => acc + BigInt(m.paidAmountUzs), 0n);
    const summedEntitled = perMonth.reduce((acc, m) => acc + BigInt(m.entitledAmountUzs), 0n);
    const year = settleTotal(months);
    expect(BigInt(year.paidAmountUzs)).toBe(summedPaid);
    expect(BigInt(year.entitledAmountUzs)).toBe(summedEntitled);
  });

  it('handles an empty year without dividing by zero', () => {
    const year = settleTotal([]);
    expect(year.entitledAmountUzs).toBe('0');
    expect(year.paidPercent).toBe(0);
    expect(year.status).toBe('no_entitlement');
  });

  it('nets an overpaid month against an underpaid one at the yearly level', () => {
    const year = settleTotal([
      { entitled: MLN(10), paid: MLN(12) },
      { entitled: MLN(10), paid: MLN(8) },
    ]);
    expect(year.entitledAmountUzs).toBe('20000000');
    expect(year.paidAmountUzs).toBe('20000000');
    expect(year.remainingAmountUzs).toBe('0');
    expect(year.overpaidAmountUzs).toBe('0');
    expect(year.status).toBe('settled');
  });
});

describe('toOwnershipPercent', () => {
  it('reads the NUMERIC(5,2) Prisma returns without losing the decimals', () => {
    expect(toOwnershipPercent({ toString: () => '2.00' })).toBe(2);
    expect(toOwnershipPercent({ toString: () => '12.50' })).toBe(12.5);
    expect(toOwnershipPercent('0.00')).toBe(0);
    expect(toOwnershipPercent(100)).toBe(100);
  });

  it('never propagates NaN into a rendered percentage', () => {
    expect(toOwnershipPercent(undefined)).toBe(0);
    expect(toOwnershipPercent('abc')).toBe(0);
  });

  it('stays distinct from the paid percentage', () => {
    // 2% of the company, 80% of what is owed already paid — two numbers that
    // must never be conflated.
    const ownership = toOwnershipPercent({ toString: () => '2.00' });
    const settlement = settle(MLN(10), MLN(8));
    expect(ownership).toBe(2);
    expect(settlement.paidPercent).toBe(80);
    expect(ownership).not.toBe(settlement.paidPercent);
  });
});
