import { describe, expect, it } from 'vitest';
import {
  asMoneyUzs,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatMoney,
  formatPercent,
  signedTone,
  toChartNumber,
} from '@/shared/lib/format';

const normalizeSpaces = (value: string) => value.replaceAll('\u00a0', ' ');

describe('[FE-MONEY-01] UZS formatterlari', () => {
  it('katta butun qiymatni precision yo‘qotmasdan formatlaydi', () => {
    expect(normalizeSpaces(formatMoney('9007199254740993000'))).toBe(
      "9 007 199 254 740 993 000 so'm",
    );
    expect(formatMoney('300000000', true)).toBe("300 mln so'm");
    expect(formatMoney('-1250000', true)).toBe("−1,2 mln so'm");
    // Guruh ajratgichi — bo‘shliq, kasr ajratgichi — vergul (o‘zbek yozuvi).
    expect(normalizeSpaces(formatMoney('1732500'))).toBe("1 732 500 so'm");
    expect(normalizeSpaces(formatMoney('-27100000'))).toBe("−27 100 000 so'm");
  });

  it('yo‘q reja va signed moliyaviy qiymatni aniq ajratadi', () => {
    expect(formatMoney(null)).toBe('Reja mavjud emas');
    expect(asMoneyUzs('-500000')).toBe('-500000');
    expect(signedTone('10')).toBe('success');
    expect(signedTone('-10')).toBe('danger');
    expect(signedTone('0')).toBe('neutral');
  });

  it('decimal va exponent ko‘rinishlarini UZS integer sifatida qabul qilmaydi', () => {
    expect(() => asMoneyUzs('100.50')).toThrow("Noto'g'ri UZS qiymati");
    expect(() => asMoneyUzs('1e6')).toThrow("Noto'g'ri UZS qiymati");
  });

  it('chartga faqat JavaScript safe integer qiymatini o‘tkazadi', () => {
    expect(toChartNumber('180000000')).toBe(180_000_000);
    expect(() => toChartNumber('9007199254740992')).toThrow('safe integer');
  });
});

describe('[AC-07, AC-15, AC-16] foiz semantikasi', () => {
  it('nol/no-plan maxrajni chalg‘ituvchi 0% yoki Infinityga aylantirmaydi', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('yig‘ilish foizlarini Uzbek locale bilan formatlaydi', () => {
    expect(formatPercent(60)).toBe('60%');
    expect(formatPercent(93.75)).toBe('93,75%');
    expect(formatPercent(33.333, 2)).toBe('33,33%');
    expect(formatPercent(61.73)).toBe('61,73%');
    expect(normalizeSpaces(formatPercent(3111.11))).toBe('3 111,11%');
    expect(formatPercent(-5.5)).toBe('−5,5%');
  });
});

describe('[FE-TIME-01] Asia/Tashkent sana va vaqt', () => {
  it('UTC timestampni operatsion +05:00 vaqt zonasida ko‘rsatadi', () => {
    expect(formatDateTime('2026-08-20T00:30:00Z')).toBe('20.08.2026 05:30');
  });

  it('UTC yarim tunidan keyingi timestamp Toshkentda ertangi kunga o‘tadi', () => {
    expect(formatDateTime('2026-08-20T20:30:00Z')).toBe('21.08.2026 01:30');
  });

  it('date-only qiymatni brauzer lokal zonasiga siljitmaydi', () => {
    expect(formatDate('2026-08-20')).toBe('20.08.2026');
  });

  it('to‘liq sanani o‘zbekcha oy nomi bilan ko‘rsatadi', () => {
    expect(formatDateLong('2026-08-20')).toBe('20-avgust 2026');
    expect(formatDateLong('2026-01-01')).toBe('1-yanvar 2026');
    expect(formatDateLong('2026-12-31')).toBe('31-dekabr 2026');
  });
});
