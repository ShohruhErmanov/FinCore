import { http, HttpResponse } from 'msw';
import type { Expense, MoneyUzs } from '@/shared/types/domain';
import { branches } from '../fixtures';
import { API, db } from '../state';
import { canWriteBranch, hasPermission, ok, problem, requireUser } from '../support/http';
import { findPeriodForBusinessDate, isPositiveMoney, sumMoney } from '../support/money';

export const importHandlers = [
  http.post(`${API}/imports/expenses`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'import.run'))
      return problem(403, 'PERMISSION_DENIED', 'Import qilish huquqi yo‘q.');
    const body = (await request.json()) as {
      rows?: Array<{
        sourceSheet: string;
        sourceRow: number;
        transactionDate: string;
        branchId: string;
        categoryId: string;
        description: string;
        amountUzs: MoneyUzs;
        paymentMethodId: string;
        departmentId: string;
        responsibleUserId: string;
        comment: string | null;
      }>;
    };
    if (!Array.isArray(body.rows) || body.rows.length === 0)
      return problem(422, 'IMPORT_EMPTY', 'Import uchun yozuv yo‘q.');

    let imported = 0;
    let skipped = 0;
    const rejected: Array<{ sourceSheet: string; sourceRow: number; message: string }> = [];
    const created: Expense[] = [];

    for (const input of body.rows) {
      const reject = (message: string) => {
        rejected.push({ sourceSheet: input.sourceSheet, sourceRow: input.sourceRow, message });
      };
      // Takroriy importni to‘xtatish — manba varaq + qator noyob kalit.
      if (
        db.expenseRows.some(
          (row) => row.sourceSheet === input.sourceSheet && row.sourceRow === input.sourceRow,
        )
      ) {
        skipped += 1;
        continue;
      }
      if (!isPositiveMoney(input.amountUzs)) {
        reject('Summa musbat butun so‘m bo‘lishi kerak.');
        continue;
      }
      const period = findPeriodForBusinessDate(input.transactionDate);
      if (!period) {
        reject('Sana mavjud hisob davriga tegishli emas.');
        continue;
      }
      if (period.status === 'closed') {
        reject(`${period.label} yopilgan — yozuv import qilinmadi.`);
        continue;
      }
      const branch = branches.find((item) => item.id === input.branchId);
      const category = db.categoryRows.find((item) => item.id === input.categoryId);
      const method = db.paymentMethodRows.find((item) => item.id === input.paymentMethodId);
      const department = db.departmentRows.find((item) => item.id === input.departmentId);
      const responsible = db.userRows.find((item) => item.id === input.responsibleUserId);
      if (!branch || !category || !method || !department || !responsible) {
        reject('Ma’lumotnomalardan biri topilmadi.');
        continue;
      }
      if (!canWriteBranch(user, branch.id)) {
        reject(`${branch.name} filialiga yozish huquqi yo‘q.`);
        continue;
      }
      const now = new Date().toISOString();
      const expense: Expense = {
        id: `exp-import-${input.sourceSheet}-${input.sourceRow}`,
        transactionDate: input.transactionDate,
        periodId: period.id,
        branchId: branch.id,
        branchName: branch.name,
        categoryId: category.id,
        categoryCodeSnapshot: category.code,
        categoryNameSnapshot: category.name,
        expenseTypeSnapshot: category.expenseType,
        description: input.description,
        amountUzs: input.amountUzs,
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        departmentId: department.id,
        departmentName: department.name,
        responsibleUserId: responsible.id,
        responsibleUserName: responsible.fullName,
        enteredBy: user.id,
        enteredByName: user.fullName,
        comment: input.comment,
        sourceSheet: input.sourceSheet,
        sourceRow: input.sourceRow,
        createdAt: now,
        updatedAt: now,
      };
      created.push(expense);
      imported += 1;
    }

    db.expenseRows = [...created, ...db.expenseRows];
    return ok({
      imported,
      skipped,
      rejected,
      totalUzs: sumMoney(created.map((row) => row.amountUzs)),
    });
  }),
];
