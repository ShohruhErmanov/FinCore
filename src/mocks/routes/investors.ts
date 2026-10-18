import { delay, http, HttpResponse } from 'msw';
import { API, LATENCY_MS, periodRows } from '../state';
import { hasPermission, ok, problem, requireUser } from '../support/http';
import {
  annualSettlement,
  investorPaymentRows,
  investorProfiles,
  type MockPayoutRequest,
  monthlySettlements,
  payoutMonths,
  payoutRequestRows,
  payoutSummary,
} from '../data/investors';

export const investorHandlers = [
  http.get(`${API}/investors`, async ({ request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.view_all'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.view_all'],
      });
    const year = Number(new URL(request.url).searchParams.get('year')) || 2026;
    return ok(
      investorProfiles
        .filter((profile) => !profile.branch || user.branchScopes.includes(profile.branch.id))
        .map((profile) => ({ ...profile, annual: annualSettlement(profile.id, year) })),
    );
  }),
  http.get(`${API}/investors/me`, async () => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const profile = investorProfiles.find((row) => row.userId === user.id);
    if (!profile) return problem(404, 'INVESTOR_NOT_FOUND', 'Investor profili yo‘q.');
    return ok(profile);
  }),
  // Authorization lives here, not in the route guard: an investor may open
  // exactly one id — their own — and the server decides which one that is.
  http.get(`${API}/investors/:id`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const profile = investorProfiles.find((row) => row.id === params.id);
    if (!profile) return problem(404, 'INVESTOR_NOT_FOUND', 'Investor topilmadi.');

    const isSelf = profile.userId === user.id;
    if (
      !(isSelf && hasPermission(user, 'investor.view_own')) &&
      !hasPermission(user, 'investor.view_all')
    )
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.view_all'],
      });
    if (!isSelf && profile.branch && !user.branchScopes.includes(profile.branch.id))
      return problem(403, 'BRANCH_SCOPE_DENIED', 'Bu filial investorini ko‘rish huquqi yo‘q.');

    const year = Number(new URL(request.url).searchParams.get('year')) || 2026;
    return ok({
      investor: profile,
      year,
      annual: annualSettlement(profile.id, year),
      months: monthlySettlements(profile.id, year),
      payments: investorPaymentRows.filter(
        (row) => row.investorId === profile.id && row.paidOn.startsWith(String(year)),
      ),
    });
  }),
  // ------------------------------------------------------- investor payouts

  http.get(`${API}/investor-payouts/me`, async ({ request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.view_own'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.view_own'],
      });
    const profile = investorProfiles.find((row) => row.userId === user.id);
    if (!profile) return problem(404, 'INVESTOR_NOT_FOUND', 'Investor profili yo‘q.');
    const year = Number(new URL(request.url).searchParams.get('year')) || 2026;
    return ok(payoutSummary(profile.id, year));
  }),
  http.get(`${API}/investor-payouts`, async ({ request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.view_all'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.view_all'],
      });
    const year = Number(new URL(request.url).searchParams.get('year')) || 2026;
    return ok(
      investorProfiles
        .filter((row) => !row.branch || user.branchScopes.includes(row.branch.id))
        .map((row) => {
          const summary = payoutSummary(row.id, year);
          return { ...row, annual: summary.annual };
        }),
    );
  }),
  http.get(`${API}/investor-payouts/requests`, async () => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.settlement.approve'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.settlement.approve'],
      });
    return ok(
      payoutRequestRows.filter((row) => row.status === 'pending' || row.status === 'approved'),
    );
  }),
  // No investorId in the body: the profile comes from the session, the same
  // way the real service resolves it.
  http.post(`${API}/investor-payouts/requests`, async ({ request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.settlement.request'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.settlement.request'],
      });
    const profile = investorProfiles.find((row) => row.userId === user.id);
    if (!profile) return problem(404, 'INVESTOR_NOT_FOUND', 'Investor profili yo‘q.');

    const body = (await request.json()) as { periodId: string; amountUzs: string; note?: string };
    const period = periodRows.find((row) => row.id === body.periodId);
    if (!period) return problem(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const month = payoutMonths(profile.id, period.year).find((row) => row.periodId === period.id);
    if (!month) return problem(404, 'PERIOD_NOT_FOUND', 'Davr uchun ulush topilmadi.');

    const amount = BigInt(body.amountUzs || '0');
    if (amount <= 0n) return problem(422, 'AMOUNT_INVALID', 'Summa noldan katta bo‘lishi kerak.');
    if (BigInt(month.payableUzs) === 0n)
      return problem(409, 'PAYOUT_NOTHING_AVAILABLE', 'So‘raladigan summa qolmagan.');
    if (amount > BigInt(month.payableUzs))
      return problem(422, 'PAYOUT_EXCEEDS_AVAILABLE', 'So‘ralgan summa qolgan summadan ko‘p.');
    if (month.requests.some((row) => row.status === 'pending' || row.status === 'approved'))
      return problem(409, 'PAYOUT_ALREADY_REQUESTED', 'Bu davr uchun ochiq so‘rov bor.');

    const row: MockPayoutRequest = {
      id: `payout-${payoutRequestRows.length + 1}`,
      investorId: profile.id,
      investorName: profile.fullName,
      periodId: period.id,
      year: period.year,
      month: period.month,
      monthLabel: month.label,
      requestedAmountUzs: String(amount),
      calculatedShareUzs: month.shareUzs,
      factRevenueUzs: month.factRevenueUzs,
      ownershipPercent: profile.ownershipPercent,
      status: 'pending',
      investorNote: body.note ?? null,
      decisionNote: null,
      decidedAt: null,
      decidedByName: null,
      paidOn: null,
      createdAt: new Date().toISOString(),
    };
    payoutRequestRows.unshift(row);
    return ok(row, 201);
  }),
  http.post(`${API}/investor-payouts/requests/:id/decision`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.settlement.approve'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.settlement.approve'],
      });
    const row = payoutRequestRows.find((item) => item.id === params.id);
    if (!row) return problem(404, 'PAYOUT_REQUEST_NOT_FOUND', 'So‘rov topilmadi.');
    if (row.status !== 'pending')
      return problem(409, 'PAYOUT_NOT_PENDING', 'Qaror allaqachon qabul qilingan.');

    const body = (await request.json()) as { decision: 'approved' | 'rejected'; note?: string };
    if (body.decision === 'rejected' && !body.note?.trim())
      return problem(422, 'PAYOUT_REASON_REQUIRED', 'Rad etish sababini yozing.');

    row.status = body.decision;
    row.decisionNote = body.note?.trim() ?? null;
    row.decidedAt = new Date().toISOString();
    row.decidedByName = user.fullName;
    return ok(row);
  }),
  http.post(`${API}/investor-payouts/requests/:id/payment`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'investor.settlement.pay'))
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.settlement.pay'],
      });
    const row = payoutRequestRows.find((item) => item.id === params.id);
    if (!row) return problem(404, 'PAYOUT_REQUEST_NOT_FOUND', 'So‘rov topilmadi.');
    if (row.status !== 'approved')
      return problem(409, 'PAYOUT_NOT_APPROVED', 'Avval tasdiqlash kerak.');

    const body = (await request.json()) as { paidOn: string; note?: string };
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    if (!body.paidOn?.startsWith(key))
      return problem(422, 'PAYOUT_DATE_OUTSIDE_PERIOD', 'Sana so‘rov davri ichida bo‘lishi kerak.');

    // The payment lands in the same ledger the entitlement view reads, because
    // the money only left the company once.
    investorPaymentRows.unshift({
      investorId: row.investorId,
      id: `payment-${investorPaymentRows.length + 1}`,
      paidOn: body.paidOn,
      amountUzs: row.requestedAmountUzs,
      status: 'posted',
      note: body.note ?? null,
      reversalReason: null,
      createdAt: new Date().toISOString(),
    });
    row.status = 'paid';
    row.paidOn = body.paidOn;
    return ok(row);
  }),
  http.post(`${API}/investor-payouts/requests/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const row = payoutRequestRows.find((item) => item.id === params.id);
    if (!row) return problem(404, 'PAYOUT_REQUEST_NOT_FOUND', 'So‘rov topilmadi.');

    const profile = investorProfiles.find((item) => item.userId === user.id);
    if (profile?.id !== row.investorId || !hasPermission(user, 'investor.settlement.request'))
      return problem(403, 'FORBIDDEN', 'Faqat o‘z so‘rovingizni qaytarib olasiz.', {
        missingPermissions: ['investor.settlement.request'],
      });
    if (row.status !== 'pending' && row.status !== 'approved')
      return problem(409, 'PAYOUT_NOT_CANCELLABLE', 'Bu so‘rovni bekor qilib bo‘lmaydi.');

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    row.status = 'cancelled';
    row.decisionNote = body.note?.trim() ?? null;
    row.decidedAt = new Date().toISOString();
    return ok(row);
  }),
  http.get(`${API}/investor-payouts/investor/:id`, async ({ params, request }) => {
    await delay(LATENCY_MS);
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const profile = investorProfiles.find((row) => row.id === params.id);
    if (!profile) return problem(404, 'INVESTOR_NOT_FOUND', 'Investor topilmadi.');

    const isSelf = profile.userId === user.id;
    if (
      !(isSelf && hasPermission(user, 'investor.view_own')) &&
      !hasPermission(user, 'investor.view_all')
    )
      return problem(403, 'FORBIDDEN', 'Ruxsat yo‘q.', {
        missingPermissions: ['investor.view_all'],
      });

    const year = Number(new URL(request.url).searchParams.get('year')) || 2026;
    return ok(payoutSummary(profile.id, year));
  }),
];
