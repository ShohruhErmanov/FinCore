import { describe, expect, it } from 'vitest';
import {
  cashierSummaries,
  dashboard,
  dqExceptions,
  ids,
  reconciliations,
  revenueTransactions,
} from '@/mocks/fixtures';

const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);

describe('[AC-15, AC-16, AC-17] tushum KPI fixture yaxlitligi', () => {
  it('markaz reja 300m, actual 180m, gap 120m va yig‘ilish 60% bo‘ladi', () => {
    expect(dashboard.revenuePlanUzs).toBe('300000000');
    expect(dashboard.revenueActualUzs).toBe('180000000');
    expect(dashboard.revenueGapUzs).toBe('120000000');
    expect(dashboard.collectionPct).toBe(60);
    expect(dashboard.netResultUzs).toBe('70000000');
    expect(dashboard.revenueActualUzs).not.toBe(dashboard.netResultUzs);
  });

  it('Sayxun plan 160m, actual 150m va yig‘ilish 93.75% bo‘ladi', () => {
    const sayxun = dashboard.branches.find((branch) => branch.branchId === ids.sayxun);
    expect(sayxun).toMatchObject({
      planUzs: '160000000',
      actualUzs: '150000000',
      collectionPct: 93.75,
    });
  });

  it('posted tranzaksiyalar markaz actual summasiga reconcile bo‘ladi', () => {
    const posted = revenueTransactions.filter((item) => item.status === 'posted');
    expect(sum(posted.map((item) => item.amountUzs))).toBe(180_000_000n);
  });
});

describe('[AC-18, FE-HIST-01] kassir tarixiy fixturelari', () => {
  it('kassirlar kesimida 70m, 80m va 30m summalarni saqlaydi', () => {
    expect(cashierSummaries.map((row) => row.totalUzs)).toEqual([
      '70000000',
      '80000000',
      '30000000',
    ]);
    expect(sum(cashierSummaries.map((row) => row.totalUzs))).toBe(180_000_000n);
  });

  it('nofaol kassirning 80m tarixiy tushumi reportdan yo‘qolmaydi', () => {
    const historical = cashierSummaries.find((row) => !row.isActive);
    expect(historical).toMatchObject({
      collectorName: 'Komil Normurodov',
      totalUzs: '80000000',
      isActive: false,
    });
  });
});

describe('[AC-10, AC-22] data-quality fixture yaxlitligi', () => {
  it('legacy 6 318 400 so‘m va 43 satr tafovutini ochiq saqlaydi', () => {
    const mismatch = reconciliations.find((item) => item.status === 'mismatch');
    expect(mismatch).toMatchObject({
      sourceSumUzs: '52433400',
      targetSumUzs: '46115000',
      diffSumUzs: '6318400',
      diffCount: 43,
    });
  });

  it('text-date satri normal ledgerga jim qo‘shilmay, exceptionda qoladi', () => {
    expect(dqExceptions).toContainEqual(
      expect.objectContaining({
        issueType: 'invalid_date',
        transactionDate: '15.08.2026',
        status: 'open',
      }),
    );
  });
});
