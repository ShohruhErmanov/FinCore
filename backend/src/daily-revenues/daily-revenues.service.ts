import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toIsoDateTime } from '@/common/serialization/financial';
import { ActorContextService, PrismaService, type PrismaTransaction } from '@/database';
import type { DailyRevenueCreateDto, DailyRevenueListQueryDto, DailyRevenueUpdateDto } from './dto/daily-revenue.dto';

/** Mirrors DailyRevenue (src/shared/types/domain.ts:229). */
export interface DailyRevenueDto {
  id: string;
  businessDate: string;
  periodId: string;
  branchId: string;
  branchName: string;
  cashUzs: string;
  cardUzs: string;
  transferUzs: string;
  totalUzs: string;
  comment: string | null;
  enteredBy: string;
  enteredByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDailyRevenues {
  items: DailyRevenueDto[];
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
}

/** Internal controller result; only `revenue` is sent on the wire. */
export interface DailyRevenueCreateResult {
  revenue: DailyRevenueDto;
  replayed: boolean;
}

/**
 * The three channels the DailyRevenue contract exposes, in the order the UI
 * shows them. PHASE 19 / DECISION 1 fixes this list: CLICK_PAYME,
 * CORPORATE_CARD and OTHER stay in the database for other callers but are
 * never reachable through this API.
 */
const CHANNELS = [
  { field: 'cashUzs', code: 'CASH' },
  { field: 'cardUzs', code: 'CARD' },
  { field: 'transferUzs', code: 'BANK_TRANSFER' },
] as const;

type ChannelField = (typeof CHANNELS)[number]['field'];
const MAX_UZS = 9_223_372_036_854_775_807n;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** daily-{branchId}-{YYYY-MM-DD} — stable across the reverse+reinsert of a PATCH. */
const ID_PATTERN =
  /^daily-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d{4}-\d{2}-\d{2})$/i;

function buildId(branchId: string, businessDate: string): string {
  return `daily-${branchId}-${businessDate}`;
}

/** Strict Gregorian date validation; PostgreSQL must never be the first validator. */
export function isValidBusinessDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

/** The reminder's default is the Tashkent business day, not the server's UTC day. */
export function currentTashkentBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

interface AggregateRow {
  branch_id: string;
  business_date: string;
  period_id: string;
  branch_name: string;
  cash_uzs: string;
  card_uzs: string;
  transfer_uzs: string;
  total_uzs: string;
  comment: string | null;
  entered_by: string;
  entered_by_name: string;
  created_at: Date;
  updated_at: Date;
}

/** A filter value of "all" or an empty string means "do not filter". */
function pick(value: string | undefined): string | undefined {
  return !value || value === 'all' ? undefined : value;
}

@Injectable()
export class DailyRevenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  // ---------------------------------------------------------------- reads --

  async list(
    user: AuthenticatedUser,
    query: DailyRevenueListQueryDto,
  ): Promise<PaginatedDailyRevenues> {
    this.assertReadPermission(user);
    const where = this.scopedWhere(user, query);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    // The mock sorts on businessDate then branchName, one direction for both.
    const ascending = (query.sort ?? 'businessDate:desc').endsWith(':asc');
    const order = ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [countRows, rows] = await Promise.all([
      this.prisma.db.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*)::bigint AS total FROM (
          SELECT 1
          FROM fincore.v_revenue_net_rows rt
          JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
          WHERE ${where}
            AND pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
          GROUP BY rt.branch_id, rt.payment_business_date
        ) grouped
      `,
      this.prisma.db.$queryRaw<AggregateRow[]>`
        ${this.selectAggregate(where)}
        ORDER BY rt.payment_business_date ${order}, b.name ${order}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return {
      items: rows.map((row) => this.toDto(row)),
      page,
      pageSize,
      total,
      nextCursor: page * pageSize < total ? String(page + 1) : null,
    };
  }

  async detail(user: AuthenticatedUser, id: string): Promise<DailyRevenueDto> {
    this.assertReadPermission(user);
    const key = this.parseId(id);
    const row = await this.loadAggregate(key.branchId, key.businessDate);
    if (!row) throw new ApiException(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (
      !user.permissions.includes('revenue.view_all_branches') &&
      !user.branchScopes.includes(row.branch_id)
    )
      throw new ApiException(
        403,
        'BRANCH_SCOPE_DENIED',
        'Bu filial ma’lumotini ko‘rish huquqi yo‘q.',
      );
    return this.toDto(row);
  }

  /**
   * Per-branch totals for one business date, used by the Telegram reminder.
   * A branch with no entry yields null — "0 so'm entered" and "nothing entered"
   * are different states and the contract keeps them apart.
   */
  async totalsByBranch(
    businessDate: string,
    branchIds: string[],
  ): Promise<Map<string, string>> {
    this.assertBusinessDate(businessDate);
    if (branchIds.length === 0) return new Map();
    const rows = await this.prisma.db.$queryRaw<Array<{ branch_id: string; total_uzs: string }>>`
      SELECT rt.branch_id::text AS branch_id, SUM(rt.amount_uzs)::text AS total_uzs
      FROM fincore.v_revenue_net_rows rt
      JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
      WHERE rt.payment_business_date = ${businessDate}::date
        AND rt.branch_id = ANY(${branchIds}::uuid[])
        AND pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
      GROUP BY rt.branch_id
    `;
    return new Map(rows.map((row) => [row.branch_id, row.total_uzs] as const));
  }

  // --------------------------------------------------------------- writes --

  async create(
    user: AuthenticatedUser,
    idempotencyKey: string | undefined,
    input: DailyRevenueCreateDto,
  ): Promise<DailyRevenueCreateResult> {
    if (!idempotencyKey || idempotencyKey !== input.idempotencyKey)
      throw new ApiException(
        422,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header va body mos bo‘lishi shart.',
      );

    const branchId = input.branchId ?? user.writeBranchScopes[0];
    if (!branchId || !user.writeBranchScopes.includes(branchId))
      throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');

    // Replaying the same key returns the day that submission produced instead
    // of a second set of transactions.
    const replay = await this.findReplayResult(user.id, idempotencyKey);
    if (replay) {
      if (!user.writeBranchScopes.includes(replay.branchId))
        throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
      return {
        revenue: replay,
        replayed: true,
      };
    }

    const amounts = this.readAmounts(input.cashUzs, input.cardUzs, input.transferUzs);
    await this.assertBranchActive(branchId);
    await this.assertPeriodOpen(input.businessDate);

    const comment = input.comment?.trim() || null;

    return this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        // The frontend's idempotency scope is actor + key. This lock also
        // serialises accidental concurrent reuse of one key for different days.
        await this.lockIdempotency(tx, user.id, idempotencyKey);
        const lockedReplay = await this.findReplayResult(user.id, idempotencyKey, tx);
        if (lockedReplay) {
          if (!user.writeBranchScopes.includes(lockedReplay.branchId))
            throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');
          return {
            revenue: lockedReplay,
            replayed: true,
          };
        }

        await this.lockDay(tx, branchId, input.businessDate);

        const existing = await tx.$queryRaw<Array<{ hit: number }>>`
          SELECT 1 AS hit FROM fincore.revenue_transactions
          WHERE branch_id = ${branchId}::uuid
            AND payment_business_date = ${input.businessDate}::date
            AND status = 'posted'
          LIMIT 1
        `;
        if (existing.length > 0)
          throw new ApiException(
            409,
            'REVENUE_DAY_EXISTS',
            'Bu kun uchun ushbu filialda tushum allaqachon kiritilgan. Mavjud yozuvni tahrirlang.',
            { revenueId: buildId(branchId, input.businessDate) },
          );

        await this.insertChannels(tx, {
          branchId,
          businessDate: input.businessDate,
          userId: user.id,
          comment,
          amounts,
          // One key per channel: revenue_transactions.idempotency_key is UNIQUE
          // where not null, so the three rows of one submission cannot share it.
          idempotencyKey,
        });
        // Build the response before commit. If the projection unexpectedly
        // fails, the write rolls back instead of committing and then returning
        // an error. A creator does not implicitly need a separate read grant.
        return {
          revenue: await this.loadWriteResult(branchId, input.businessDate, tx),
          replayed: false,
        };
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });
  }

  /**
   * revenue_transactions is append-only: the guard permits exactly one mutation,
   * posted -> reversed, with every business column unchanged. An edit is
   * therefore modelled as "reverse the day, then re-enter it" inside a single
   * transaction — either the whole day changes or none of it does. The logical
   * id (branch + business date) is unaffected by that churn.
   */
  async update(
    user: AuthenticatedUser,
    id: string,
    input: DailyRevenueUpdateDto,
  ): Promise<DailyRevenueDto> {
    // The mock accepts either permission here, and the guard can only AND, so
    // this route carries no @RequirePermissions and checks the pair itself.
    const allowed = ['revenue.edit', 'revenue.create'];
    if (!allowed.some((code) => user.permissions.includes(code)))
      throw ApiException.forbidden(undefined, { missingPermissions: allowed });

    const key = this.parseId(id);
    const current = await this.loadAggregate(key.branchId, key.businessDate);
    if (!current) throw new ApiException(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    if (!user.writeBranchScopes.includes(current.branch_id))
      throw new ApiException(403, 'BRANCH_SCOPE_DENIED', 'Filial scope mos emas.');

    await this.assertBranchActive(key.branchId);
    await this.assertPeriodOpen(key.businessDate, 'Yopilgan davrdagi tushum tahrirlanmaydi.');

    return this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        await this.lockDay(tx, key.branchId, key.businessDate);

        // PATCH accepts a partial body. Reload after the lock so omitted fields
        // cannot be merged from a stale pre-lock snapshot.
        const lockedCurrent = await this.loadAggregate(key.branchId, key.businessDate, tx);
        if (!lockedCurrent)
          throw new ApiException(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');

        const amounts = this.readAmounts(
          input.cashUzs ?? lockedCurrent.cash_uzs,
          input.cardUzs ?? lockedCurrent.card_uzs,
          input.transferUzs ?? lockedCurrent.transfer_uzs,
        );
        // An empty comment keeps the stored one, exactly as the mock does.
        const comment = input.comment?.trim() || lockedCurrent.comment;
        const reversalReason =
          'Kunlik tushum tahrirlandi — yangi qiymatlar bilan qayta kiritildi.';

        const reversals = await tx.$queryRaw<Array<{ original_transaction_id: string }>>`
          WITH reversed AS (
            UPDATE fincore.revenue_transactions rt
            SET status = 'reversed',
                reversed_at = now(),
                reversed_by = ${user.id}::uuid,
                reversal_reason = ${reversalReason}
            FROM fincore.payment_methods pm
            WHERE rt.payment_method_id = pm.id
              AND rt.branch_id = ${key.branchId}::uuid
              AND rt.payment_business_date = ${key.businessDate}::date
              AND rt.status = 'posted'
              AND pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
            RETURNING rt.id
          )
          INSERT INTO fincore.revenue_reversals (
            original_transaction_id, reason, reversed_by
          )
          SELECT id, ${reversalReason}, ${user.id}::uuid
          FROM reversed
          RETURNING original_transaction_id::text AS original_transaction_id
        `;
        // Another request reversed the day between the read and this lock.
        if (reversals.length === 0)
          throw new ApiException(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');

        await this.insertChannels(tx, {
          branchId: key.branchId,
          businessDate: key.businessDate,
          // Preserve the logical owner/cashier exactly as the frontend PATCH
          // contract does. The audit actor and reversed_by remain the editor.
          userId: lockedCurrent.entered_by,
          comment,
          amounts,
          // A PATCH carries no idempotency key of its own; leaving it null keeps
          // the unique index free for the original submission's keys.
          idempotencyKey: null,
        });

        // As with POST, prepare the response inside the transaction so an
        // edit-only actor cannot commit successfully and then receive a 403
        // from the public read endpoint.
        return this.loadWriteResult(key.branchId, key.businessDate, tx);
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });
  }

  // ------------------------------------------------------------- internals --

  private selectAggregate(where: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      SELECT
        rt.branch_id::text                          AS branch_id,
        to_char(rt.payment_business_date, 'YYYY-MM-DD') AS business_date,
        (array_agg(rt.accounting_period_id ORDER BY rt.receipt_no))[1]::text AS period_id,
        b.name                                      AS branch_name,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'CASH'), 0)::text          AS cash_uzs,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'CARD'), 0)::text          AS card_uzs,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'BANK_TRANSFER'), 0)::text AS transfer_uzs,
        SUM(rt.amount_uzs)::text                    AS total_uzs,
        (array_agg(rt.description ORDER BY rt.receipt_no))[1]   AS comment,
        history.entered_by::text                    AS entered_by,
        fincore.fn_user_identity_name(history.entered_by) AS entered_by_name,
        history.created_at                          AS created_at,
        MAX(rt.updated_at)                          AS updated_at
      FROM fincore.v_revenue_net_rows rt
      JOIN fincore.branches b       ON b.id  = rt.branch_id
      JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
      JOIN LATERAL (
        SELECT
          MIN(h.created_at) AS created_at,
          (array_agg(h.entered_by ORDER BY h.created_at, h.receipt_no))[1] AS entered_by
        FROM fincore.revenue_transactions h
        JOIN fincore.payment_methods hpm ON hpm.id = h.payment_method_id
        WHERE h.branch_id = rt.branch_id
          AND h.payment_business_date = rt.payment_business_date
          AND hpm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
      ) history ON TRUE
      WHERE ${where}
        AND pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
      GROUP BY rt.branch_id, rt.payment_business_date, b.name,
               history.entered_by, history.created_at
    `;
  }

  private scopedWhere(user: AuthenticatedUser, query: DailyRevenueListQueryDto): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

    const branch = pick(query.branch);
    const readable = user.permissions.includes('revenue.view_all_branches')
      ? null
      : user.branchScopes;

    if (branch && readable && !readable.includes(branch))
      // A branch outside the reader's scope must yield nothing, not a leak.
      parts.push(Prisma.sql`FALSE`);
    else if (branch) parts.push(Prisma.sql`rt.branch_id = ${branch}::uuid`);
    else if (readable) parts.push(Prisma.sql`rt.branch_id = ANY(${readable}::uuid[])`);

    const periodId = pick(query.periodId);
    if (periodId) parts.push(Prisma.sql`rt.accounting_period_id = ${periodId}::uuid`);
    if (query.dateFrom)
      parts.push(Prisma.sql`rt.payment_business_date >= ${query.dateFrom.slice(0, 10)}::date`);
    if (query.dateTo)
      parts.push(Prisma.sql`rt.payment_business_date <= ${query.dateTo.slice(0, 10)}::date`);

    return Prisma.join(parts, ' AND ');
  }

  private async loadAggregate(
    branchId: string,
    businessDate: string,
    tx?: PrismaTransaction,
  ): Promise<AggregateRow | undefined> {
    const where = Prisma.sql`rt.branch_id = ${branchId}::uuid AND rt.payment_business_date = ${businessDate}::date`;
    const sql = this.selectAggregate(where);
    const rows = tx
      ? await tx.$queryRaw<AggregateRow[]>(sql)
      : await this.prisma.db.$queryRaw<AggregateRow[]>(sql);
    return rows[0];
  }

  private async loadWriteResult(
    branchId: string,
    businessDate: string,
    tx?: PrismaTransaction,
  ): Promise<DailyRevenueDto> {
    const row = await this.loadAggregate(branchId, businessDate, tx);
    if (!row) throw new Error('DailyRevenue aggregate missing inside write transaction');
    return this.toDto(row);
  }

  private toDto(row: AggregateRow): DailyRevenueDto {
    return {
      id: buildId(row.branch_id, row.business_date),
      businessDate: row.business_date,
      periodId: row.period_id,
      branchId: row.branch_id,
      branchName: row.branch_name,
      cashUzs: row.cash_uzs,
      cardUzs: row.card_uzs,
      transferUzs: row.transfer_uzs,
      totalUzs: row.total_uzs,
      comment: row.comment,
      enteredBy: row.entered_by,
      enteredByName: row.entered_by_name,
      createdAt: toIsoDateTime(row.created_at)!,
      updatedAt: toIsoDateTime(row.updated_at)!,
    };
  }

  private parseId(id: string): { branchId: string; businessDate: string } {
    const match = ID_PATTERN.exec(id);
    if (!match || !isValidBusinessDate(match[2]!))
      throw new ApiException(404, 'REVENUE_NOT_FOUND', 'Kunlik tushum topilmadi.');
    return { branchId: match[1]!.toLowerCase(), businessDate: match[2]! };
  }

  /** Rejects a negative or non-integer channel and a day that adds up to zero. */
  private readAmounts(cash: string, card: string, transfer: string): Record<ChannelField, bigint> {
    const values = { cashUzs: cash, cardUzs: card, transferUzs: transfer };
    const parsed = {} as Record<ChannelField, bigint>;
    for (const channel of CHANNELS) {
      const raw = values[channel.field];
      if (!/^\d+$/.test(raw))
        throw new ApiException(
          422,
          'AMOUNT_INVALID',
          'Summalar manfiy bo‘lmagan butun so‘mda bo‘lsin.',
        );
      parsed[channel.field] = BigInt(raw);
      if (parsed[channel.field] > MAX_UZS)
        throw new ApiException(422, 'AMOUNT_INVALID', 'Summa PostgreSQL BIGINT chegarasidan oshdi.');
    }
    const total = CHANNELS.reduce((sum, channel) => sum + parsed[channel.field], 0n);
    if (total <= 0n)
      throw new ApiException(
        422,
        'AMOUNT_INVALID',
        'Kunlik jami tushum 0 dan katta bo‘lishi kerak.',
      );
    if (total > MAX_UZS)
      throw new ApiException(
        422,
        'AMOUNT_INVALID',
        'Kunlik jami summa ruxsat etilgan chegaradan oshdi.',
      );
    return parsed;
  }

  private async assertBranchActive(branchId: string): Promise<void> {
    const branch = await this.prisma.db.branches.findUnique({
      where: { id: branchId },
      select: { is_active: true },
    });
    if (!branch?.is_active)
      throw new ApiException(422, 'REFERENCE_INVALID', 'Filial topilmadi.');
  }

  /**
   * The mock requires the period to already exist; the database trigger would
   * happily create one via fn_ensure_period, so the stricter contract rule is
   * enforced here before anything is written.
   */
  private async assertPeriodOpen(businessDate: string, closedMessage?: string): Promise<void> {
    this.assertBusinessDate(businessDate);
    const parts = businessDate.split('-');
    const period = await this.prisma.db.accounting_periods.findFirst({
      where: { year: Number(parts[0]), month: Number(parts[1]) },
      select: { status: true },
    });
    if (!period)
      throw new ApiException(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
    if (period.status === 'closed')
      throw new ApiException(
        409,
        'PERIOD_LOCKED',
        closedMessage ?? 'Yopilgan davrga tushum kiritib bo‘lmaydi.',
      );
  }

  /**
   * Serialises every writer for one (branch, business date). Two concurrent
   * POSTs would otherwise both pass the duplicate check and both insert; the
   * lock is transaction-scoped, so it is released on commit or rollback and
   * needs no table of its own.
   */
  private async lockDay(
    tx: PrismaTransaction,
    branchId: string,
    businessDate: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`daily-revenue:${branchId}:${businessDate}`}, 0)
      )
    `;
  }

  private async lockIdempotency(
    tx: PrismaTransaction,
    userId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`daily-revenue-idempotency:${userId}:${idempotencyKey}`}, 0)
      )
    `;
  }

  private async insertChannels(
    tx: PrismaTransaction,
    input: {
      branchId: string;
      businessDate: string;
      userId: string;
      comment: string | null;
      amounts: Record<ChannelField, bigint>;
      idempotencyKey: string | null;
    },
  ): Promise<void> {
    for (const channel of CHANNELS) {
      const amount = input.amounts[channel.field];
      // amount_uzs is uzs_amount_positive: a zero channel is simply not a row.
      if (amount <= 0n) continue;

      await tx.$executeRaw`
        INSERT INTO fincore.revenue_transactions (
          branch_id, payment_at, time_known, amount_uzs, payment_method_id,
          collector_user_id, entered_by, entered_on_behalf, description, idempotency_key
        ) VALUES (
          ${input.branchId}::uuid,
          -- The contract carries a date, not a time. This is the local-midnight
          -- convention the column comment documents; trg_revenue_derive_period
          -- turns it back into payment_business_date and the period id.
          (${input.businessDate}::date + time '00:00') AT TIME ZONE 'Asia/Tashkent',
          false,
          ${amount},
          (SELECT id FROM fincore.payment_methods WHERE code = ${channel.code}),
          ${input.userId}::uuid,
          ${input.userId}::uuid,
          -- PHASE 19: collector = the person entering, so the on-behalf CHECK
          -- (entered_on_behalf = (entered_by <> collector_user_id)) holds.
          false,
          ${input.comment},
          ${
            input.idempotencyKey === null
              ? null
              : `${input.userId}:${input.idempotencyKey}:${channel.code}`
          }
        )
      `;
    }
  }

  /**
   * Returns the original POST snapshot from the idempotency-key rows, including
   * after those rows have been reversed by a later PATCH. This mirrors the MSW
   * contract: a replay is HTTP 200 with the first submission's money values,
   * not the resource's newest replacement values.
   */
  private async findReplayResult(
    userId: string,
    idempotencyKey: string,
    tx?: PrismaTransaction,
  ): Promise<DailyRevenueDto | undefined> {
    const keys = CHANNELS.map((channel) => `${userId}:${idempotencyKey}:${channel.code}`);
    const sql = Prisma.sql`
      SELECT
        rt.branch_id::text AS branch_id,
        to_char(rt.payment_business_date, 'YYYY-MM-DD') AS business_date,
        (array_agg(rt.accounting_period_id ORDER BY rt.receipt_no))[1]::text AS period_id,
        b.name AS branch_name,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'CASH'), 0)::text AS cash_uzs,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'CARD'), 0)::text AS card_uzs,
        COALESCE(SUM(rt.amount_uzs) FILTER (WHERE pm.code = 'BANK_TRANSFER'), 0)::text AS transfer_uzs,
        SUM(rt.amount_uzs)::text AS total_uzs,
        (array_agg(rt.description ORDER BY rt.receipt_no))[1] AS comment,
        rt.entered_by::text AS entered_by,
        fincore.fn_user_identity_name(rt.entered_by) AS entered_by_name,
        MIN(rt.created_at) AS created_at,
        MIN(rt.created_at) AS updated_at
      FROM fincore.revenue_transactions rt
      JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
      JOIN fincore.branches b ON b.id = rt.branch_id
      WHERE rt.entered_by = ${userId}::uuid
        AND rt.idempotency_key = ANY(${keys}::text[])
      GROUP BY rt.branch_id, rt.payment_business_date, b.name, rt.entered_by
      ORDER BY MIN(rt.created_at), rt.branch_id
      LIMIT 1
    `;
    const rows = tx
      ? await tx.$queryRaw<AggregateRow[]>(sql)
      : await this.prisma.db.$queryRaw<AggregateRow[]>(sql);
    return rows[0] ? this.toDto(rows[0]) : undefined;
  }

  private assertReadPermission(user: AuthenticatedUser): void {
    const allowed = ['revenue.view_own_branch', 'revenue.view_all_branches'];
    if (!allowed.some((code) => user.permissions.includes(code)))
      throw ApiException.forbidden(undefined, { missingPermissions: allowed });
  }

  private assertBusinessDate(value: string): void {
    if (!isValidBusinessDate(value))
      throw new ApiException(
        422,
        'DATE_OR_PERIOD_INVALID',
        'Sana haqiqiy va mavjud hisob davriga tegishli bo‘lishi kerak.',
      );
  }

  private translateWriteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/period .* is closed|accounting period is closed/i.test(message))
      return new ApiException(409, 'PERIOD_LOCKED', 'Yopilgan davrga tushum kiritib bo‘lmaydi.');
    if (/append-only|immutable except/i.test(message))
      return new ApiException(
        409,
        'REVENUE_IMMUTABLE',
        'Tushum yozuvi o‘zgarmas — faqat bekor qilish orqali tahrirlanadi.',
      );
    if (/idempotency_key/i.test(message))
      return new ApiException(
        409,
        'REVENUE_DAY_EXISTS',
        'Bu so‘rov allaqachon qayta ishlangan.',
      );
    if (/bigint.*range|out of range/i.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Summa ruxsat etilgan chegaradan oshdi.');
    if (/actor context|signing key/i.test(message))
      return new ApiException(
        500,
        'ACTOR_CONTEXT_INVALID',
        'Server identifikatsiya konteksti noto‘g‘ri.',
      );
    if (/foreign key|violates|invalid input/i.test(message))
      return new ApiException(422, 'REFERENCE_INVALID', 'Ma’lumotnomalardan biri topilmadi.');
    return error;
  }
}
