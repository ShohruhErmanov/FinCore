import type { Expense, PaginatedResponse } from '@/shared/types/domain';

export const JOURNAL_HEADERS = [
  '№',
  'Sana',
  'Yil',
  'Oy',
  'Kategoriya',
  'Turi',
  'Tavsif / nima uchun',
  "Summa, so'm",
  "To'lov usuli",
  "Bo'lim",
  "Mas'ul",
  'Filial',
  'Izoh',
] as const;

export interface JournalRow {
  sequence: number;
  transactionDate: string;
  year: number;
  month: number;
  category: string;
  expenseType: 'Doimiy' | "O'zgaruvchan";
  description: string;
  amountUzs: string;
  paymentMethod: string;
  department: string;
  responsible: string;
  branch: string;
  comment: string;
}

type ExpenseQuery = Record<string, string | number | undefined>;
type PageLoader = (query: ExpenseQuery) => Promise<PaginatedResponse<Expense>>;

function dateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Jurnal sanasi noto'g'ri: ${date}`);
  return { year, month, day };
}

/** Excel Jurnalining 13 ustuniga bir xil, audit qilinadigan mapping. */
export function toJournalRows(expenses: Expense[], startSequence = 1): JournalRow[] {
  return expenses.map((expense, index) => {
    const { year, month } = dateParts(expense.transactionDate);
    return {
      sequence: startSequence + index,
      transactionDate: expense.transactionDate,
      year,
      month,
      category: expense.categoryNameSnapshot,
      expenseType: expense.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : "O'zgaruvchan",
      description: expense.description,
      amountUzs: expense.amountUzs,
      paymentMethod: expense.paymentMethodName,
      department: expense.departmentName,
      responsible: expense.responsibleUserName,
      branch: expense.branchName,
      comment: expense.comment ?? '',
    };
  });
}

export function journalCsvRows(
  expenses: Expense[],
  startSequence = 1,
): Array<Array<string | number>> {
  return [
    [...JOURNAL_HEADERS],
    ...toJournalRows(expenses, startSequence).map((row) => [
      row.sequence,
      row.transactionDate,
      row.year,
      row.month,
      row.category,
      row.expenseType,
      row.description,
      row.amountUzs,
      row.paymentMethod,
      row.department,
      row.responsible,
      row.branch,
      row.comment,
    ]),
  ];
}

/**
 * GET /expenses server-side paginationini saqlagan holda eksport uchun barcha
 * filtrlangan sahifalarni oladi. Har bir so'rov o'sha userning RBAC scope'ida qoladi.
 */
export async function loadAllJournalExpenses(
  loadPage: PageLoader,
  filters: ExpenseQuery,
): Promise<Expense[]> {
  const pageSize = 100;
  const rows: Expense[] = [];
  let page = 1;
  let expectedTotal = Number.POSITIVE_INFINITY;

  while (rows.length < expectedTotal) {
    const result = await loadPage({ ...filters, page, pageSize });
    expectedTotal = result.total;
    rows.push(...result.items);
    if (result.items.length === 0 || !result.nextCursor) break;
    page += 1;
  }

  if (rows.length < expectedTotal)
    throw new Error("Jurnalning barcha sahifalarini eksport uchun olib bo'lmadi.");

  return rows.slice(0, expectedTotal);
}

function safeAmount(value: string): number {
  const amount = BigInt(value);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Jurnal summasi Excel aniqlik chegarasidan katta.');
  return Number(amount);
}

/** Filtrlangan server jurnalini haqiqiy .xlsx baytlariga aylantiradi. */
export async function buildJournalXlsx(expenses: Expense[]): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'FinCore';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Jurnal', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  sheet.mergeCells('A1:M1');
  sheet.getCell('A1').value = "UMUMIY JURNAL — IKKI FILIALNING YAGONA XARAJATLAR RO'YXATI";
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:M2');
  sheet.getCell('A2').value =
    "FinCore server jurnalidan eksport qilindi. Ma'lumotni platformada kiriting; bu varaq hisobot ko'rinishi.";
  sheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' }, size: 10 };
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 22;

  const header = sheet.getRow(3);
  header.values = [...JOURNAL_HEADERS];
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;

  for (const row of toJournalRows(expenses)) {
    const { year, month, day } = dateParts(row.transactionDate);
    sheet.addRow([
      row.sequence,
      new Date(Date.UTC(year, month - 1, day)),
      row.year,
      row.month,
      row.category,
      row.expenseType,
      row.description,
      safeAmount(row.amountUzs),
      row.paymentMethod,
      row.department,
      row.responsible,
      row.branch,
      row.comment,
    ]);
  }

  const widths = [7, 13, 9, 7, 34, 16, 42, 18, 24, 22, 24, 22, 32];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(2).numFmt = 'dd.mm.yyyy';
  sheet.getColumn(8).numFmt = '#,##0';
  sheet.getColumn(8).alignment = { horizontal: 'right' };

  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFD6DEE8' } },
      };
    });
  }

  if (sheet.rowCount >= 4) sheet.autoFilter = { from: 'A3', to: `M${sheet.rowCount}` };
  sheet.pageSetup.printTitlesRow = '1:3';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayBuffer);
}

/** Tayyor Jurnal workbookini brauzerda yuklab beradi. */
export async function downloadJournalXlsx(expenses: Expense[]): Promise<void> {
  const bytes = await buildJournalXlsx(expenses);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fincore-jurnal-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
