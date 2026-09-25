import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';
import { NotificationEventsService } from '@/notification-events/notification-events.service';
import { MONTHS_UZ, toBigInt } from '@/reports/report-math';
import { InvestorsService, type InvestorRef } from './investors.service';
import {
  annualShare,
  availability,
  formatDecimalUzs,
  fromWholeUzs,
  parseDecimalUzs,
  shareOf,
  type PayoutAvailability,
} from './payout-math';
import type {
  PayoutCancelDto,
  PayoutDecisionDto,
  PayoutMarkPaidDto,
  PayoutRequestCreateDto,
} from './dto/payout.dto';

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface PayoutRequestRow {
  id: string;
  investorId: string;
  investorName: string;
  periodId: string;
  year: number;
  month: number;
  monthLabel: string;
  requestedAmountUzs: string;
  /** What the share was when this was raised — not what it is now. */
  calculatedShareUzs: string;
  factRevenueUzs: string;
  ownershipPercent: number;
  status: PayoutStatus;
  investorNote: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  paidOn: string | null;
  createdAt: string;
}

export interface PayoutPeriodRow extends PayoutAvailability {
  month: number;
  label: string;
  periodId: string;
  factRevenueUzs: string;
  ownershipPercent: number;
  requests: PayoutRequestRow[];
}

export interface PayoutSummary {
  investor: InvestorRef;
  year: number;
  /** The sum of the months below, never a separately stored total. */
  annual: PayoutAvailability & { factRevenueUzs: string };
  months: PayoutPeriodRow[];
}

interface ShareRow {
  month: number;
  period_id: string;
  fact_revenue_uzs: bigint | null;
  ownership_percent: unknown;
  calculated_share_uzs: unknown;
  paid_uzs: bigint | null;
  open_uzs: bigint | null;
}

interface AnnualRow {
  investor_id: string;
  ownership_percent: unknown;
  fact_revenue_uzs: bigint | null;
  paid_uzs: bigint | null;
  open_uzs: bigint | null;
}

interface RequestRow {
  id: string;
  investor_id: string;
  investor_name: string | null;
  period_id: string;
  year: number;
  month: number;
  requested_amount_uzs: bigint;
  calculated_share_uzs: unknown;
  fact_revenue_uzs: bigint;
  ownership_percent: unknown;
  status: PayoutStatus;
  investor_note: string | null;
  decision_note: string | null;
  decided_at: Date | null;
  decided_by_name: string | null;
  paid_on: Date | null;
  created_at: Date;
}

/**
 * The investor's share of actual revenue, and the request -> decision -> payment
 * workflow that settles it.
 *
 * Two things this service deliberately does NOT do:
 *
 *   * it never recomputes the share in JavaScript. The number comes from
 *     fincore.v_investor_period_share, so the API, a report and a direct SQL
 *     query all answer the same thing. payout-math.ts reimplements the formula
 *     only so a test can assert the two agree.
 *   * it never takes an investor id from the caller when raising a request. The
 *     profile is resolved from the session, which is what makes requesting a
 *     payout in someone else's name impossible rather than merely forbidden.
 *
 * On the payments ledger: fincore.investor_payments is the single record of
 * money actually handed to an investor, and it is reused here rather than
 * duplicated. That means 014's entitlement view and this share view are two
 * different yardsticks measured against the same payments — which is correct,
 * because the money only left the company once.
 */
@Injectable()
export class InvestorPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly investors: InvestorsService,
    private readonly events: NotificationEventsService,
  ) {}

  // ---------------------------------------------------------------- reading

  /** One investor's profit share for a year, with every request against it. */
  async summary(user: AuthenticatedUser, investorId: string, year: number): Promise<PayoutSummary> {
    const investor = await this.investors.requireReadableProfile(user, investorId);
    const [shares, requests] = await Promise.all([
      this.shareRows(investor.id, year),
      this.requestRows({ investorId: investor.id, year }),
    ]);

    const byPeriod = new Map<string, PayoutRequestRow[]>();
    for (const request of requests) {
      const bucket = byPeriod.get(request.periodId);
      if (bucket) bucket.push(request);
      else byPeriod.set(request.periodId, [request]);
    }

    const months: PayoutPeriodRow[] = shares.map((row) => {
      const share = parseDecimalUzs(String(row.calculated_share_uzs ?? '0'));
      const paid = fromWholeUzs(toBigInt(row.paid_uzs));
      const open = fromWholeUzs(toBigInt(row.open_uzs));
      return {
        month: row.month,
        label: MONTHS_UZ[row.month - 1] ?? String(row.month),
        periodId: row.period_id,
        factRevenueUzs: String(toBigInt(row.fact_revenue_uzs)),
        ownershipPercent: Number(row.ownership_percent ?? 0),
        ...availability(share, paid, open),
        requests: byPeriod.get(row.period_id) ?? [],
      };
    });

    const monthlyFact = shares.map((row) => toBigInt(row.fact_revenue_uzs));
    const percent = this.percentOf(shares, investor);

    return {
      investor,
      year,
      // The year is its own calculation, not a total of the rounded months —
      // see annualShare() for why, and for the tiyin-level consequence.
      annual: {
        factRevenueUzs: String(monthlyFact.reduce((total, value) => total + value, 0n)),
        ...availability(
          annualShare(monthlyFact, percent),
          fromWholeUzs(shares.reduce((total, row) => total + toBigInt(row.paid_uzs), 0n)),
          fromWholeUzs(shares.reduce((total, row) => total + toBigInt(row.open_uzs), 0n)),
        ),
      },
      months,
    };
  }

  /**
   * The ownership percentage as the database spells it, so the share is never
   * computed from a JS number. The view repeats it on every month; the profile
   * is the fallback for an investor with no periods at all.
   */
  private percentOf(rows: Array<{ ownership_percent: unknown }>, investor: InvestorRef): string {
    const fromView = rows[0]?.ownership_percent;
    return fromView === undefined || fromView === null
      ? investor.ownershipPercent.toFixed(2)
      : String(fromView);
  }

  /** The investor's own share. Resolves the profile from the session. */
  async mySummary(user: AuthenticatedUser, year: number): Promise<PayoutSummary> {
    const profile = await this.investors.mine(user);
    return this.summary(user, profile.id, year);
  }

  /**
   * Every investor's yearly share, for the director's list.
   *
   * Reuses InvestorsService.list for the profiles and its authorization, so
   * "who may see which investor" stays one rule rather than two.
   */
  async list(
    user: AuthenticatedUser,
    year: number,
  ): Promise<Array<InvestorRef & { annual: PayoutSummary['annual'] }>> {
    const investors = await this.investors.list(user, year);
    // One query for the whole list: a per-investor query would be an N+1 that
    // grows with the number of investors, and the database can group this.
    const rows = await this.annualRows(
      year,
      investors.map((investor) => investor.id),
    );
    const byInvestor = new Map(rows.map((row) => [row.investor_id, row]));

    return investors.map((investor) => {
      const row = byInvestor.get(investor.id);
      const fact = toBigInt(row?.fact_revenue_uzs ?? 0n);
      return {
        ...investor,
        annual: {
          factRevenueUzs: String(fact),
          // Same rule as summary(): percentage applied once, rounded once.
          ...availability(
            shareOf(fact, this.percentOf(row ? [row] : [], investor)),
            fromWholeUzs(toBigInt(row?.paid_uzs ?? 0n)),
            fromWholeUzs(toBigInt(row?.open_uzs ?? 0n)),
          ),
        },
      };
    });
  }

  /** Everything still awaiting a director decision, across all investors. */
  async queue(user: AuthenticatedUser): Promise<PayoutRequestRow[]> {
    this.assertViewAll(user);
    return this.requestRows({ statuses: ['pending', 'approved'] });
  }

  // ---------------------------------------------------------------- writing

  async request(user: AuthenticatedUser, input: PayoutRequestCreateDto): Promise<PayoutRequestRow> {
    if (!user.permissions.includes('investor.settlement.request'))
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['investor.settlement.request'],
      });

    // The session decides whose request this is. There is no investorId on the
    // DTO to tamper with.
    const profile = await this.investors.mine(user);
    const amount = BigInt(input.amountUzs);
    if (amount <= 0n)
      throw new ApiException(
        422,
        'AMOUNT_INVALID',
        'So‘ralayotgan summa noldan katta bo‘lishi kerak.',
      );

    const period = await this.requirePeriodShare(profile.id, input.periodId);
    if (BigInt(period.payableUzs) === 0n)
      throw new ApiException(
        409,
        'PAYOUT_NOTHING_AVAILABLE',
        `${period.label} uchun so‘raladigan summa qolmagan.`,
      );
    if (amount > BigInt(period.payableUzs))
      throw new ApiException(
        422,
        'PAYOUT_EXCEEDS_AVAILABLE',
        `So‘ralgan summa qolgan summadan ko‘p. ${period.label} uchun eng ko‘pi ${period.payableUzs} so‘m.`,
      );

    const id = await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO fincore.investor_payout_requests (
            investor_id, accounting_period_id, requested_amount_uzs,
            calculated_share_uzs, fact_revenue_uzs, ownership_percent,
            investor_note, created_by
          ) VALUES (
            ${profile.id}::uuid,
            ${input.periodId}::uuid,
            ${amount},
            ${period.shareUzs}::numeric,
            ${BigInt(period.factRevenueUzs)},
            ${period.ownershipPercent},
            ${input.note ?? null},
            ${user.id}::uuid
          )
          RETURNING id::text AS id
        `;
        const created = rows[0]!;

        // Same transaction as the insert: a director is never told about a
        // request that rolled back, and a request never lands unannounced.
        await this.events.createInTransaction(tx, {
          eventType: 'investor_payout.requested',
          aggregateId: created.id,
          actorIdentityId: user.id,
          payload: {
            requestId: created.id,
            investorId: profile.id,
            periodId: input.periodId,
            requestedAmountUzs: String(amount),
          },
        });

        return created.id;
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireRequest(id);
  }

  async decide(
    user: AuthenticatedUser,
    requestId: string,
    input: PayoutDecisionDto,
  ): Promise<PayoutRequestRow> {
    this.assertApprove(user);
    const current = await this.requireRequest(requestId);
    if (current.status !== 'pending')
      throw new ApiException(
        409,
        'PAYOUT_NOT_PENDING',
        'Bu so‘rov bo‘yicha qaror allaqachon qabul qilingan.',
      );

    const note = input.note?.trim() || null;
    if (input.decision === 'rejected' && !note)
      throw new ApiException(422, 'PAYOUT_REASON_REQUIRED', 'Rad etish sababini yozing.');

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        await tx.$executeRaw`
          UPDATE fincore.investor_payout_requests
             SET status = ${input.decision}::fincore.investor_payout_status,
                 decision_note = ${note},
                 decided_at = now(),
                 decided_by = ${user.id}::uuid
           WHERE id = ${requestId}::uuid AND status = 'pending'
        `;
        await this.events.createInTransaction(tx, {
          eventType: 'investor_payout.decided',
          aggregateId: requestId,
          actorIdentityId: user.id,
          payload: {
            requestId,
            investorId: current.investorId,
            periodId: current.periodId,
            decision: input.decision,
          },
        });
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireRequest(requestId);
  }

  /**
   * Records the payment and binds it to the request in one transaction.
   *
   * The payment's period is derived from paid_on by
   * trg_investor_payments_derive_period, so a date outside the request's month
   * would produce a payment filed against a different period — which the
   * database then refuses to bind. That is checked here first, so the director
   * gets a sentence instead of a constraint name.
   */
  async markPaid(
    user: AuthenticatedUser,
    requestId: string,
    input: PayoutMarkPaidDto,
  ): Promise<PayoutRequestRow> {
    this.assertPay(user);
    const current = await this.requireRequest(requestId);
    if (current.status !== 'approved')
      throw new ApiException(
        409,
        'PAYOUT_NOT_APPROVED',
        current.status === 'paid'
          ? 'Bu so‘rov allaqachon to‘langan.'
          : 'Avval so‘rovni tasdiqlash kerak.',
      );

    const year = Number(input.paidOn.slice(0, 4));
    const month = Number(input.paidOn.slice(5, 7));
    if (year !== current.year || month !== current.month)
      throw new ApiException(
        422,
        'PAYOUT_DATE_OUTSIDE_PERIOD',
        `To‘lov sanasi so‘rov davri ichida bo‘lishi kerak (${current.monthLabel} ${current.year}).`,
      );

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        const payments = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO fincore.investor_payments
            (investor_id, paid_on, amount_uzs, note, created_by)
          VALUES (
            ${current.investorId}::uuid,
            ${input.paidOn}::date,
            ${BigInt(current.requestedAmountUzs)},
            ${input.note ?? null},
            ${user.id}::uuid
          )
          RETURNING id::text AS id
        `;
        const payment = payments[0]!;

        // WHERE status = 'approved' is the last line of defence against two
        // concurrent directors paying the same request: the second UPDATE
        // matches no row, and the guard trigger would refuse it anyway.
        const updated = await tx.$executeRaw`
          UPDATE fincore.investor_payout_requests
             SET status = 'paid', payment_id = ${payment.id}::uuid
           WHERE id = ${requestId}::uuid AND status = 'approved'
        `;
        if (updated !== 1)
          throw new ApiException(409, 'PAYOUT_ALREADY_SETTLED', 'Bu so‘rov allaqachon to‘langan.');

        await this.events.createInTransaction(tx, {
          eventType: 'investor_payout.paid',
          aggregateId: requestId,
          actorIdentityId: user.id,
          payload: {
            requestId,
            investorId: current.investorId,
            periodId: current.periodId,
            paidAmountUzs: current.requestedAmountUzs,
            paidOn: input.paidOn,
          },
        });
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireRequest(requestId);
  }

  /** An investor withdraws their own request, before or after approval. */
  async cancel(
    user: AuthenticatedUser,
    requestId: string,
    input: PayoutCancelDto,
  ): Promise<PayoutRequestRow> {
    const current = await this.requireRequest(requestId);
    const profile = await this.investors.mine(user).catch(() => null);

    const isOwner = profile?.id === current.investorId;
    if (!isOwner || !user.permissions.includes('investor.settlement.request'))
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['investor.settlement.request'],
      });

    if (current.status !== 'pending' && current.status !== 'approved')
      throw new ApiException(409, 'PAYOUT_NOT_CANCELLABLE', 'Bu so‘rovni bekor qilib bo‘lmaydi.');

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        await tx.$executeRaw`
          UPDATE fincore.investor_payout_requests
             SET status = 'cancelled',
                 decision_note = ${input.note?.trim() || null},
                 decided_at = now(),
                 decided_by = ${user.id}::uuid
           WHERE id = ${requestId}::uuid AND status IN ('pending', 'approved')
        `;
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireRequest(requestId);
  }

  // -------------------------------------------------------------- internals

  private async shareRows(investorId: string, year: number): Promise<ShareRow[]> {
    // Every money figure is cast: SUM(bigint) is numeric in PostgreSQL, and
    // mixing that with a BigInt in JS throws at runtime rather than at build.
    return this.prisma.db.$queryRaw<ShareRow[]>`
      SELECT
        s.month,
        s.accounting_period_id::text            AS period_id,
        s.fact_revenue_uzs                      AS fact_revenue_uzs,
        s.ownership_percent::text               AS ownership_percent,
        s.calculated_share_uzs::text            AS calculated_share_uzs,
        COALESCE(paid.amount, 0)::bigint        AS paid_uzs,
        COALESCE(open.amount, 0)::bigint        AS open_uzs
      FROM fincore.v_investor_period_share s
      LEFT JOIN LATERAL (
        SELECT SUM(p.amount_uzs)::bigint AS amount
        FROM fincore.investor_payments p
        WHERE p.investor_id = s.investor_id
          AND p.accounting_period_id = s.accounting_period_id
          AND p.status = 'posted'
      ) paid ON true
      LEFT JOIN LATERAL (
        SELECT SUM(r.requested_amount_uzs)::bigint AS amount
        FROM fincore.investor_payout_requests r
        WHERE r.investor_id = s.investor_id
          AND r.accounting_period_id = s.accounting_period_id
          AND r.status IN ('pending', 'approved')
      ) open ON true
      WHERE s.investor_id = ${investorId}::uuid AND s.year = ${year}
      ORDER BY s.month
    `;
  }

  /**
   * A whole year per investor, grouped in the database.
   *
   * The year filter is on accounting_periods.year through the view, not on a
   * timestamp range: periods are explicit rows, so there is no timezone edge to
   * get wrong and no month can fall on the wrong side of a boundary.
   */
  private async annualRows(year: number, investorIds: string[]): Promise<AnnualRow[]> {
    if (investorIds.length === 0) return [];
    return this.prisma.db.$queryRaw<AnnualRow[]>`
      SELECT
        s.investor_id::text                    AS investor_id,
        max(s.ownership_percent)::text         AS ownership_percent,
        COALESCE(sum(s.fact_revenue_uzs), 0)::bigint AS fact_revenue_uzs,
        COALESCE(sum(paid.amount), 0)::bigint  AS paid_uzs,
        COALESCE(sum(open.amount), 0)::bigint  AS open_uzs
      FROM fincore.v_investor_period_share s
      LEFT JOIN LATERAL (
        SELECT SUM(p.amount_uzs)::bigint AS amount
        FROM fincore.investor_payments p
        WHERE p.investor_id = s.investor_id
          AND p.accounting_period_id = s.accounting_period_id
          AND p.status = 'posted'
      ) paid ON true
      LEFT JOIN LATERAL (
        SELECT SUM(r.requested_amount_uzs)::bigint AS amount
        FROM fincore.investor_payout_requests r
        WHERE r.investor_id = s.investor_id
          AND r.accounting_period_id = s.accounting_period_id
          AND r.status IN ('pending', 'approved')
      ) open ON true
      WHERE s.year = ${year} AND s.investor_id = ANY (${investorIds}::uuid[])
      GROUP BY s.investor_id
    `;
  }

  private async requestRows(filter: {
    investorId?: string;
    year?: number;
    statuses?: PayoutStatus[];
  }): Promise<PayoutRequestRow[]> {
    const rows = await this.prisma.db.$queryRaw<RequestRow[]>`
      SELECT
        r.id::text                        AS id,
        r.investor_id::text               AS investor_id,
        identity.display_name             AS investor_name,
        r.accounting_period_id::text      AS period_id,
        ap.year,
        ap.month,
        r.requested_amount_uzs            AS requested_amount_uzs,
        r.calculated_share_uzs::text      AS calculated_share_uzs,
        r.fact_revenue_uzs                AS fact_revenue_uzs,
        r.ownership_percent::text         AS ownership_percent,
        r.status::text                    AS status,
        r.investor_note,
        r.decision_note,
        r.decided_at,
        decider.display_name              AS decided_by_name,
        pay.paid_on                       AS paid_on,
        r.created_at
      FROM fincore.investor_payout_requests r
      JOIN fincore.accounting_periods ap ON ap.id = r.accounting_period_id
      JOIN fincore.investor_profiles ip ON ip.id = r.investor_id
      LEFT JOIN fincore.user_identities identity ON identity.id = ip.user_id
      LEFT JOIN fincore.user_identities decider ON decider.id = r.decided_by
      LEFT JOIN fincore.investor_payments pay ON pay.id = r.payment_id
      WHERE (${filter.investorId ?? null}::uuid IS NULL OR r.investor_id = ${filter.investorId ?? null}::uuid)
        AND (${filter.year ?? null}::int IS NULL OR ap.year = ${filter.year ?? null}::int)
        AND (${filter.statuses ?? null}::text[] IS NULL OR r.status::text = ANY (${filter.statuses ?? null}::text[]))
      ORDER BY r.created_at DESC
    `;

    return this.mapRequests(rows);
  }

  private async requireRequest(requestId: string): Promise<PayoutRequestRow> {
    const rows = await this.prisma.db.$queryRaw<RequestRow[]>`
      SELECT
        r.id::text                        AS id,
        r.investor_id::text               AS investor_id,
        identity.display_name             AS investor_name,
        r.accounting_period_id::text      AS period_id,
        ap.year,
        ap.month,
        r.requested_amount_uzs            AS requested_amount_uzs,
        r.calculated_share_uzs::text      AS calculated_share_uzs,
        r.fact_revenue_uzs                AS fact_revenue_uzs,
        r.ownership_percent::text         AS ownership_percent,
        r.status::text                    AS status,
        r.investor_note,
        r.decision_note,
        r.decided_at,
        decider.display_name              AS decided_by_name,
        pay.paid_on                       AS paid_on,
        r.created_at
      FROM fincore.investor_payout_requests r
      JOIN fincore.accounting_periods ap ON ap.id = r.accounting_period_id
      JOIN fincore.investor_profiles ip ON ip.id = r.investor_id
      LEFT JOIN fincore.user_identities identity ON identity.id = ip.user_id
      LEFT JOIN fincore.user_identities decider ON decider.id = r.decided_by
      LEFT JOIN fincore.investor_payments pay ON pay.id = r.payment_id
      WHERE r.id = ${requestId}::uuid
    `;
    if (!rows[0])
      throw new ApiException(404, 'PAYOUT_REQUEST_NOT_FOUND', 'To‘lov so‘rovi topilmadi.');
    return this.mapRequests(rows)[0]!;
  }

  /** Shares one mapping between the list query and the single-row query. */
  private mapRequests(rows: RequestRow[]): PayoutRequestRow[] {
    return rows.map((row) => ({
      id: row.id,
      investorId: row.investor_id,
      investorName: row.investor_name ?? '—',
      periodId: row.period_id,
      year: row.year,
      month: row.month,
      monthLabel: MONTHS_UZ[row.month - 1] ?? String(row.month),
      requestedAmountUzs: String(toBigInt(row.requested_amount_uzs)),
      calculatedShareUzs: formatDecimalUzs(
        parseDecimalUzs(String(row.calculated_share_uzs ?? '0')),
      ),
      factRevenueUzs: String(toBigInt(row.fact_revenue_uzs)),
      ownershipPercent: Number(row.ownership_percent ?? 0),
      status: row.status,
      investorNote: row.investor_note,
      decisionNote: row.decision_note,
      decidedAt: row.decided_at ? toIsoDateTime(row.decided_at) : null,
      decidedByName: row.decided_by_name,
      paidOn: row.paid_on ? String(row.paid_on).slice(0, 10) : null,
      createdAt: toIsoDateTime(row.created_at) ?? '',
    }));
  }

  /** The one period a request is about, with what is still available on it. */
  private async requirePeriodShare(
    investorId: string,
    periodId: string,
  ): Promise<
    PayoutAvailability & { label: string; factRevenueUzs: string; ownershipPercent: number }
  > {
    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { year: true, month: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const rows = await this.shareRows(investorId, period.year);
    const row = rows.find((item) => item.period_id === periodId);
    if (!row)
      throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Bu davr uchun ulush ma’lumoti topilmadi.');

    const share = parseDecimalUzs(String(row.calculated_share_uzs ?? '0'));
    return {
      label: `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`,
      factRevenueUzs: String(toBigInt(row.fact_revenue_uzs)),
      ownershipPercent: Number(row.ownership_percent ?? 0),
      ...availability(
        share,
        fromWholeUzs(toBigInt(row.paid_uzs)),
        fromWholeUzs(toBigInt(row.open_uzs)),
      ),
    };
  }

  private assertApprove(user: AuthenticatedUser): void {
    if (!user.permissions.includes('investor.settlement.approve'))
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['investor.settlement.approve'],
      });
  }

  private assertViewAll(user: AuthenticatedUser): void {
    if (!user.permissions.includes('investor.view_all'))
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['investor.view_all'],
      });
  }

  private assertPay(user: AuthenticatedUser): void {
    if (!user.permissions.includes('investor.settlement.pay'))
      throw ApiException.forbidden(undefined, { missingPermissions: ['investor.settlement.pay'] });
  }

  /** Database guards speak in constraint names; users need sentences. */
  private translate(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);

    if (/investor_payout_requests_open_unique/.test(message))
      return new ApiException(
        409,
        'PAYOUT_ALREADY_REQUESTED',
        'Bu davr uchun ko‘rib chiqilmagan so‘rov allaqachon bor.',
      );
    if (/investor_payout_requests_payment_unique|payment cannot be replaced/.test(message))
      return new ApiException(409, 'PAYOUT_ALREADY_SETTLED', 'Bu so‘rov allaqachon to‘langan.');
    if (/investor_payout_within_share/.test(message))
      return new ApiException(
        422,
        'PAYOUT_EXCEEDS_AVAILABLE',
        'So‘ralgan summa hisoblangan ulushdan ko‘p.',
      );
    if (/already (paid|rejected|cancelled)|cannot move from/.test(message))
      return new ApiException(
        409,
        'PAYOUT_STATE_INVALID',
        'So‘rov holati bu amalga yo‘l qo‘ymaydi.',
      );
    if (/facts are immutable/.test(message))
      return new ApiException(409, 'PAYOUT_IMMUTABLE', 'So‘rov ma’lumotlari o‘zgartirilmaydi.');
    if (/settling payment must be/.test(message))
      return new ApiException(
        422,
        'PAYOUT_PAYMENT_MISMATCH',
        'To‘lov so‘rovga mos kelmadi — summa yoki sana tekshiring.',
      );
    if (/uzs_amount/.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Summa noto‘g‘ri.');
    return error;
  }
}
