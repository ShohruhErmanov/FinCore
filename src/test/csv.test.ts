import { describe, expect, it } from 'vitest';
import { buildCsv, csvFileName } from '@/shared/lib/csv';

describe('[FE-EXPORT-01] CSV quruvchisi', () => {
  it('har katakni qo‘shtirnoqqa oladi va qatorlarni CRLF bilan ajratadi', () => {
    expect(
      buildCsv([
        ['Sana', 'Summa'],
        ['20.08.2026', '4600000'],
      ]),
    ).toBe('"Sana","Summa"\r\n"20.08.2026","4600000"');
  });

  it('ichki qo‘shtirnoqni ikkilantiradi — ustunlar surilib ketmaydi', () => {
    expect(buildCsv([['Ijara "yangi" shartnoma']])).toBe('"Ijara ""yangi"" shartnoma"');
  });

  it('vergul va yangi qatorli matnni bitta katakda saqlaydi', () => {
    expect(buildCsv([['Marker, qalam', 'A\nB']])).toBe('"Marker, qalam","A\nB"');
  });

  it('null va undefined ni bo‘sh katak qiladi', () => {
    expect(buildCsv([[null, undefined, 0]])).toBe('"","","0"');
  });

  it('fayl nomiga sana qo‘shadi', () => {
    expect(csvFileName('oylik-hisobot-2026')).toMatch(
      /^fincore-oylik-hisobot-2026-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});
