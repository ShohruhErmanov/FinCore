import { describe, expect, it } from 'vitest';
import {
  buildMonthlyReportMessage,
  buildReminderMessage,
  findMissingRevenueBranches,
  telegramMoney,
  telegramPercent,
} from '@/features/notifications/telegram';
import type { DailyRevenue } from '@/shared/types/domain';

const branches = [
  { id: 'b1', name: 'Sayxun', isActive: true },
  { id: 'b2', name: "Xalqlar do'stligi", isActive: true },
  { id: 'b3', name: 'Yopilgan filial', isActive: false },
];

function revenue(branchId: string, businessDate: string, totalUzs: string): DailyRevenue {
  return {
    id: `r-${branchId}-${businessDate}`,
    businessDate,
    periodId: 'p1',
    branchId,
    branchName: branchId,
    cashUzs: totalUzs,
    cardUzs: '0',
    transferUzs: '0',
    totalUzs,
    comment: null,
    enteredBy: 'u1',
    enteredByName: 'Kassir',
    createdAt: '2026-08-20T19:30:00+05:00',
    updatedAt: '2026-08-20T19:30:00+05:00',
  };
}

describe('[FE-TG-01] summa va foiz formati', () => {
  it('summani bo‘shliq bilan ajratadi', () => {
    expect(telegramMoney('300000000')).toBe("300 000 000 so'm");
    expect(telegramMoney('-114800000')).toBe("−114 800 000 so'm");
    expect(telegramMoney(null)).toBe('—');
  });

  it('foizni bir xona aniqlikda beradi', () => {
    expect(telegramPercent(61.73)).toBe('61.7%');
    expect(telegramPercent(null)).toBe('—');
  });
});

describe('[FE-TG-02] kiritilmagan kunni aniqlash', () => {
  it('faqat faol filiallarni tekshiradi', () => {
    const result = findMissingRevenueBranches(branches, [], '2026-08-22');
    expect(result.map((item) => item.branchName)).toEqual(['Sayxun', "Xalqlar do'stligi"]);
  });

  it('kiritilgan filialni summasi bilan, kiritilmaganini null bilan qaytaradi', () => {
    const result = findMissingRevenueBranches(
      branches,
      [revenue('b1', '2026-08-22', '4500000')],
      '2026-08-22',
    );
    expect(result[0]?.totalUzs).toBe('4500000');
    expect(result[1]?.totalUzs).toBeNull();
  });

  it('0 so‘mlik yozuvni «kiritilgan» deb hisoblaydi', () => {
    const result = findMissingRevenueBranches(
      branches,
      [revenue('b1', '2026-08-22', '0')],
      '2026-08-22',
    );
    expect(result[0]?.totalUzs).toBe('0');
  });

  it('boshqa kundagi yozuvni hisobga olmaydi', () => {
    const result = findMissingRevenueBranches(
      branches,
      [revenue('b1', '2026-08-21', '4500000')],
      '2026-08-22',
    );
    expect(result[0]?.totalUzs).toBeNull();
  });
});

describe('[FE-TG-03] xabar matnlari', () => {
  it('kassir eslatmasida filial va sana bo‘ladi', () => {
    const message = buildReminderMessage({
      branchName: "Xalqlar do'stligi",
      businessDate: '2026-08-22',
      cashierName: 'Dilnoza Qodirova',
    });
    expect(message).toContain('Kunlik tushum kiritilmagan');
    expect(message).toContain('Kassir: Dilnoza Qodirova');
    expect(message).toContain("Filial: Xalqlar do'stligi");
    expect(message).toContain('Sana: 22.08.2026');
  });

  it('kassir nomi yo‘q bo‘lsa, bo‘sh qator qoldirmaydi', () => {
    const message = buildReminderMessage({ branchName: 'Sayxun', businessDate: '2026-08-22' });
    expect(message).not.toContain('Kassir:');
    expect(message).not.toMatch(/\n\n\n/);
  });

  it('oylik hisobotda reja, fakt, doimiy ulushi va sof natija bo‘ladi', () => {
    const message = buildMonthlyReportMessage({
      periodLabel: 'Avgust 2026',
      revenuePlanUzs: '300000000',
      revenueActualUzs: '185100000',
      revenueCompletionPct: 61.7,
      expensePlanUzs: '126050000',
      expenseActualUzs: '111600000',
      expenseCompletionPct: 88.5,
      fixedExpenseUzs: '74000000',
      variableExpenseUzs: '37600000',
      branches: [
        {
          name: 'Sayxun',
          revenueActualUzs: '99090000',
          revenueCompletionPct: 61.9,
          expenseActualUzs: '65700000',
          expenseCompletionPct: 88.5,
        },
      ],
    });

    expect(message).toContain('Avgust 2026 — oylik yakun');
    expect(message).toContain("Amalda:  185 100 000 so'm");
    expect(message).toContain('Bajarilish: 61.7%');
    expect(message).toContain("Doimiy: 74 000 000 so'm (66.3%)");
    // Sof natija = tushum − xarajat
    expect(message).toContain("NATIJA: 73 500 000 so'm");
    expect(message).toContain('• Sayxun');
  });

  it('xarajat 0 bo‘lsa doimiy ulushini «—» qiladi, nolga bo‘lmaydi', () => {
    const message = buildMonthlyReportMessage({
      periodLabel: 'Yanvar 2026',
      revenuePlanUzs: '0',
      revenueActualUzs: '0',
      revenueCompletionPct: null,
      expensePlanUzs: '0',
      expenseActualUzs: '0',
      expenseCompletionPct: null,
      fixedExpenseUzs: '0',
      variableExpenseUzs: '0',
      branches: [],
    });
    expect(message).toContain("Doimiy: 0 so'm (—)");
    expect(message).not.toContain('NaN');
    expect(message).not.toContain('Infinity');
  });
});
