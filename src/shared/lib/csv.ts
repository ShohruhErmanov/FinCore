export type CsvCell = string | number | null | undefined;

/** Excel UTF-8 ni to‘g‘ri o‘qishi uchun fayl boshiga qo‘yiladigan BOM. */
const BOM = '\ufeff';

/** RFC 4180 bo‘yicha qator: har katak qo‘shtirnoqda, ichki qo‘shtirnoq ikkilanadi. */
export function buildCsv(rows: CsvCell[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
}

/** Fayl nomi: fincore-<nom>-YYYY-MM-DD.csv */
export function csvFileName(name: string): string {
  return `fincore-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** CSV faylni brauzer orqali yuklab beradi. */
export function downloadCsv(name: string, rows: CsvCell[][]): void {
  const blob = new Blob([`${BOM}${buildCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = csvFileName(name);
  anchor.click();
  URL.revokeObjectURL(url);
}
