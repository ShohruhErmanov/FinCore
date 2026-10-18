import { http, HttpResponse } from 'msw';
import type { TelegramSettingsInput } from '@/shared/types/domain';
import { branches, ids } from '../fixtures';
import {
  buildMonthlyReportMessage,
  buildReminderMessage,
  findMissingRevenueBranches,
} from '@/features/notifications/telegram';
import { API, db, periodRows } from '../state';
import { hasPermission, noContent, ok, problem, requireUser } from '../support/http';
import { isReachable, publicTelegramSettings } from '../data/telegram';
import { buildDashboard } from '../data/reports';

export const notificationHandlers = [
  http.get(`${API}/notifications/telegram`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Bildirishnoma sozlamalari uchun ruxsat yo‘q.');
    return ok(publicTelegramSettings());
  }),
  http.get(`${API}/notifications/inbox`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Bildirishnomalar uchun ruxsat yo‘q.');
    return ok([]);
  }),
  http.put(`${API}/notifications/telegram`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Bildirishnoma sozlamalari uchun ruxsat yo‘q.');
    const body = (await request.json()) as TelegramSettingsInput;
    if (!/^\d{2}:\d{2}$/.test(body.reminderTimeLocal ?? ''))
      return problem(422, 'TIME_INVALID', 'Eslatma vaqti HH:mm formatida bo‘lsin.');
    if (
      !Number.isInteger(body.monthlyReportDay) ||
      body.monthlyReportDay < 1 ||
      body.monthlyReportDay > 28
    )
      return problem(422, 'DAY_INVALID', 'Hisobot kuni 1 va 28 orasida bo‘lsin.');
    db.telegramState = {
      ...db.telegramState,
      enabled: body.enabled,
      dailyReminderEnabled: body.dailyReminderEnabled,
      reminderTimeLocal: body.reminderTimeLocal,
      monthlyReportEnabled: body.monthlyReportEnabled,
      monthlyReportDay: body.monthlyReportDay,
      recipients: (body.recipients ?? []).map((item) => ({
        userId: item.userId,
        fullName: item.fullName,
        linked: false,
      })),
    };
    return ok(publicTelegramSettings());
  }),
  http.get(`${API}/notifications/reminder-preview`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    const businessDate =
      new URL(request.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    const states = findMissingRevenueBranches(branches, db.revenueRows, businessDate);
    return ok({
      businessDate,
      branches: states.map((state) => {
        const recipients = db.telegramState.recipients.filter((recipient) => {
          const target = db.userRows.find((row) => row.id === recipient.userId);
          return (
            recipient.userId === db.signedInUser?.id &&
            db.telegramLink.status === 'linked' &&
            target?.status === 'active' &&
            target.writeBranchScopes.includes(state.branchId)
          );
        });
        return {
          ...state,
          recipients,
          message:
            state.totalUzs === null
              ? buildReminderMessage({
                  branchName: state.branchName,
                  businessDate,
                  ...(recipients[0] ? { cashierName: recipients[0].fullName } : {}),
                })
              : null,
        };
      }),
    });
  }),
  http.get(`${API}/notifications/monthly-preview`, ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    const periodId = new URL(request.url).searchParams.get('period') ?? ids.periodAug;
    const period = periodRows.find((row) => row.id === periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    const data = buildDashboard(null, periodId, 'monthly');
    return ok({
      periodLabel: period.label,
      message: buildMonthlyReportMessage({
        periodLabel: period.label,
        revenuePlanUzs: data.revenuePlanUzs,
        revenueActualUzs: data.revenueActualUzs,
        revenueCompletionPct: data.revenueCompletionPct,
        expensePlanUzs: data.expensePlanUzs,
        expenseActualUzs: data.expenseActualUzs,
        expenseCompletionPct: data.expenseCompletionPct,
        fixedExpenseUzs: data.fixedExpenseUzs,
        variableExpenseUzs: data.variableExpenseUzs,
        branches: data.branches.map((branch) => ({
          name: branch.name,
          revenueActualUzs: branch.revenueActualUzs,
          revenueCompletionPct: branch.revenueCompletionPct,
          expenseActualUzs: branch.expenseActualUzs,
          expenseCompletionPct: branch.expenseCompletionPct,
        })),
      }),
      recipients: db.telegramState.recipients.filter((recipient) => {
        const target = db.userRows.find((row) => row.id === recipient.userId);
        return isReachable(recipient.userId) && target?.permissions.includes('reports.view');
      }),
    });
  }),
  http.post(`${API}/notifications/telegram/test`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'notification.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Ruxsat yo‘q.');
    if (!db.telegramState.botTokenSet)
      return problem(409, 'TELEGRAM_DISABLED', 'Telegram integratsiyasi yoqilmagan.');
    // No destination is accepted: the message always goes to the caller’s own
    // verified chat, so an arbitrary chat id can never be a delivery target.
    if (db.telegramLink.status !== 'linked')
      return problem(404, 'TELEGRAM_LINK_NOT_FOUND', 'Avval o‘z Telegram hisobingizni ulang.');
    return ok({ delivered: false, note: 'DEMO_NO_BACKEND' });
  }),
  // --- PHASE 38: self-service Telegram linking -----------------------------
  http.get(`${API}/notifications/telegram/link`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    return ok(db.telegramLink);
  }),
  http.post(`${API}/notifications/telegram/link`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!db.telegramState.botTokenSet)
      return problem(409, 'TELEGRAM_DISABLED', 'Telegram integratsiyasi yoqilmagan.');
    if (db.telegramLink.status === 'linked')
      return problem(409, 'TELEGRAM_ALREADY_LINKED', 'Telegram allaqachon ulangan.');
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    db.telegramLink = { ...db.telegramLink, status: 'pending', pendingExpiresAt: expiresAt };
    // The demo token is throwaway: the real one is minted by the backend and
    // never round-trips through the client.
    return ok(
      {
        deepLink: `https://t.me/fincore_bot?start=demo-${Math.random().toString(36).slice(2, 10)}`,
        expiresAt,
      },
      201,
    );
  }),
  http.delete(`${API}/notifications/telegram/link`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (db.telegramLink.status === 'unlinked')
      return problem(404, 'TELEGRAM_LINK_NOT_FOUND', 'Ulangan Telegram hisobi topilmadi.');
    db.telegramLink = {
      status: 'unlinked',
      telegramUsername: null,
      displayName: null,
      linkedAt: null,
      pendingExpiresAt: null,
    };
    return noContent();
  }),
];
