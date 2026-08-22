import { describe, expect, it } from 'vitest';
import {
  normalizeKassaRows,
  parseImportAmount,
  parseImportDate,
  type ImportReference,
  type RawRow,
} from '@/features/imports/excel-import';

const refs: ImportReference = {
  branches: [
    { id: 'b-sayxun', name: 'Sayxun' },
    { id: 'b-xalqlar', name: "Xalqlar do'stligi" },
  ],
  categories: [
    { id: 'c-rent', code: 'RENT', name: 'Ijara', expenseType: 'fixed', isActive: true, aliases: [] },
    {
      id: 'c-stationery',
      code: 'STATIONERY',
      name: 'Kanselyariya va o‘quv materiallari',
      expenseType: 'variable',
      isActive: true,
      aliases: [],
    },
  ],
  paymentMethods: [
    { id: 'p-cash', code: 'CASH', name: 'Naqd pul', isActive: true },
    { id: 'p-click', code: 'CLICK_PAYME', name: 'Click/Payme', isActive: true },
  ],
  departments: [{ id: 'd-general', code: 'GENERAL', name: 'Umumiy', isActive: true }],
  users: [{ id: 'u-madina', fullName: 'Madina Karimova', status: 'active', roles: [] }],
  fallbackUserId: 'u-current',
};

/** Kassa varag‘i ustun tartibi: №, Sana, Yil, Oy, Kategoriya, Turi, Tavsif, Summa, ... */
function row(date: unknown, amount: unknown, extra: Partial<Record<number, unknown>> = {}): RawRow {
  const base: unknown[] = [
    1,
    date,
    2026,
    8,
    'Ijara (bino arendasi)',
    'Doimiy',
    'Arenda uchun',
    amount,
    'Naqd pul',
    'Umumiy',
    'Madina',
    'Sayxun',
    null,
  ];
  for (const [index, value] of Object.entries(extra)) base[Number(index)] = value;
  return base as RawRow;
}

describe('[FE-IMPORT-01] sana normalizatsiyasi', () => {
  it('Excel seriya raqamini ISO sanaga aylantiradi', () => {
    expect(parseImportDate(46235)).toEqual({ date: '2026-08-01', fromText: false });
  });

  it('Date obyektini o‘zgartirmasdan oladi', () => {
    expect(parseImportDate(new Date(Date.UTC(2026, 7, 20)))).toEqual({
      date: '2026-08-20',
      fromText: false,
    });
  });

  it('MATN sanani tiklaydi — Excel QUERY tashlab ketgan holat', () => {
    expect(parseImportDate('15.08.2026')).toEqual({ date: '2026-08-15', fromText: true });
    expect(parseImportDate('1.9.2026')).toEqual({ date: '2026-09-01', fromText: true });
    expect(parseImportDate('2026-08-15')).toEqual({ date: '2026-08-15', fromText: true });
  });

  it('mavjud bo‘lmagan sanani rad etadi', () => {
    expect(parseImportDate('31.02.2026').date).toBeNull();
    expect(parseImportDate('kecha').date).toBeNull();
    expect(parseImportDate('').date).toBeNull();
  });
});

describe('[FE-IMPORT-02] summa normalizatsiyasi', () => {
  it('bo‘shliq va vergul ajratgichlarni tozalaydi', () => {
    expect(parseImportAmount('16 680 000')).toBe('16680000');
    expect(parseImportAmount('1,234,567')).toBe('1234567');
    expect(parseImportAmount(28000)).toBe('28000');
  });

  it('nol va noto‘g‘ri qiymatni rad etadi', () => {
    expect(parseImportAmount(0)).toBeNull();
    expect(parseImportAmount('—')).toBeNull();
  });
});

describe('[FE-IMPORT-03] kassa varag‘ini import qilish', () => {
  it('matn sanali qatorni tiklaydi va sanab beradi', () => {
    const result = normalizeKassaRows('Xalqlar_kassa', [row('15.08.2026', 6068400)], refs);

    expect(result.issues).toEqual([]);
    expect(result.recoveredCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      transactionDate: '2026-08-15',
      amountUzs: '6068400',
      categoryId: 'c-rent',
      branchId: 'b-sayxun',
      recoveredTextDate: true,
      sourceRow: 4,
    });
  });

  it('uzun Excel nomini qisqa kategoriyaga moslaydi', () => {
    const result = normalizeKassaRows(
      'Sayxun_kassa',
      [row(46235, 6000, { 4: "Kanselyariya va o'quv materiallari" })],
      refs,
    );
    expect(result.rows[0]?.categoryId).toBe('c-stationery');
  });

  it('apostrof va bo‘shliq farqiga qaramay filialni topadi', () => {
    const result = normalizeKassaRows('Xalqlar_kassa', [
      row(46235, 5000, { 11: 'Xalqlar do‘stligi ' }),
    ], refs);
    expect(result.rows[0]?.branchId).toBe('b-xalqlar');
  });

  it('noma’lum mas’ulni joriy foydalanuvchiga biriktirib, izohda saqlaydi', () => {
    const result = normalizeKassaRows('Sayxun_kassa', [row(46235, 5000, { 10: 'sarvinoz' })], refs);

    expect(result.rows[0]?.responsibleUserId).toBe('u-current');
    expect(result.rows[0]?.comment).toContain('sarvinoz');
    expect(result.issues[0]?.field).toBe('Mas’ul');
  });

  it('yaroqsiz qatorni tashlab, sababini yozib qo‘yadi', () => {
    const result = normalizeKassaRows(
      'Sayxun_kassa',
      [row('kecha', 5000), row(46235, 5000, { 4: 'Yo‘q kategoriya' })],
      refs,
    );

    expect(result.rows).toHaveLength(0);
    expect(result.issues.map((item) => item.field)).toEqual(['Sana', 'Kategoriya']);
    expect(result.issues[1]?.sourceRow).toBe(5);
  });

  it('butunlay bo‘sh qatorni jimgina o‘tkazib yuboradi', () => {
    const result = normalizeKassaRows('Sayxun_kassa', [[null, null, null] as RawRow], refs);
    expect(result.rows).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });
});
