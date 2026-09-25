import { describe, expect, it, vi } from 'vitest';
import { ApiException, type AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import type { NotificationEventsService } from '@/notification-events/notification-events.service';
import { InvestorPayoutsService } from './investor-payouts.service';
import type { InvestorsService, InvestorRef } from './investors.service';

/** Asserts the 403 body the frontend reads, not just the status. */
async function expectMissingPermission(promise: Promise<unknown>, permission: string) {
  await expect(promise).rejects.toMatchObject({ status: 403 });
  const error = await promise.catch((caught: unknown) => caught);
  expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({
    code: 'FORBIDDEN',
    details: { missingPermissions: [permission] },
  });
}

const INVESTOR_A = '00000000-0000-4000-8000-0000000000a1';
const INVESTOR_B = '00000000-0000-4000-8000-0000000000a2';
const USER_A = '00000000-0000-4000-8000-0000000000b1';
const DIRECTOR = '00000000-0000-4000-8000-0000000000b9';
const PERIOD_AUG = '00000000-0000-4000-8000-0000000000d8';
const REQUEST = '00000000-0000-4000-8000-0000000000e1';

const PROFILE_A: InvestorRef = {
  id: INVESTOR_A,
  userId: USER_A,
  fullName: 'Ali Valiyev',
  phone: '+998901112233',
  ownershipPercent: 2,
  branch: null,
  isActive: true,
};

function investor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_A,
    fullName: 'Ali Valiyev',
    phone: '+998901112233',
    status: 'active',
    roles: [],
    permissions: ['investor.view_own', 'investor.settlement.request'],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

const director = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser =>
  investor({
    id: DIRECTOR,
    fullName: 'Direktor',
    permissions: [
      'investor.view_all',
      'investor.manage',
      'investor.settlement.approve',
      'investor.settlement.pay',
    ],
    ...overrides,
  });

/**
 * August carries the worked example; every other month is empty unless the
 * test names its own revenue per month.
 */
function shareRows(paid = 0n, open = 0n, fact?: Record<number, bigint>, startMonth?: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const eligible = startMonth === undefined || month >= startMonth;
    const revenue = eligible ? (fact ? (fact[month] ?? 0n) : month === 8 ? 302_841_471n : 0n) : 0n;
    // The view rounds each month on its own; the service must not add these up
    // to get the year.
    const monthShare = (revenue * 200n + 50n) / 100n;
    return {
      month,
      period_id: month === 8 ? PERIOD_AUG : `period-${month}`,
      fact_revenue_uzs: revenue,
      ownership_percent: '2.00',
      calculated_share_uzs: `${monthShare / 100n}.${String(monthShare % 100n).padStart(2, '0')}`,
      paid_uzs: month === 8 ? paid : 0n,
      open_uzs: month === 8 ? open : 0n,
    };
  });
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST,
    investor_id: INVESTOR_A,
    investor_name: 'Ali Valiyev',
    period_id: PERIOD_AUG,
    year: 2026,
    month: 8,
    requested_amount_uzs: 6_056_829n,
    calculated_share_uzs: '6056829.42',
    fact_revenue_uzs: 302_841_471n,
    ownership_percent: '2.00',
    status: 'pending',
    investor_note: null,
    decision_note: null,
    decided_at: null,
    decided_by_name: null,
    paid_on: null,
    created_at: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

interface Options {
  paid?: bigint;
  open?: bigint;
  /** Fact revenue per month, for partial-year and missing-month cases. */
  fact?: Record<number, bigint>;
  /** The view returns zero before this investor's capital start month. */
  startMonth?: number;
  request?: Record<string, unknown>;
  /** Rows a UPDATE reports having changed — 0 means someone got there first. */
  updated?: number;
  mineThrows?: boolean;
}

function build(options: Options = {}) {
  const executeRaw = vi.fn().mockResolvedValue(options.updated ?? 1);
  const events = {
    createInTransaction: vi.fn().mockResolvedValue({ id: 'evt', deduplicated: false }),
  };

  const route = (sql: string) => {
    // Both share queries name the view; only the yearly one groups, so the
    // aggregate has to be matched first or it gets the monthly rows.
    if (sql.includes('GROUP BY s.investor_id')) {
      const rows = shareRows(
        options.paid ?? 0n,
        options.open ?? 0n,
        options.fact,
        options.startMonth,
      );
      return Promise.resolve([
        {
          investor_id: INVESTOR_A,
          ownership_percent: '2.00',
          fact_revenue_uzs: rows.reduce((sum, row) => sum + row.fact_revenue_uzs, 0n),
          paid_uzs: rows.reduce((sum, row) => sum + row.paid_uzs, 0n),
          open_uzs: rows.reduce((sum, row) => sum + row.open_uzs, 0n),
        },
      ]);
    }
    if (sql.includes('v_investor_period_share'))
      return Promise.resolve(
        shareRows(options.paid ?? 0n, options.open ?? 0n, options.fact, options.startMonth),
      );
    if (sql.includes('INSERT INTO fincore.investor_payout_requests'))
      return Promise.resolve([{ id: REQUEST }]);
    if (sql.includes('INSERT INTO fincore.investor_payments'))
      return Promise.resolve([{ id: 'payment-1' }]);
    if (sql.includes('investor_payout_requests'))
      return Promise.resolve([requestRow(options.request)]);
    return Promise.resolve([]);
  };
  const queryRaw = vi.fn((strings: TemplateStringsArray) =>
    route(Array.isArray(strings) ? strings.join(' ') : String(strings)),
  );

  const prisma = {
    db: {
      accounting_periods: { findUnique: vi.fn().mockResolvedValue({ year: 2026, month: 8 }) },
      $queryRaw: queryRaw,
    },
    withActor: vi.fn(async (_token: string, work: (tx: unknown) => Promise<unknown>) =>
      work({ $queryRaw: queryRaw, $executeRaw: executeRaw }),
    ),
  } as unknown as PrismaService;

  const investors = {
    list: vi.fn(async (user: AuthenticatedUser) => {
      if (!user.permissions.includes('investor.view_all'))
        throw new ApiException(403, 'FORBIDDEN', 'Ruxsat yo‘q.');
      return [PROFILE_A];
    }),
    mine: vi.fn(async () => {
      if (options.mineThrows) throw Object.assign(new Error('no profile'), { status: 404 });
      return PROFILE_A;
    }),
    requireReadableProfile: vi.fn().mockResolvedValue(PROFILE_A),
  } as unknown as InvestorsService;

  const actor = { mint: vi.fn().mockReturnValue('token') } as unknown as ActorContextService;
  const service = new InvestorPayoutsService(
    prisma,
    actor,
    investors,
    events as unknown as NotificationEventsService,
  );
  return { service, prisma, events, executeRaw, queryRaw, investors };
}

// ---------------------------------------------------------------- the share

describe('InvestorPayoutsService — the share', () => {
  it('serves the worked example unchanged', async () => {
    const { service } = build();
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    const august = summary.months.find((row) => row.month === 8)!;

    expect(august.factRevenueUzs).toBe('302841471');
    expect(august.ownershipPercent).toBe(2);
    expect(august.shareUzs).toBe('6056829.42');
    expect(august.payableUzs).toBe('6056829');
  });

  it('sums the year from its months rather than storing a total', async () => {
    const { service } = build();
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.annual.shareUzs).toBe('6056829.42');
    expect(summary.annual.factRevenueUzs).toBe('302841471');
  });

  it('reduces what is available by payments already made', async () => {
    const { service } = build({ paid: 4_000_000n });
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    const august = summary.months.find((row) => row.month === 8)!;
    expect(august.paidUzs).toBe('4000000.00');
    expect(august.remainingUzs).toBe('2056829.42');
  });

  it('reduces it by requests that are open but not yet paid', async () => {
    const { service } = build({ open: 1_000_000n });
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    const august = summary.months.find((row) => row.month === 8)!;
    expect(august.openUzs).toBe('1000000.00');
    expect(august.payableUzs).toBe('5056829');
  });

  it('returns twelve months, including the empty ones', async () => {
    const { service } = build();
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]!.shareUzs).toBe('0.00');
  });

  it('routes the read through the shared investor read rule', async () => {
    const { service, investors } = build();
    await service.summary(director(), INVESTOR_A, 2026);
    // Not a second, looser copy of "who may read this investor".
    expect(investors.requireReadableProfile).toHaveBeenCalledWith(expect.anything(), INVESTOR_A);
  });

  it('resolves "my share" from the session, not from a parameter', async () => {
    const { service, investors } = build();
    await service.mySummary(investor(), 2026);
    expect(investors.mine).toHaveBeenCalledTimes(1);
  });
});

describe('InvestorPayoutsService — the director list', () => {
  it('gives each investor their yearly share', async () => {
    const { service } = build();
    const rows = await service.list(director(), 2026);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: INVESTOR_A,
      annual: { factRevenueUzs: '302841471', shareUzs: '6056829.42' },
    });
  });

  it('subtracts payments and open requests from what is left', async () => {
    const { service } = build({ paid: 1_000_000n, open: 2_000_000n });
    const rows = await service.list(director(), 2026);

    expect(rows[0]!.annual).toMatchObject({
      paidUzs: '1000000.00',
      openUzs: '2000000.00',
      remainingUzs: '3056829.42',
    });
  });

  it('defers to the shared read rule rather than checking permissions twice', async () => {
    const { service, investors } = build();
    await expect(service.list(investor(), 2026)).rejects.toMatchObject({ status: 403 });
    expect(investors.list).toHaveBeenCalledTimes(1);
  });

  it('agrees with the single-investor summary it links to', async () => {
    // The list and the detail page must never show different figures.
    const { service } = build();
    const [row] = await service.list(director(), 2026);
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(row!.annual).toEqual(summary.annual);
  });
});

describe('InvestorPayoutsService — the annual calculation', () => {
  const million = (n: number) => BigInt(n) * 1_000_000n;

  it('aggregates the year from its months', async () => {
    const { service } = build({ fact: { 1: million(100), 2: million(200), 3: million(300) } });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.annual.factRevenueUzs).toBe('600000000');
    expect(summary.annual.shareUzs).toBe('12000000.00');
  });

  it('agrees with the sum of the monthly fact revenue', async () => {
    const { service } = build({ fact: { 1: million(100), 5: million(250), 9: million(333) } });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    const monthlyTotal = summary.months.reduce(
      (total, row) => total + BigInt(row.factRevenueUzs),
      0n,
    );
    expect(String(monthlyTotal)).toBe(summary.annual.factRevenueUzs);
  });

  it('applies the percentage once rather than adding rounded months', async () => {
    // Twelve months of 1 so'm at 2%: each month rounds to 0.02, so adding the
    // months gives 0.24. The year is 12 so'm at 2% = 0.24 here, but the rule is
    // what matters, so this also checks the half-tiyin case below.
    const { service } = build({
      fact: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1n])),
    });
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.annual.factRevenueUzs).toBe('12');
    expect(summary.annual.shareUzs).toBe('0.24');
  });

  it('calculates a partial year from the months that exist', async () => {
    // January to August only; nothing is required to fill the rest.
    const fact = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [index + 1, million(50)]),
    );
    const { service } = build({ fact });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.annual.factRevenueUzs).toBe('400000000');
    expect(summary.annual.shareUzs).toBe('8000000.00');
    expect(summary.months).toHaveLength(12);
  });

  it('excludes every month before the immutable investor start month', async () => {
    const { service } = build({
      startMonth: 8,
      fact: { 7: million(900), 8: 302_841_471n, 9: 11_000_000n },
    });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.months[6]!.factRevenueUzs).toBe('0');
    expect(summary.months[7]!.factRevenueUzs).toBe('302841471');
    expect(summary.months[8]!.factRevenueUzs).toBe('11000000');
    expect(summary.annual.factRevenueUzs).toBe('313841471');
    expect(summary.annual.shareUzs).toBe('6276829.42');
  });

  it('treats a missing month as zero, not as an error', async () => {
    const { service } = build({ fact: { 1: million(100), 3: million(300) } });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.annual.factRevenueUzs).toBe('400000000');
    expect(summary.months[1]!.factRevenueUzs).toBe('0');
    expect(summary.months[1]!.shareUzs).toBe('0.00');
  });

  it('is zero for a year with no revenue', async () => {
    const { service } = build({ fact: {} });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.annual).toMatchObject({
      factRevenueUzs: '0',
      shareUzs: '0.00',
      payableUzs: '0',
      residualUzs: '0.00',
      isSettled: true,
    });
  });

  it('never reports a negative annual share', async () => {
    const { service } = build({ fact: {}, paid: 5_000_000n });
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.annual.shareUzs).toBe('0.00');
    expect(BigInt(summary.annual.payableUzs)).toBe(0n);
  });

  it('separates the residual from the payable amount', async () => {
    const { service } = build();
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.annual).toMatchObject({
      shareUzs: '6056829.42',
      payableUzs: '6056829',
      residualUzs: '0.42',
    });
  });

  it('uses the ownership percentage, never a payment percentage', async () => {
    // 80% of the share is already paid; the year's share must still be 2% of
    // revenue, not 80% of anything.
    const { service } = build({ paid: 4_845_463n });
    const summary = await service.summary(director(), INVESTOR_A, 2026);
    expect(summary.annual.shareUzs).toBe('6056829.42');
    expect(summary.investor.ownershipPercent).toBe(2);
  });

  it('keeps a very large year exact', async () => {
    const fact = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [index + 1, 999_999_999_999n]),
    );
    const { service } = build({ fact });
    const summary = await service.summary(director(), INVESTOR_A, 2026);

    expect(summary.annual.factRevenueUzs).toBe('11999999999988');
    expect(summary.annual.shareUzs).toBe('239999999999.76');
  });

  it('refuses an investor reading another investor\u2019s year', async () => {
    const { service, investors } = build();
    vi.mocked(investors.requireReadableProfile).mockRejectedValue(
      new ApiException(403, 'FORBIDDEN', 'Ruxsat yo‘q.'),
    );
    await expect(service.summary(investor(), INVESTOR_B, 2026)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('refuses a role holding no investor permission', async () => {
    const { service, investors } = build();
    vi.mocked(investors.requireReadableProfile).mockRejectedValue(
      new ApiException(403, 'FORBIDDEN', 'Ruxsat yo‘q.'),
    );
    const cashier = investor({ permissions: ['expense.create'] });
    await expect(service.summary(cashier, INVESTOR_A, 2026)).rejects.toMatchObject({ status: 403 });
  });

  it('lets a director read it', async () => {
    const { service } = build();
    await expect(service.summary(director(), INVESTOR_A, 2026)).resolves.toMatchObject({
      annual: { shareUzs: '6056829.42' },
    });
  });

  it('reads the year in one query, not one per month', async () => {
    const { service, queryRaw } = build();
    await service.summary(director(), INVESTOR_A, 2026);

    const shareQueries = queryRaw.mock.calls.filter((call) =>
      String(call[0]?.join?.('?') ?? '').includes('v_investor_period_share'),
    );
    expect(shareQueries).toHaveLength(1);
  });

  it('reads the director list in one query, not one per investor', async () => {
    const { service, queryRaw } = build();
    await service.list(director(), 2026);

    const shareQueries = queryRaw.mock.calls.filter((call) =>
      String(call[0]?.join?.('?') ?? '').includes('v_investor_period_share'),
    );
    expect(shareQueries).toHaveLength(1);
  });
});

// ------------------------------------------------------------------- asking

describe('InvestorPayoutsService — raising a request', () => {
  it('accepts a request within what is available', async () => {
    const { service, prisma } = build();
    const created = await service.request(investor(), {
      periodId: PERIOD_AUG,
      amountUzs: '6056829',
    });
    expect(created.id).toBe(REQUEST);
    expect(prisma.withActor).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller without investor.settlement.request', async () => {
    const { service } = build();
    await expectMissingPermission(
      service.request(investor({ permissions: ['investor.view_own'] }), {
        periodId: PERIOD_AUG,
        amountUzs: '1000',
      }),
      'investor.settlement.request',
    );
  });

  it('refuses a director, who may approve but not ask', async () => {
    const { service } = build();
    await expect(
      service.request(director(), { periodId: PERIOD_AUG, amountUzs: '1000' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('takes the investor from the session — there is no id to tamper with', async () => {
    const { service, investors, queryRaw } = build();
    await service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '1000' });

    expect(investors.mine).toHaveBeenCalledTimes(1);
    // The id bound into the INSERT is the session's profile, full stop.
    const insert = queryRaw.mock.calls.find((call) =>
      String(call[0]?.join?.('?') ?? '').includes('INSERT INTO fincore.investor_payout_requests'),
    );
    expect(insert?.slice(1)).toContain(INVESTOR_A);
    expect(insert?.slice(1)).not.toContain(INVESTOR_B);
  });

  it('refuses more than the period still allows', async () => {
    const { service } = build();
    await expect(
      service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '6056830' }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_EXCEEDS_AVAILABLE' });
  });

  it('refuses a period that is fully settled', async () => {
    const { service } = build({ paid: 6_056_829n });
    await expect(
      service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '1' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_NOTHING_AVAILABLE' });
  });

  it('refuses a zero amount', async () => {
    const { service } = build();
    await expect(
      service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '0' }),
    ).rejects.toMatchObject({ status: 422, code: 'AMOUNT_INVALID' });
  });

  it('refuses a caller with no investor profile', async () => {
    const { service } = build({ mineThrows: true });
    await expect(
      service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '1000' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('raises the director notification inside the same transaction', async () => {
    const { service, events } = build();
    await service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '6056829' });

    expect(events.createInTransaction).toHaveBeenCalledTimes(1);
    const [tx, input] = events.createInTransaction.mock.calls[0]!;
    // The transaction client, not a fresh connection: a rolled-back request
    // must not leave a notification behind.
    expect(tx).toHaveProperty('$executeRaw');
    expect(input).toMatchObject({
      eventType: 'investor_payout.requested',
      payload: { investorId: INVESTOR_A, requestedAmountUzs: '6056829' },
    });
  });

  it('keeps the investor’s name and stake out of the notification payload', async () => {
    const { service, events } = build();
    await service.request(investor(), { periodId: PERIOD_AUG, amountUzs: '6056829' });
    const payload = events.createInTransaction.mock.calls[0]![1].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'investorId',
      'periodId',
      'requestId',
      'requestedAmountUzs',
    ]);
  });
});

// ----------------------------------------------------------------- deciding

describe('InvestorPayoutsService — the decision', () => {
  it('lets a director approve', async () => {
    const { service, executeRaw } = build();
    await service.decide(director(), REQUEST, { decision: 'approved' });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses an investor deciding their own request', async () => {
    const { service } = build();
    await expectMissingPermission(
      service.decide(investor(), REQUEST, { decision: 'approved' }),
      'investor.settlement.approve',
    );
  });

  it('refuses a rejection with no reason', async () => {
    const { service } = build();
    await expect(
      service.decide(director(), REQUEST, { decision: 'rejected' }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_REASON_REQUIRED' });
    await expect(
      service.decide(director(), REQUEST, { decision: 'rejected', note: '   ' }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_REASON_REQUIRED' });
  });

  it('accepts a rejection that carries one', async () => {
    const { service, executeRaw } = build();
    await service.decide(director(), REQUEST, {
      decision: 'rejected',
      note: 'Byudjet yetarli emas',
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses a second decision on the same request', async () => {
    const { service } = build({ request: { status: 'approved' } });
    await expect(
      service.decide(director(), REQUEST, { decision: 'rejected', note: 'fikr o‘zgardi' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_NOT_PENDING' });
  });

  it('tells the investor, in the same transaction', async () => {
    const { service, events } = build();
    await service.decide(director(), REQUEST, { decision: 'approved' });
    expect(events.createInTransaction.mock.calls[0]![1]).toMatchObject({
      eventType: 'investor_payout.decided',
      payload: { decision: 'approved' },
    });
  });

  it('keeps the rejection reason out of the notification', async () => {
    const { service, events } = build();
    await service.decide(director(), REQUEST, { decision: 'rejected', note: 'shaxsiy sabab' });
    const payload = JSON.stringify(events.createInTransaction.mock.calls[0]![1].payload);
    expect(payload).not.toContain('shaxsiy sabab');
  });
});

// -------------------------------------------------------------------- paying

describe('InvestorPayoutsService — paying', () => {
  const approved = { request: { status: 'approved' } };

  it('records the payment and binds it to the request', async () => {
    const { service, queryRaw, executeRaw } = build(approved);
    await service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' });

    const insertedPayment = queryRaw.mock.calls.some((call) =>
      String(call[0]?.join?.('?') ?? '').includes('INSERT INTO fincore.investor_payments'),
    );
    expect(insertedPayment).toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller without investor.settlement.pay', async () => {
    const { service } = build(approved);
    await expectMissingPermission(
      service.markPaid(director({ permissions: ['investor.settlement.approve'] }), REQUEST, {
        paidOn: '2026-08-31',
      }),
      'investor.settlement.pay',
    );
  });

  it('refuses paying a request nobody approved', async () => {
    const { service } = build();
    await expect(
      service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_NOT_APPROVED' });
  });

  it('refuses paying an already paid request', async () => {
    const { service } = build({ request: { status: 'paid' } });
    await expect(
      service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_NOT_APPROVED' });
  });

  it('refuses a payment date outside the requested period', async () => {
    // investor_payments derives its period from paid_on, so a September date
    // would file the money against the wrong month.
    const { service } = build(approved);
    await expect(
      service.markPaid(director(), REQUEST, { paidOn: '2026-09-01' }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_DATE_OUTSIDE_PERIOD' });
    await expect(
      service.markPaid(director(), REQUEST, { paidOn: '2025-08-31' }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_DATE_OUTSIDE_PERIOD' });
  });

  it('pays exactly what was requested, never a figure from the request body', async () => {
    const { service, queryRaw } = build(approved);
    await service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' });
    const insert = queryRaw.mock.calls.find((call) =>
      String(call[0]?.join?.('?') ?? '').includes('INSERT INTO fincore.investor_payments'),
    );
    expect(insert?.slice(1)).toContain(6_056_829n);
  });

  it('loses the race rather than paying twice when two directors act at once', async () => {
    // The UPDATE is conditioned on status = 'approved'; the loser changes no row.
    const { service } = build({ ...approved, updated: 0 });
    await expect(
      service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_ALREADY_SETTLED' });
  });

  it('announces the payment in the same transaction', async () => {
    const { service, events } = build(approved);
    await service.markPaid(director(), REQUEST, { paidOn: '2026-08-31' });
    expect(events.createInTransaction.mock.calls[0]![1]).toMatchObject({
      eventType: 'investor_payout.paid',
      payload: { paidAmountUzs: '6056829', paidOn: '2026-08-31' },
    });
  });
});

// ---------------------------------------------------------------- cancelling

describe('InvestorPayoutsService — cancelling', () => {
  it('lets the investor withdraw their own pending request', async () => {
    const { service, executeRaw } = build();
    await service.cancel(investor(), REQUEST, {});
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('lets them withdraw an approved one that has not been paid', async () => {
    const { service, executeRaw } = build({ request: { status: 'approved' } });
    await service.cancel(investor(), REQUEST, {});
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses withdrawing a paid request', async () => {
    const { service } = build({ request: { status: 'paid' } });
    await expect(service.cancel(investor(), REQUEST, {})).rejects.toMatchObject({
      status: 409,
      code: 'PAYOUT_NOT_CANCELLABLE',
    });
  });

  it('refuses cancelling somebody else’s request', async () => {
    const { service } = build({ request: { investor_id: INVESTOR_B } });
    await expect(service.cancel(investor(), REQUEST, {})).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a director cancelling on the investor’s behalf', async () => {
    // A director rejects; only the investor withdraws. Blurring the two would
    // erase who actually backed out.
    const { service } = build({ mineThrows: true });
    await expect(service.cancel(director(), REQUEST, {})).rejects.toMatchObject({ status: 403 });
  });
});

// ------------------------------------------------------------------- queuing

describe('InvestorPayoutsService — the director queue', () => {
  it('lists requests awaiting a decision', async () => {
    const { service } = build();
    const queue = await service.queue(director());
    expect(queue[0]).toMatchObject({ id: REQUEST, status: 'pending' });
  });

  it('reads durable identity names instead of depending on a live login account', async () => {
    const { service, queryRaw } = build();
    await service.queue(director());

    const sql = queryRaw.mock.calls.map((call) => String(call[0]?.join?.('?') ?? '')).join('\n');
    expect(sql).toContain('fincore.user_identities identity');
    expect(sql).toContain('fincore.user_identities decider');
    expect(sql).not.toContain('LEFT JOIN fincore.users');
  });

  it('allows a read-only owner with investor.view_all', async () => {
    const { service } = build();
    const queue = await service.queue(director({ permissions: ['investor.view_all'] }));
    expect(queue[0]).toMatchObject({ id: REQUEST, status: 'pending' });
  });

  it('refuses a caller without investor.view_all', async () => {
    const { service } = build();
    await expectMissingPermission(service.queue(investor()), 'investor.view_all');
  });

  it('shows a dash where the investor account was deleted', async () => {
    const { service } = build({ request: { investor_name: null } });
    const queue = await service.queue(director());
    expect(queue[0]!.investorName).toBe('—');
  });
});

// ---------------------------------------------------- database error mapping

describe('InvestorPayoutsService — database guards become sentences', () => {
  const failing = (message: string) => {
    const { service, prisma } = build();
    vi.mocked(prisma.withActor).mockRejectedValue(new Error(message));
    return service;
  };

  it('maps the open-request index', async () => {
    await expect(
      failing(
        'duplicate key value violates unique constraint "investor_payout_requests_open_unique"',
      ).request(investor(), { periodId: PERIOD_AUG, amountUzs: '1000' }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_ALREADY_REQUESTED' });
  });

  it('maps the payment-uniqueness index', async () => {
    await expect(
      failing('violates unique constraint "investor_payout_requests_payment_unique"').request(
        investor(),
        {
          periodId: PERIOD_AUG,
          amountUzs: '1000',
        },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_ALREADY_SETTLED' });
  });

  it('maps the share ceiling', async () => {
    await expect(
      failing('violates check constraint "investor_payout_within_share"').request(investor(), {
        periodId: PERIOD_AUG,
        amountUzs: '1000',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'PAYOUT_EXCEEDS_AVAILABLE' });
  });

  it('maps an illegal transition', async () => {
    await expect(
      failing('payout request cannot move from paid to approved').request(investor(), {
        periodId: PERIOD_AUG,
        amountUzs: '1000',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_STATE_INVALID' });
  });

  it('maps an attempt to rewrite a request', async () => {
    await expect(
      failing("a payout request's facts are immutable once raised").request(investor(), {
        periodId: PERIOD_AUG,
        amountUzs: '1000',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'PAYOUT_IMMUTABLE' });
  });

  it('leaves an unrecognised failure alone rather than mislabelling it', async () => {
    await expect(
      failing('connection terminated unexpectedly').request(investor(), {
        periodId: PERIOD_AUG,
        amountUzs: '1000',
      }),
    ).rejects.toThrow('connection terminated unexpectedly');
  });
});
