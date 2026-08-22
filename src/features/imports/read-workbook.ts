import type { RawRow } from './excel-import';

/** Kassa varaqlari — Excel’dagi manba (Jurnal ular asosida yig‘iladi). */
export const KASSA_SHEETS = ['Sayxun_kassa', 'Xalqlar_kassa'] as const;
export const HEADER_ROWS = 3;

export interface WorkbookSheet {
  name: string;
  rows: RawRow[];
}

/**
 * .xlsx faylni o‘qib, kassa varaqlarining ma’lumot qatorlarini qaytaradi.
 * exceljs faqat shu yerda ishlatiladi — qolgan mantiq sof va testlanadi.
 */
export async function readKassaSheets(file: File): Promise<WorkbookSheet[]> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets: WorkbookSheet[] = [];
  for (const name of KASSA_SHEETS) {
    const worksheet = workbook.getWorksheet(name);
    if (!worksheet) continue;
    const rows: RawRow[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber <= HEADER_ROWS) return;
      const values = row.values as unknown[];
      // exceljs 1-indeksli massiv qaytaradi — 0-elementni tashlaymiz.
      rows.push(values.slice(1).map(toRawCell));
    });
    sheets.push({ name, rows });
  }
  return sheets;
}

function toRawCell(value: unknown): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'number' || typeof value === 'string')
    return value;
  // Formula yoki rich-text katak
  if (typeof value === 'object') {
    const cell = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (cell.richText) return cell.richText.map((part) => part.text).join('');
    if (cell.result !== undefined) return toRawCell(cell.result);
    if (cell.text !== undefined) return String(cell.text);
  }
  return String(value);
}
