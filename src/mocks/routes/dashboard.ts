import { http, HttpResponse } from 'msw';
import type { TrendGranularity } from '@/shared/types/domain';
import { ids } from '../fixtures';
import { API, periodRows } from '../state';
import {
  canUseBranch,
  hasPermission,
  ok,
  problem,
  requireUser,
  scopedBranchFilter,
} from '../support/http';
import { buildDashboard, buildExpenseAnalytics } from '../data/reports';

export const dashboardHandlers = [
  http.get(`${API}/reports/dashboard`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'dashboard.view'))
      return problem(403, 'PERMISSION_DENIED', 'Dashboardni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const periodId = url.searchParams.get('period') ?? ids.periodAug;
    if (!periodRows.some((period) => period.id === periodId))
      return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const requested = url.searchParams.get('branch');
    const branchId = scopedBranchFilter(user, requested);
    if (branchId && !canUseBranch(user, branchId))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    const requestedGranularity = url.searchParams.get('granularity');
    const granularity: TrendGranularity =
      requestedGranularity === 'daily' || requestedGranularity === 'weekly'
        ? requestedGranularity
        : 'monthly';
    const canViewNetProfit = user.roles.some((assignment) =>
      ['director', 'business_owner', 'finance_manager'].includes(assignment.role),
    );
    return ok(buildDashboard(branchId, periodId, granularity, canViewNetProfit));
  }),
  http.get(`${API}/reports/expense-analytics`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'dashboard.view'))
      return problem(403, 'PERMISSION_DENIED', 'Dashboardni ko‘rish huquqi yo‘q.');
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const periodId = url.searchParams.get('period');
    const requestedBranch = url.searchParams.get('branch') ?? 'all';
    if (!periodId || !periodRows.some((period) => period.id === periodId))
      return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    if (!from || !to || from > to)
      return problem(422, 'INVALID_DATE_RANGE', 'Sana oralig‘i noto‘g‘ri.');
    if (requestedBranch !== 'all' && !canUseBranch(user, requestedBranch))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial ma’lumotini ko‘rish huquqi yo‘q.');
    return ok(buildExpenseAnalytics(user, periodId, from, to, requestedBranch));
  }),
];
