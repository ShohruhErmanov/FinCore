import { http, HttpResponse } from 'msw';
import type { Expense, ExpenseCreateInput } from '@/shared/types/domain';
import { branches } from '../fixtures';
import { API, db, expenseIdempotency, periodRows } from '../state';
import {
  canUseBranch,
  canWriteBranch,
  hasAnyPermission,
  hasPermission,
  hasRole,
  ok,
  paginate,
  problem,
  requireUser,
} from '../support/http';
import { filterExpenses } from '../data/reports';
import { findPeriodForBusinessDate, isPositiveMoney } from '../support/money';

export const expenseHandlers = [
  http.get(`${API}/expenses`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'expense.view_own_branch', 'expense.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatlarni ko‘rish huquqi yo‘q.');
    return ok(paginate(filterExpenses(request, user), request));
  }),
  http.get(`${API}/expenses/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'expense.view_own_branch', 'expense.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatni ko‘rish huquqi yo‘q.');
    const item = db.expenseRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!hasPermission(user, 'expense.view_all_branches') && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/expenses`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'expense.create'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajat kiritish huquqi yo‘q.');
    const body = (await request.json()) as ExpenseCreateInput;
    const branchId = body.branchId ?? user.writeBranchScopes[0];
    if (!branchId || !canWriteBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    const headerKey = request.headers.get('Idempotency-Key');
    if (!headerKey || headerKey !== body.idempotencyKey)
      return problem(
        422,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header va body mos bo‘lishi shart.',
      );
    const dedupeKey = `${user.id}:${headerKey}`;
    const existing = expenseIdempotency.get(dedupeKey);
    if (existing) return ok(existing);
    if (!isPositiveMoney(body.amountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Summa musbat butun so‘mda bo‘lishi kerak.');
    const period = findPeriodForBusinessDate(body.transactionDate);
    if (!period)
      return problem(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga yozuv qo‘shib bo‘lmaydi.');
    const category = db.categoryRows.find((item) => item.id === body.categoryId && item.isActive);
    const method = db.paymentMethodRows.find(
      (item) => item.id === body.paymentMethodId && item.isActive,
    );
    const department = db.departmentRows.find(
      (item) => item.id === body.departmentId && item.isActive,
    );
    const responsible = db.userRows.find((item) => item.id === body.responsibleUserId);
    const branch = branches.find((item) => item.id === branchId);
    if (!category || !method || !department || !responsible || !branch)
      return problem(
        422,
        'REFERENCE_INVALID',
        'Tanlangan ma’lumotlardan biri faol emas yoki topilmadi.',
      );
    const id = `exp-mock-${db.expenseRows.length + 1}`;
    const created: Expense = {
      id,
      transactionDate: body.transactionDate,
      periodId: period.id,
      branchId,
      branchName: branch.name,
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: body.description,
      amountUzs: body.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      departmentId: department.id,
      departmentName: department.name,
      responsibleUserId: responsible.id,
      responsibleUserName: responsible.fullName,
      enteredBy: user.id,
      enteredByName: user.fullName,
      comment: body.comment ?? null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.expenseRows = [created, ...db.expenseRows];
    expenseIdempotency.set(dedupeKey, structuredClone(created));
    return ok(created, 201);
  }),
  http.patch(`${API}/expenses/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'expense.edit'))
      return problem(403, 'PERMISSION_DENIED', 'Xarajatni tahrirlash huquqi yo‘q.');
    const index = db.expenseRows.findIndex((row) => row.id === params.id);
    const old = db.expenseRows[index];
    if (!old) return problem(404, 'EXPENSE_NOT_FOUND', 'Xarajat topilmadi.');
    if (!canWriteBranch(user, old.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    const body = (await request.json()) as Partial<ExpenseCreateInput> & { editReason?: string };
    if (hasRole(user, 'cashier') && !body.editReason?.trim())
      return problem(
        422,
        'EDIT_REASON_REQUIRED',
        'Kassir tahrirlashi uchun izoh kiritish majburiy.',
      );
    if (body.amountUzs !== undefined && !isPositiveMoney(body.amountUzs))
      return problem(422, 'AMOUNT_INVALID', 'Summa musbat butun so‘mda bo‘lishi kerak.');
    const oldPeriod = periodRows.find((period) => period.id === old.periodId);
    if (oldPeriod?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi yozuv tahrirlanmaydi.');
    const transactionDate = body.transactionDate ?? old.transactionDate;
    const targetPeriod = findPeriodForBusinessDate(transactionDate);
    if (!targetPeriod)
      return problem(422, 'DATE_OR_PERIOD_INVALID', 'Sana mavjud hisob davriga tegishli emas.');
    if (targetPeriod.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga ko‘chirish mumkin emas.');
    const category = db.categoryRows.find(
      (item) => item.id === (body.categoryId ?? old.categoryId),
    );
    const method = db.paymentMethodRows.find(
      (item) => item.id === (body.paymentMethodId ?? old.paymentMethodId),
    );
    const department = db.departmentRows.find(
      (item) => item.id === (body.departmentId ?? old.departmentId),
    );
    const responsible = db.userRows.find(
      (item) => item.id === (body.responsibleUserId ?? old.responsibleUserId),
    );
    if (!category || !method || !department || !responsible)
      return problem(422, 'REFERENCE_INVALID', 'Tanlangan ma’lumotlardan biri topilmadi.');
    const updated: Expense = {
      ...old,
      transactionDate,
      periodId: targetPeriod.id,
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: body.description ?? old.description,
      amountUzs: body.amountUzs ?? old.amountUzs,
      paymentMethodId: method.id,
      paymentMethodName: method.name,
      departmentId: department.id,
      departmentName: department.name,
      responsibleUserId: responsible.id,
      responsibleUserName: responsible.fullName,
      comment: body.comment ?? old.comment,
      id: old.id,
      branchId: old.branchId,
      enteredBy: old.enteredBy,
      enteredByName: old.enteredByName,
      updatedAt: new Date().toISOString(),
    };
    db.expenseRows[index] = updated;
    return ok(updated);
  }),
];
