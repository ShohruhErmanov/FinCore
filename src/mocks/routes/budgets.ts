import { http, HttpResponse } from 'msw';
import type { BudgetPlan } from '@/shared/types/domain';
import { API, db, periodRows } from '../state';
import { hasPermission, ok, problem, requireUser } from '../support/http';
import { buildBudgetHistory, buildBudgetPlan } from '../data/budget';
import { isNonNegativeMoney } from '../support/money';

export const budgetHandlers = [
  http.get(`${API}/budget-plans/history`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.view'))
      return problem(403, 'PERMISSION_DENIED', 'Budjet tarixini ko‘rish huquqi yo‘q.');
    const yearText = new URL(request.url).searchParams.get('year');
    const year = yearText === null ? undefined : Number(yearText);
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100))
      return problem(422, 'VALIDATION_ERROR', 'Yil 2000–2100 oralig‘ida bo‘lishi kerak.');
    return ok(buildBudgetHistory(year));
  }),
  http.get(`${API}/budget-plans/:periodId`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.view'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni ko‘rish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return ok(buildBudgetPlan(String(params.periodId)));
  }),
  http.put(`${API}/budget-plans/:periodId/lines`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'budget.create_edit'))
      return problem(403, 'PERMISSION_DENIED', 'Budjetni tahrirlash huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi budjet tahrirlanmaydi.');
    const body = (await request.json()) as {
      lines: Array<
        Pick<BudgetPlan['lines'][number], 'branchId' | 'categoryId' | 'plannedAmountUzs' | 'reason'>
      >;
    };
    if (
      !Array.isArray(body.lines) ||
      body.lines.some(
        (line) => line.plannedAmountUzs !== null && !isNonNegativeMoney(line.plannedAmountUzs),
      )
    )
      return problem(
        422,
        'BUDGET_AMOUNT_INVALID',
        'Budjet qiymati null yoki manfiy bo‘lmagan butun so‘m bo‘lishi kerak.',
      );
    const current = buildBudgetPlan(String(params.periodId));
    const updatedLines = current.lines.map((line) => {
      const input = body.lines.find(
        (candidate) =>
          candidate.branchId === line.branchId && candidate.categoryId === line.categoryId,
      );
      if (!input) return line;
      const hasPlan = input.plannedAmountUzs !== null;
      return {
        ...line,
        plannedAmountUzs: input.plannedAmountUzs,
        reason: input.reason?.trim() || null,
        hasPlan,
        varianceUzs: hasPlan
          ? (BigInt(input.plannedAmountUzs!) - BigInt(line.actualAmountUzs)).toString()
          : null,
      };
    });
    const saved: BudgetPlan = {
      id: current.id,
      periodId: current.periodId,
      periodLabel: current.periodLabel,
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
      lines: updatedLines,
    };
    db.budgetPlanRows = [
      ...db.budgetPlanRows.filter((row) => row.periodId !== params.periodId),
      saved,
    ];
    return ok(saved);
  }),
];
