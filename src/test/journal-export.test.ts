import { describe, expect, it, vi } from 'vitest';
import {
  buildJournalXlsx,
  JOURNAL_HEADERS,
  journalCsvRows,
  loadAllJournalExpenses,
  toJournalRows,
} from '@/features/expenses/journal-export';
import type { Expense, PaginatedResponse } from '@/shared/types/domain';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    transactionDate: '2026-08-20',
    periodId: 'period-1',
    branchId: 'branch-sayxun',
    branchName: 'Sayxun',
    categoryId: 'category-rent',
    categoryCodeSnapshot: 'RENT',
    categoryNameSnapshot: 'Ijara (bino arendasi)',
    expenseTypeSnapshot: 'fixed',
    description: 'Sayxun filiali ijara to‘lovi',
    amountUzs: '7100000',
    paymentMethodId: 'payment-bank',
    paymentMethodName: "Bank o'tkazmasi",
    departmentId: 'department-admin',
    departmentName: "Ma'muriyat",
    responsibleUserId: 'user-1',
    responsibleUserName: 'Madina',
    enteredBy: 'user-1',
    enteredByName: 'Madina',
    comment: 'Avgust oyi',
    sourceSheet: 'Sayxun_kassa',
    sourceRow: 21,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
    ...overrides,
  };
}

describe('Excel bilan bir xil Jurnal eksporti', () => {
  it('Expense yozuvini Jurnalning 13 ustuniga xaritalaydi', () => {
    const [row] = toJournalRows([expense()], 41);

    expect(row).toEqual({
      sequence: 41,
      transactionDate: '2026-08-20',
      year: 2026,
      month: 8,
      category: 'Ijara (bino arendasi)',
      expenseType: 'Doimiy',
      description: 'Sayxun filiali ijara to‘lovi',
      amountUzs: '7100000',
      paymentMethod: "Bank o'tkazmasi",
      department: "Ma'muriyat",
      responsible: 'Madina',
      branch: 'Sayxun',
      comment: 'Avgust oyi',
    });

    const csv = journalCsvRows([expense()], 41);
    expect(csv[0]).toEqual([...JOURNAL_HEADERS]);
    expect(csv[0]).toHaveLength(13);
    expect(csv[1]).toHaveLength(13);
  });

  it('XLSX eksport oldidan barcha server sahifalarini ayni filtr bilan oladi', async () => {
    const allRows = [
      expense(),
      expense({ id: 'expense-2', amountUzs: '20000' }),
      expense({ id: 'expense-3', branchId: 'branch-xalqlar', branchName: "Xalqlar do'stligi" }),
    ];
    const loadPage = vi.fn(
      async (
        query: Record<string, string | number | undefined>,
      ): Promise<PaginatedResponse<Expense>> => {
        const page = Number(query.page);
        return {
          items: page === 1 ? allRows.slice(0, 2) : allRows.slice(2),
          page,
          pageSize: 100,
          total: 3,
          nextCursor: page === 1 ? '2' : null,
        };
      },
    );

    const result = await loadAllJournalExpenses(loadPage, {
      branch: 'branch-sayxun',
      year: '2026',
      month: '8',
      sort: 'transactionDate:desc',
    });

    expect(result).toEqual(allRows);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ branch: 'branch-sayxun', page: 1, pageSize: 100 }),
    );
    expect(loadPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ branch: 'branch-sayxun', page: 2, pageSize: 100 }),
    );
  });

  it('Excel ochadigan Jurnal varag‘ini sarlavha, format va raqamli summa bilan yaratadi', async () => {
    const { Workbook } = await import('exceljs');
    const bytes = await buildJournalXlsx([expense()]);
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet('Jurnal');
    expect(sheet?.getCell('A1').value).toContain('UMUMIY JURNAL');
    expect(sheet?.getRow(3).values).toEqual([undefined, ...JOURNAL_HEADERS]);
    expect(sheet?.getCell('B4').value).toBeInstanceOf(Date);
    expect(sheet?.getCell('H4').value).toBe(7_100_000);
    expect(sheet?.getCell('H4').numFmt).toBe('#,##0');
    expect(sheet?.autoFilter).toBe('A3:M4');
  });
});
