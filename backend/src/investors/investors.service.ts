import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';
import { MONTHS_UZ, toBigInt } from '@/reports/report-math';
import { settle, settleTotal, toOwnershipPercent, type Settlement } from './investor-math';
import type {
  InvestorCreateDto,
  InvestorEntitlementDto,
  InvestorPaymentDto,
  InvestorUpdateDto,
  ReversePaymentDto,
} from './dto/investor.dto';

export interface InvestorRef {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  ownershipPercent: number;
  branch: { id: string; code: string; name: string } | null;
  isActive: boolean;
  capitalContribution?: {
    amountUzs: string;
    startPeriod: { id: string; year: number; month: number; label: string };
    paymentMethod: { id: string; code: 'CASH' | 'CARD' | 'BANK_TRANSFER'; name: string };
  } | null;
}

export interface InvestorMonthRow {
  month: number;
  label: string;
  periodId: string | null;
  settlement: Settlement;
  paymentCount: number;
}

export interface InvestorDashboard {
  investor: InvestorRef;
  year: number;
  /** Sum of the twelve rows below — never a separately stored total. */
  annual: Settlement;
  months: InvestorMonthRow[];
  payments: Array<{
    id: string;
    paidOn: string;
    amountUzs: string;
    status: 'posted' | 'reversed';
    note: string | null;
    reversalReason: string | null;
    createdAt: string;
  }>;
}

interface AggregateRow {
  month: number;
  period_id: string | null;
  entitled: bigint | null;
  paid: bigint | null;
  payment_count: bigint | null;
}

@Injectable()
export class InvestorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  // ---------------------------------------------------------------- reading

  /** Every investor with their totals for one year. Requires investor.view_all. */
  async list(
    user: AuthenticatedUser,
    year: number,
  ): Promise<Array<InvestorRef & { annual: Settlement }>> {
    this.assertViewAll(user);
    const profiles = await this.loadProfiles();
    const visible = profiles.filter((profile) => this.isVisible(user, profile));

    return Promise.all(
      visible.map(async (profile) => ({
        ...profile,
        annual: settleTotal((await this.aggregate(profile.id, year)).map(toPair)),
      })),
    );
  }

  /**
   * The full dashboard for one investor. A caller without investor.view_all may
   * read exactly one profile — their own — so the id in the URL can never be
   * swapped for someone else's.
   */
  async dashboard(
    user: AuthenticatedUser,
    investorId: string,
    year: number,
  ): Promise<InvestorDashboard> {
    const investor = await this.requireReadable(user, investorId);
    const rows = await this.aggregate(investor.id, year);

    const months: InvestorMonthRow[] = rows.map((row) => ({
      month: row.month,
      label: MONTHS_UZ[row.month - 1] ?? String(row.month),
      periodId: row.period_id,
      settlement: settle(toBigInt(row.entitled), toBigInt(row.paid)),
      paymentCount: Number(row.payment_count ?? 0n),
    }));

    return {
      investor,
      year,
      annual: settleTotal(rows.map(toPair)),
      months,
      payments: await this.paymentHistory(investor.id, year),
    };
  }

  /** Resolves the caller's own investor profile id, for the investor role's landing page. */
  async mine(user: AuthenticatedUser): Promise<InvestorRef> {
    const profile = (await this.loadProfiles()).find((row) => row.userId === user.id);
    if (!profile)
      throw new ApiException(
        404,
        'INVESTOR_NOT_FOUND',
        'Sizga biriktirilgan investor profili yo‘q.',
      );
    return profile;
  }

  // ---------------------------------------------------------------- writing

  async create(user: AuthenticatedUser, input: InvestorCreateDto): Promise<InvestorRef> {
    this.assertManage(user);
    await this.assertPercentInRange(input.ownershipPercent);
    if (input.branchId) await this.assertBranchWritable(user, input.branchId);

    const existing = await this.prisma.db.investor_profiles.count({
      where: { user_id: input.userId },
    });
    if (existing > 0)
      throw new ApiException(
        409,
        'INVESTOR_EXISTS',
        'Bu foydalanuvchi allaqachon investor sifatida qayd etilgan.',
      );

    const created = await this.prisma
      .withActor(this.actor.mint(user.id), (tx) =>
        tx.investor_profiles.create({
          data: {
            user_id: input.userId,
            ownership_percent: input.ownershipPercent,
            branch_id: input.branchId ?? null,
            note: input.note ?? null,
            created_by: user.id,
          },
          select: { id: true },
        }),
      )
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireReadable(user, created.id);
  }

  async update(
    user: AuthenticatedUser,
    investorId: string,
    input: InvestorUpdateDto,
  ): Promise<InvestorRef> {
    this.assertManage(user);
    await this.requireProfile(investorId);
    if (input.ownershipPercent !== undefined)
      await this.assertPercentInRange(input.ownershipPercent);
    if (input.branchId) await this.assertBranchWritable(user, input.branchId);

    await this.prisma
      .withActor(this.actor.mint(user.id), (tx) =>
        tx.investor_profiles.update({
          where: { id: investorId },
          data: {
            ...(input.ownershipPercent !== undefined
              ? { ownership_percent: input.ownershipPercent }
              : {}),
            ...(input.branchId !== undefined ? { branch_id: input.branchId } : {}),
            ...(input.note !== undefined ? { note: input.note } : {}),
            ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          },
        }),
      )
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.requireReadable(user, investorId);
  }

  /** Records what the investor is owed for one period. Re-sending replaces the figure. */
  async setEntitlement(
    user: AuthenticatedUser,
    investorId: string,
    input: InvestorEntitlementDto,
  ): Promise<InvestorDashboard> {
    this.assertManage(user);
    await this.requireProfile(investorId);
    const period = await this.requirePeriod(input.periodId);
    const amount = BigInt(input.entitledAmountUzs);

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        await tx.$executeRaw`
          INSERT INTO fincore.investor_entitlements
            (investor_id, accounting_period_id, entitled_amount_uzs, note, created_by, updated_by)
          VALUES (${investorId}::uuid, ${input.periodId}::uuid, ${amount}, ${input.note ?? null}, ${user.id}::uuid, ${user.id}::uuid)
          ON CONFLICT (investor_id, accounting_period_id) DO UPDATE
            SET entitled_amount_uzs = EXCLUDED.entitled_amount_uzs,
                note                = EXCLUDED.note,
                updated_by          = EXCLUDED.updated_by
        `;
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.dashboard(user, investorId, period.year);
  }

  /** Appends a payment. The period is derived from paid_on by the database trigger. */
  async recordPayment(
    user: AuthenticatedUser,
    investorId: string,
    input: InvestorPaymentDto,
  ): Promise<InvestorDashboard> {
    this.assertManage(user);
    await this.requireProfile(investorId);
    const amount = BigInt(input.amountUzs);
    if (amount <= 0n)
      throw new ApiException(422, 'AMOUNT_INVALID', 'To‘lov summasi noldan katta bo‘lishi kerak.');

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        // accounting_period_id is deliberately absent: trg_investor_payments_derive_period
        // fills it from paid_on, so a caller can never file a payment into a
        // period that disagrees with its own date.
        await tx.$executeRaw`
          INSERT INTO fincore.investor_payments
            (investor_id, paid_on, amount_uzs, note, created_by)
          VALUES (
            ${investorId}::uuid, ${input.paidOn}::date, ${amount}, ${input.note ?? null}, ${user.id}::uuid
          )
        `;
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.dashboard(user, investorId, Number(input.paidOn.slice(0, 4)));
  }

  /** The only permitted mutation of a posted payment; the row itself is never edited or deleted. */
  async reversePayment(
    user: AuthenticatedUser,
    investorId: string,
    paymentId: string,
    input: ReversePaymentDto,
  ): Promise<InvestorDashboard> {
    this.assertManage(user);
    await this.requireProfile(investorId);

    const rows = await this.prisma.db.$queryRaw<Array<{ status: string; paid_on: Date }>>`
      SELECT status::text AS status, paid_on
      FROM fincore.investor_payments
      WHERE id = ${paymentId}::uuid AND investor_id = ${investorId}::uuid
    `;
    const payment = rows[0];
    if (!payment) throw new ApiException(404, 'PAYMENT_NOT_FOUND', 'To‘lov topilmadi.');
    if (payment.status !== 'posted')
      throw new ApiException(
        409,
        'PAYMENT_ALREADY_REVERSED',
        'Bu to‘lov allaqachon bekor qilingan.',
      );

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        await tx.$executeRaw`
          UPDATE fincore.investor_payments
          SET status = 'reversed', reversal_reason = ${input.reason},
              reversed_at = now(), reversed_by = ${user.id}::uuid
          WHERE id = ${paymentId}::uuid AND status = 'posted'
        `;
      })
      .catch((error: unknown) => {
        throw this.translate(error);
      });

    return this.dashboard(user, investorId, payment.paid_on.getUTCFullYear());
  }

  // ------------------------------------------------------------- internals

  /**
   * Twelve rows, always. A month with no entitlement and no payment still
   * appears, so the year is a complete picture rather than a sparse one.
   * Reversed payments are excluded, exactly as every other FinCore aggregate
   * excludes reversed rows.
   */
  private aggregate(investorId: string, year: number): Promise<AggregateRow[]> {
    return this.prisma.db.$queryRaw<AggregateRow[]>`
      -- Every money column is cast back to bigint: SUM(bigint) is numeric in
      -- PostgreSQL, which Prisma hands back as a Decimal and which would then
      -- mix with BigInt arithmetic downstream.
      SELECT m.month::int                             AS month,
             ap.id::text                              AS period_id,
             COALESCE(e.entitled_amount_uzs, 0)::bigint AS entitled,
             COALESCE(p.paid, 0)::bigint              AS paid,
             COALESCE(p.payment_count, 0)::int        AS payment_count
      FROM generate_series(1, 12) AS m(month)
      LEFT JOIN fincore.accounting_periods ap
             ON ap.year = ${year} AND ap.month = m.month
      LEFT JOIN fincore.investor_entitlements e
             ON e.accounting_period_id = ap.id AND e.investor_id = ${investorId}::uuid
      LEFT JOIN (
        SELECT accounting_period_id,
               SUM(amount_uzs)::bigint AS paid,
               COUNT(*)::int    AS payment_count
        FROM fincore.investor_payments
        WHERE investor_id = ${investorId}::uuid AND status = 'posted'
        GROUP BY accounting_period_id
      ) p ON p.accounting_period_id = ap.id
      ORDER BY m.month
    `;
  }

  private async paymentHistory(
    investorId: string,
    year: number,
  ): Promise<InvestorDashboard['payments']> {
    const rows = await this.prisma.db.$queryRaw<
      Array<{
        id: string;
        paid_on: Date;
        amount_uzs: bigint;
        status: 'posted' | 'reversed';
        note: string | null;
        reversal_reason: string | null;
        created_at: Date;
      }>
    >`
      SELECT id::text AS id, paid_on, amount_uzs, status::text AS status, note, reversal_reason, created_at
      FROM fincore.investor_payments
      WHERE investor_id = ${investorId}::uuid
        AND EXTRACT(YEAR FROM paid_on)::int = ${year}
      ORDER BY paid_on DESC, created_at DESC
    `;
    return rows.map((row) => ({
      id: row.id,
      paidOn: row.paid_on.toISOString().slice(0, 10),
      amountUzs: toMoneyUzs(row.amount_uzs)!,
      status: row.status,
      note: row.note,
      reversalReason: row.reversal_reason,
      createdAt: toIsoDateTime(row.created_at)!,
    }));
  }

  private async loadProfiles(): Promise<InvestorRef[]> {
    const rows = await this.prisma.db.investor_profiles.findMany({
      select: {
        id: true,
        user_id: true,
        ownership_percent: true,
        is_active: true,
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    type CapitalRow = {
      investor_id: string;
      amount_uzs: bigint;
      start_period_id: string;
      year: number;
      month: number;
      payment_method_id: string;
      payment_method_code: 'CASH' | 'CARD' | 'BANK_TRANSFER';
      payment_method_name: string;
    };
    let capitalRows: CapitalRow[] = [];
    try {
      capitalRows = await this.prisma.db.$queryRaw<CapitalRow[]>`
        SELECT c.investor_id::text,
               c.amount_uzs,
               c.start_period_id::text,
               ap.year::int,
               ap.month::int,
               c.payment_method_id::text,
               pm.code AS payment_method_code,
               pm.name AS payment_method_name
        FROM fincore.investor_capital_contributions c
        JOIN fincore.accounting_periods ap ON ap.id = c.start_period_id
        JOIN fincore.payment_methods pm ON pm.id = c.payment_method_id
      `;
    } catch (error: unknown) {
      // Capital contributions were introduced by a later, optional migration.
      // Older installations must keep their existing investor read screens
      // usable until that migration is deliberately applied. Only the exact
      // PostgreSQL "undefined table" failure for this relation is tolerated;
      // every other database error remains visible.
      if (!this.isMissingCapitalContributionTable(error)) throw error;
    }
    const capitalByInvestor = new Map(capitalRows.map((row) => [row.investor_id, row]));

    const accounts = await this.prisma.db.users.findMany({
      where: { id: { in: rows.map((row) => row.user_id) } },
      select: { id: true, full_name: true, phone: true },
    });
    const byAccount = new Map(accounts.map((account) => [account.id, account]));

    // Deleting the account in Foydalanuvchilar removes the person from the
    // company, so Investorlar must stop listing them — an empty section is the
    // correct answer, not a tombstone row.
    //
    // The underlying rows are NOT deleted: investor_payments is append-only and
    // those payments really happened, so entitlements, payments and their audit
    // trail stay in the database. They are simply no longer surfaced, here or
    // through /investors/:id, which then answers INVESTOR_NOT_FOUND.
    return rows
      .filter((row) => byAccount.has(row.user_id))
      .map((row) => {
        const account = byAccount.get(row.user_id)!;
        const capital = capitalByInvestor.get(row.id);
        return {
          id: row.id,
          userId: row.user_id,
          fullName: account.full_name,
          phone: account.phone,
          ownershipPercent: toOwnershipPercent(row.ownership_percent),
          branch: row.branch,
          isActive: row.is_active,
          capitalContribution: capital
            ? {
                amountUzs: toMoneyUzs(capital.amount_uzs)!,
                startPeriod: {
                  id: capital.start_period_id,
                  year: capital.year,
                  month: capital.month,
                  label: MONTHS_UZ[capital.month - 1] ?? String(capital.month),
                },
                paymentMethod: {
                  id: capital.payment_method_id,
                  code: capital.payment_method_code,
                  name: capital.payment_method_name,
                },
              }
            : null,
        };
      });
  }

  /** A branch-scoped investor is only visible to a reader who may read that branch. */
  private isVisible(user: AuthenticatedUser, profile: InvestorRef): boolean {
    if (!profile.branch) return true;
    return user.branchScopes.includes(profile.branch.id);
  }

  /**
   * The read rule for one investor, shared with InvestorPayoutsService.
   *
   * Exposed rather than duplicated: "who may look at this investor" is an
   * OR-shaped rule the guards cannot express, and a second copy of it is how a
   * module ends up quietly more permissive than the one it borrowed from.
   */
  async requireReadableProfile(user: AuthenticatedUser, investorId: string): Promise<InvestorRef> {
    return this.requireReadable(user, investorId);
  }

  private async requireReadable(user: AuthenticatedUser, investorId: string): Promise<InvestorRef> {
    const profile = (await this.loadProfiles()).find((row) => row.id === investorId);
    if (!profile) throw new ApiException(404, 'INVESTOR_NOT_FOUND', 'Investor topilmadi.');

    const isSelf = profile.userId === user.id;
    const canViewAll = user.permissions.includes('investor.view_all');

    // Self-access needs its own permission too, so removing investor.view_own
    // genuinely closes the door rather than leaving an implicit backdoor.
    if (isSelf && user.permissions.includes('investor.view_own')) return profile;
    if (!canViewAll)
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['investor.view_all'],
      });
    if (!this.isVisible(user, profile))
      throw new ApiException(
        403,
        'BRANCH_SCOPE_DENIED',
        'Bu filial investorini ko‘rish huquqi yo‘q.',
      );
    return profile;
  }

  private async requireProfile(investorId: string): Promise<void> {
    const found = await this.prisma.db.investor_profiles.count({ where: { id: investorId } });
    if (found === 0) throw new ApiException(404, 'INVESTOR_NOT_FOUND', 'Investor topilmadi.');
  }

  private async requirePeriod(periodId: string): Promise<{ year: number; month: number }> {
    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { year: true, month: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');
    return period;
  }

  private async assertPercentInRange(percent: number): Promise<void> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new ApiException(
        422,
        'OWNERSHIP_PERCENT_INVALID',
        'Ulush 0 va 100 foiz orasida bo‘lishi kerak.',
      );
  }

  /** Reuses the existing write scope rather than inventing a second rule. */
  private async assertBranchWritable(user: AuthenticatedUser, branchId: string): Promise<void> {
    if (!user.writeBranchScopes.includes(branchId))
      throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
  }

  private assertViewAll(user: AuthenticatedUser): void {
    if (!user.permissions.includes('investor.view_all'))
      throw ApiException.forbidden(undefined, { missingPermissions: ['investor.view_all'] });
  }

  private assertManage(user: AuthenticatedUser): void {
    if (!user.permissions.includes('investor.manage'))
      throw ApiException.forbidden(undefined, { missingPermissions: ['investor.manage'] });
  }

  private isMissingCapitalContributionTable(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const details = error as Error & { code?: string; meta?: { code?: string; message?: string } };
    const databaseCode = details.meta?.code ?? details.code;
    const message = `${details.message} ${details.meta?.message ?? ''}`;
    return databaseCode === '42P01' && /fincore\.investor_capital_contributions/i.test(message);
  }

  private translate(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/append-only|immutable/i.test(message))
      return new ApiException(
        409,
        'PAYMENT_IMMUTABLE',
        'To‘lov yozuvi o‘zgartirilmaydi — bekor qiling.',
      );
    if (/ownership_range/i.test(message))
      return new ApiException(
        422,
        'OWNERSHIP_PERCENT_INVALID',
        'Ulush 0 va 100 foiz orasida bo‘lishi kerak.',
      );
    if (/uzs_amount/i.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Summa noto‘g‘ri.');
    if (/foreign key|violates foreign key/i.test(message))
      return new ApiException(422, 'REFERENCE_INVALID', 'Ma’lumotnomalardan biri topilmadi.');
    return error;
  }
}

function toPair(row: AggregateRow): { entitled: bigint; paid: bigint } {
  return { entitled: toBigInt(row.entitled), paid: toBigInt(row.paid) };
}
