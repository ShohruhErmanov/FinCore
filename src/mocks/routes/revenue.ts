import { http, HttpResponse } from 'msw';
import type { DailyRevenue, DailyRevenueInput, MoneyUzs } from '@/shared/types/domain';
import { branches } from '../fixtures';
import {
  API,
  db,
  periodRows,
  revenueIdempotency,
  revenuePlanMeta,
  revenuePlanRows,
} from '../state';
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
import { findPeriodForBusinessDate, isNonNegativeMoney, sumMoney } from '../support/money';
import { buildRevenuePlanBoard, buildRevenuePlanYear } from '../data/revenue';

export const revenueHandlers = [
  http.get(`${API}/daily-revenues`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own_branch', 'revenue.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumlarni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const branch = url.searchParams.get('branch');
    const periodId = url.searchParams.get('periodId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') ?? 'businessDate:desc';
    const direction = sort.endsWith(':asc') ? 1 : -1;
    const rows = db.revenueRows
      .filter(
        (row) =>
          hasPermission(user, 'revenue.view_all_branches') || canUseBranch(user, row.branchId),
      )
      .filter((row) => !branch || branch === 'all' || row.branchId === branch)
      .filter((row) => !periodId || row.periodId === periodId)
      .filter((row) => !dateFrom || row.businessDate >= dateFrom)
      .filter((row) => !dateTo || row.businessDate <= dateTo)
      .sort(
        (a, b) =>
          direction *
          (a.businessDate.localeCompare(b.businessDate) ||
            a.branchName.localeCompare(b.branchName)),
      );
    return ok(paginate(rows, request));
  }),
  http.get(`${API}/daily-revenues/:id`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.view_own_branch', 'revenue.view_all_branches'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni ko‘rish huquqi yo‘q.');
    const item = db.revenueRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (!hasPermission(user, 'revenue.view_all_branches') && !canUseBranch(user, item.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(item);
  }),
  http.post(`${API}/daily-revenues`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue.create'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum kiritish huquqi yo‘q.');
    const body = (await request.json()) as DailyRevenueInput;
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
    const existing = revenueIdempotency.get(dedupeKey);
    if (existing) return ok(existing);
    const channels = [body.cashUzs, body.cardUzs, body.transferUzs];
    if (channels.some((value) => !isNonNegativeMoney(value)))
      return problem(422, 'AMOUNT_INVALID', 'Summalar manfiy bo‘lmagan butun so‘mda bo‘lsin.');
    const totalUzs = sumMoney(channels);
    if (BigInt(totalUzs) <= 0n)
      return problem(422, 'AMOUNT_INVALID', 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.');
    const period = findPeriodForBusinessDate(body.businessDate);
    if (!period)
      return problem(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
    if (period.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrga tushum kiritib bo‘lmaydi.');
    const duplicate = db.revenueRows.find(
      (row) => row.businessDate === body.businessDate && row.branchId === branchId,
    );
    if (duplicate)
      return problem(
        409,
        'REVENUE_DAY_EXISTS',
        'Bu kun uchun ushbu filialda tushum allaqachon kiritilgan. Mavjud yozuvni tahrirlang.',
        { revenueId: duplicate.id },
      );
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return problem(422, 'REFERENCE_INVALID', 'Filial topilmadi.');
    const now = new Date().toISOString();
    const created: DailyRevenue = {
      id: `rev-mock-${db.revenueRows.length + 1}`,
      businessDate: body.businessDate,
      periodId: period.id,
      branchId,
      branchName: branch.name,
      cashUzs: body.cashUzs,
      cardUzs: body.cardUzs,
      transferUzs: body.transferUzs,
      totalUzs,
      comment: body.comment?.trim() || null,
      enteredBy: user.id,
      enteredByName: user.fullName,
      createdAt: now,
      updatedAt: now,
    };
    db.revenueRows = [created, ...db.revenueRows];
    revenueIdempotency.set(dedupeKey, structuredClone(created));
    return ok(created, 201);
  }),
  http.patch(`${API}/daily-revenues/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue.edit', 'revenue.create'))
      return problem(403, 'PERMISSION_DENIED', 'Tushumni tahrirlash huquqi yo‘q.');
    const index = db.revenueRows.findIndex((row) => row.id === params.id);
    const old = db.revenueRows[index];
    if (!old) return problem(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (!canWriteBranch(user, old.branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
    if (periodRows.find((row) => row.id === old.periodId)?.status === 'closed')
      return problem(409, 'PERIOD_LOCKED', 'Yopilgan davrdagi tushum tahrirlanmaydi.');
    const body = (await request.json()) as Partial<DailyRevenueInput> & { editReason?: string };
    if (hasRole(user, 'cashier') && !body.editReason?.trim())
      return problem(
        422,
        'EDIT_REASON_REQUIRED',
        'Kassir tahrirlashi uchun izoh kiritish majburiy.',
      );
    const cashUzs = body.cashUzs ?? old.cashUzs;
    const cardUzs = body.cardUzs ?? old.cardUzs;
    const transferUzs = body.transferUzs ?? old.transferUzs;
    if ([cashUzs, cardUzs, transferUzs].some((value) => !isNonNegativeMoney(value)))
      return problem(422, 'AMOUNT_INVALID', 'Summalar manfiy bo‘lmagan butun so‘mda bo‘lsin.');
    const totalUzs = sumMoney([cashUzs, cardUzs, transferUzs]);
    if (BigInt(totalUzs) <= 0n)
      return problem(422, 'AMOUNT_INVALID', 'Kunlik jami tushum 0 dan katta bo‘lishi kerak.');
    const updated: DailyRevenue = {
      ...old,
      cashUzs,
      cardUzs,
      transferUzs,
      totalUzs,
      comment: body.comment?.trim() || old.comment,
      updatedAt: new Date().toISOString(),
    };
    db.revenueRows[index] = updated;
    return ok(updated);
  }),
  // Two path segments, so ':periodId' below never sees it.
  http.get(`${API}/revenue-plans/year/:year`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue_plan.manage', 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini ko‘rish huquqi yo‘q.');
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      return problem(400, 'VALIDATION_ERROR', 'Yil 2000–2100 oralig‘ida bo‘lishi kerak.');
    return ok(buildRevenuePlanYear(year));
  }),
  http.get(`${API}/revenue-plans/:periodId`, ({ params }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasAnyPermission(user, 'revenue_plan.manage', 'reports.view'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini ko‘rish huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return ok(buildRevenuePlanBoard(String(params.periodId)));
  }),
  http.put(`${API}/revenue-plans/:periodId`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'revenue_plan.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Tushum rejasini tahrirlash huquqi yo‘q.');
    const period = periodRows.find((row) => row.id === params.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (period.status === 'closed')
      return problem(409, 'PERIOD_CLOSED', 'Yopiq davrdagi tushum rejasi tahrirlanmaydi.');
    const body = (await request.json()) as {
      lines: Array<{ branchId: string; plannedAmountUzs: MoneyUzs | null }>;
    };
    if (
      !Array.isArray(body.lines) ||
      body.lines.some(
        (line) => line.plannedAmountUzs !== null && !isNonNegativeMoney(line.plannedAmountUzs),
      )
    )
      return problem(
        422,
        'REVENUE_PLAN_INVALID',
        'Reja qiymati null yoki manfiy bo‘lmagan butun so‘m bo‘lishi kerak.',
      );
    const periodId = String(params.periodId);
    const next: Record<string, MoneyUzs> = {};
    for (const line of body.lines) {
      if (!branches.some((branch) => branch.id === line.branchId))
        return problem(422, 'REFERENCE_INVALID', 'Filial topilmadi.');
      if (line.plannedAmountUzs !== null) next[line.branchId] = line.plannedAmountUzs;
    }
    revenuePlanRows[periodId] = next;
    revenuePlanMeta.set(periodId, {
      updatedAt: new Date().toISOString(),
      updatedByName: user.fullName,
    });
    return ok(buildRevenuePlanBoard(periodId));
  }),
];
