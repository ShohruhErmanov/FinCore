import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import { ApiException } from '@/common';
import type { ActorContextService, PrismaService, PrismaTransaction } from '@/database';
import {
  currentTashkentBusinessDate,
  DailyRevenuesService,
  isValidBusinessDate,
} from './daily-revenues.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const PERIOD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const BUSINESS_DATE = '2026-08-20';
const DAILY_ID = `daily-${BRANCH_ID}-${BUSINESS_DATE}`;

interface AggregateRowFixture {
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

function aggregateRow(overrides: Partial<AggregateRowFixture> = {}): AggregateRowFixture {
  return {
    branch_id: BRANCH_ID,
    business_date: BUSINESS_DATE,
    period_id: PERIOD_ID,
    branch_name: 'Markaziy filial',
    cash_uzs: '100',
    card_uzs: '200',
    transfer_uzs: '300',
    total_uzs: '600',
    comment: 'Kunlik tushum',
    entered_by: OWNER_ID,
    entered_by_name: 'Original cashier',
    created_at: new Date('2026-08-20T05:00:00.000Z'),
    updated_at: new Date('2026-08-20T05:05:00.000Z'),
    ...overrides,
  };
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_ID,
    fullName: 'Test user',
    phone: '+998901234567',
    status: 'active',
    roles: [],
    permissions: [
      'revenue.view_own_branch',
      'revenue.view_all_branches',
      'revenue.create',
      'revenue.edit',
    ],
    branchScopes: [BRANCH_ID],
    writeBranchScopes: [BRANCH_ID],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

/**
 * Prisma's raw-query methods are template tags in some call sites and receive
 * a Prisma.Sql value in others. This renderer intentionally keeps only query
 * structure: it is used to assert safety predicates without coupling tests to
 * positional placeholder syntax ($1 vs ?).
 */
function renderSqlValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return value.map(renderSqlValue).join(',');
  if (typeof value !== 'object') return '';

  const candidate = value as {
    strings?: readonly string[];
    values?: readonly unknown[];
    sql?: string;
  };
  if (candidate.strings)
    return candidate.strings.reduce(
      (text, part, index) => text + part + renderSqlValue(candidate.values?.[index]),
      '',
    );
  return candidate.sql ?? '';
}

function renderSqlCall(call: readonly unknown[]): string {
  const [head, ...values] = call;
  if (Array.isArray(head))
    return head.reduce(
      (text, part, index) => text + String(part) + renderSqlValue(values[index]),
      '',
    );
  return renderSqlValue(head);
}

function valuesInSqlCall(call: readonly unknown[]): unknown[] {
  const [head, ...values] = call;
  if (Array.isArray(head)) return values.flatMap(valuesInSqlValue);
  return valuesInSqlValue(head);
}

function valuesInSqlValue(value: unknown): unknown[] {
  if (value === null || value === undefined) return [value];
  if (Array.isArray(value)) return value.flatMap(valuesInSqlValue);
  if (typeof value !== 'object') return [value];
  const candidate = value as { values?: readonly unknown[] };
  return candidate.values ? candidate.values.flatMap(valuesInSqlValue) : [];
}

interface Harness {
  service: DailyRevenuesService;
  dbQueryRaw: ReturnType<typeof vi.fn>;
  txQueryRaw: ReturnType<typeof vi.fn>;
  txExecuteRaw: ReturnType<typeof vi.fn>;
  branchFindUnique: ReturnType<typeof vi.fn>;
  periodFindFirst: ReturnType<typeof vi.fn>;
  withActor: ReturnType<typeof vi.fn>;
  mint: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const dbQueryRaw = vi.fn(async () => []);
  const txQueryRaw = vi.fn(async () => []);
  const txExecuteRaw = vi.fn(async () => 1);
  const branchFindUnique = vi.fn(async () => ({ is_active: true }));
  const periodFindFirst = vi.fn(async () => ({ status: 'open' }));
  const tx = {
    $queryRaw: txQueryRaw,
    $executeRaw: txExecuteRaw,
  } as unknown as PrismaTransaction;
  const withActor = vi.fn(async (_token: string, work: (client: PrismaTransaction) => Promise<unknown>) =>
    work(tx),
  );
  const prisma = {
    db: {
      $queryRaw: dbQueryRaw,
      branches: { findUnique: branchFindUnique },
      accounting_periods: { findFirst: periodFindFirst },
    },
    withActor,
  } as unknown as PrismaService;
  const mint = vi.fn(() => 'signed-actor-token');
  const actor = { mint } as unknown as ActorContextService;
  return {
    service: new DailyRevenuesService(prisma, actor),
    dbQueryRaw,
    txQueryRaw,
    txExecuteRaw,
    branchFindUnique,
    periodFindFirst,
    withActor,
    mint,
  };
}

function expectApiCode(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).getStatus()).toBe(status);
  expect((error as ApiException).code).toBe(code);
}

describe('Daily revenue date helpers', () => {
  it.each([
    ['2024-02-29', true],
    ['2025-02-29', false],
    ['2026-04-31', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-08-20', true],
    ['2026-8-20', false],
    ['not-a-date', false],
  ])('validates %s as %s before PostgreSQL sees it', (date, expected) => {
    expect(isValidBusinessDate(date)).toBe(expected);
  });

  it('uses the Asia/Tashkent calendar day across the UTC boundary', () => {
    expect(currentTashkentBusinessDate(new Date('2026-08-20T18:59:59.000Z'))).toBe(
      '2026-08-20',
    );
    expect(currentTashkentBusinessDate(new Date('2026-08-20T19:00:00.000Z'))).toBe(
      '2026-08-21',
    );
  });
});

describe('DailyRevenuesService read contract', () => {
  it('accepts either own-branch OR all-branches read permission', async () => {
    const own = harness();
    own.dbQueryRaw.mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([]);
    await expect(
      own.service.list(user({ permissions: ['revenue.view_own_branch'] }), {}),
    ).resolves.toMatchObject({ total: 0, items: [] });

    const all = harness();
    all.dbQueryRaw.mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([]);
    await expect(
      all.service.list(user({ permissions: ['revenue.view_all_branches'] }), {}),
    ).resolves.toMatchObject({ total: 0, items: [] });

    const denied = harness();
    await denied.service
      .list(user({ permissions: [] }), {})
      .then(() => expect.unreachable('read without either permission must fail'))
      .catch((error: unknown) => expectApiCode(error, 403, 'FORBIDDEN'));
    expect(denied.dbQueryRaw).not.toHaveBeenCalled();
  });

  it('keeps list aggregation and totals limited to the three managed channels', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([]);
    await test.service.list(user(), {});
    test.dbQueryRaw.mockResolvedValueOnce([]);
    await test.service.totalsByBranch(BUSINESS_DATE, [BRANCH_ID]);

    const sql = test.dbQueryRaw.mock.calls.map(renderSqlCall).join('\n');
    expect(sql).toContain("pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')");
    expect(sql).not.toContain('CLICK_PAYME');
    expect(sql).not.toContain('CORPORATE_CARD');
    expect(sql).not.toContain("'OTHER'");
  });

  it('builds one stable reversible logical id from branch and business date', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([aggregateRow()]);

    await expect(test.service.detail(user(), DAILY_ID)).resolves.toMatchObject({
      id: DAILY_ID,
      branchId: BRANCH_ID,
      businessDate: BUSINESS_DATE,
      totalUzs: '600',
    });

    await test.service
      .detail(user(), `daily-${BRANCH_ID}-2026-02-31`)
      .then(() => expect.unreachable('invalid logical id must fail'))
      .catch((error: unknown) => expectApiCode(error, 404, 'REVENUE_NOT_FOUND'));
    expect(test.dbQueryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('DailyRevenuesService create validation and transaction order', () => {
  it.each([
    ['zero total', '0', '0', '0'],
    ['negative channel', '-1', '1', '0'],
    ['fractional channel', '1.5', '1', '0'],
    ['channel overflow', '9223372036854775808', '0', '0'],
    ['total overflow', '9223372036854775807', '1', '0'],
  ])('rejects %s without entering an actor transaction', async (_case, cash, card, transfer) => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([]); // external idempotency replay lookup

    await test.service
      .create(user(), 'request-key', {
        businessDate: BUSINESS_DATE,
        branchId: BRANCH_ID,
        cashUzs: cash,
        cardUzs: card,
        transferUzs: transfer,
        idempotencyKey: 'request-key',
      })
      .then(() => expect.unreachable('invalid amount must fail'))
      .catch((error: unknown) => expectApiCode(error, 422, 'AMOUNT_INVALID'));

    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('requires the header and body idempotency keys to match exactly', async () => {
    const test = harness();
    await test.service
      .create(user(), 'header-key', {
        businessDate: BUSINESS_DATE,
        branchId: BRANCH_ID,
        cashUzs: '1',
        cardUzs: '0',
        transferUzs: '0',
        idempotencyKey: 'different-body-key',
      })
      .then(() => expect.unreachable('mismatched idempotency keys must fail'))
      .catch((error: unknown) =>
        expectApiCode(error, 422, 'IDEMPOTENCY_KEY_REQUIRED'),
      );
    expect(test.dbQueryRaw).not.toHaveBeenCalled();
  });

  it('rejects a closed accounting period before opening a write transaction', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([]);
    test.periodFindFirst.mockResolvedValueOnce({ status: 'closed' });

    await test.service
      .create(user(), 'request-key', {
        businessDate: BUSINESS_DATE,
        branchId: BRANCH_ID,
        cashUzs: '1',
        cardUzs: '0',
        transferUzs: '0',
        idempotencyKey: 'request-key',
      })
      .then(() => expect.unreachable('closed period must reject the write'))
      .catch((error: unknown) => expectApiCode(error, 409, 'PERIOD_LOCKED'));

    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('serialises idempotency before the day lock, checks duplicates, and inserts only non-zero channels', async () => {
    const test = harness();
    const events: string[] = [];

    test.dbQueryRaw.mockImplementation(async (...args: unknown[]) => {
      const sql = renderSqlCall(args);
      if (sql.includes('idempotency_key = ANY')) {
        events.push('outside replay');
        return [];
      }
      events.push('detail');
      return [aggregateRow({ cash_uzs: '100', card_uzs: '0', transfer_uzs: '0', total_uzs: '100' })];
    });
    test.branchFindUnique.mockImplementation(async () => {
      events.push('branch');
      return { is_active: true };
    });
    test.periodFindFirst.mockImplementation(async () => {
      events.push('period');
      return { status: 'open' };
    });
    test.withActor.mockImplementation(
      async (_token: string, work: (client: PrismaTransaction) => Promise<unknown>) => {
        events.push('with actor');
        const tx = {
          $executeRaw: vi.fn(async (...args: unknown[]) => {
            const sql = renderSqlCall(args);
            if (sql.includes('daily-revenue-idempotency:')) events.push('idempotency lock');
            else if (sql.includes('daily-revenue:')) events.push('day lock');
            else if (sql.includes('INSERT INTO fincore.revenue_transactions')) events.push('insert');
            return 1;
          }),
          $queryRaw: vi.fn(async (...args: unknown[]) => {
            const sql = renderSqlCall(args);
            if (sql.includes('idempotency_key = ANY')) events.push('locked replay');
            else if (sql.includes('FROM fincore.v_revenue_net_rows')) {
              events.push('detail');
              return [
                aggregateRow({
                  cash_uzs: '100',
                  card_uzs: '0',
                  transfer_uzs: '0',
                  total_uzs: '100',
                }),
              ];
            } else events.push('duplicate check');
            return [];
          }),
        } as unknown as PrismaTransaction;
        return work(tx);
      },
    );

    const result = await test.service.create(user(), 'request-key', {
      businessDate: BUSINESS_DATE,
      branchId: BRANCH_ID,
      cashUzs: '100',
      cardUzs: '0',
      transferUzs: '0',
      idempotencyKey: 'request-key',
    });

    expect(result).toMatchObject({ replayed: false, revenue: { id: DAILY_ID } });
    expect(events).toEqual([
      'outside replay',
      'branch',
      'period',
      'with actor',
      'idempotency lock',
      'locked replay',
      'day lock',
      'duplicate check',
      'insert',
      'detail',
    ]);
    expect(test.mint).toHaveBeenCalledWith(USER_ID);
  });

  it('returns an idempotent replay without entering a second write transaction', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([aggregateRow()]);

    await expect(
      test.service.create(user(), 'request-key', {
        businessDate: BUSINESS_DATE,
        branchId: BRANCH_ID,
        cashUzs: '1',
        cardUzs: '0',
        transferUzs: '0',
        idempotencyKey: 'request-key',
      }),
    ).resolves.toMatchObject({ replayed: true, revenue: { id: DAILY_ID } });
    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('does not replay a historical key after its branch leaves current write scope', async () => {
    const test = harness();
    const otherBranch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    test.dbQueryRaw.mockResolvedValueOnce([aggregateRow()]);

    await test.service
      .create(
        user({ writeBranchScopes: [otherBranch] }),
        'request-key',
        {
          businessDate: BUSINESS_DATE,
          branchId: otherBranch,
          cashUzs: '1',
          cardUzs: '0',
          transferUzs: '0',
          idempotencyKey: 'request-key',
        },
      )
      .then(() => expect.unreachable('out-of-scope replay must fail'))
      .catch((error: unknown) => expectApiCode(error, 403, 'BRANCH_SCOPE_DENIED'));
    expect(test.withActor).not.toHaveBeenCalled();
  });

  it('returns a committed create result without requiring a separate read permission', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([]);
    test.txQueryRaw
      .mockResolvedValueOnce([]) // locked idempotency replay
      .mockResolvedValueOnce([]) // duplicate day
      .mockResolvedValueOnce([aggregateRow()]); // in-transaction response projection

    await expect(
      test.service.create(user({ permissions: ['revenue.create'] }), 'request-key', {
        businessDate: BUSINESS_DATE,
        branchId: BRANCH_ID,
        cashUzs: '100',
        cardUzs: '200',
        transferUzs: '300',
        idempotencyKey: 'request-key',
      }),
    ).resolves.toMatchObject({ replayed: false, revenue: { id: DAILY_ID } });
    expect(test.withActor).toHaveBeenCalledTimes(1);
  });
});

describe('DailyRevenuesService PATCH safety', () => {
  it('reverses only managed channels, records reversals, and preserves the original cashier', async () => {
    const test = harness();
    const current = aggregateRow();
    const replacement = aggregateRow({
      cash_uzs: '500',
      card_uzs: '0',
      transfer_uzs: '0',
      total_uzs: '500',
      updated_at: new Date('2026-08-20T06:00:00.000Z'),
    });
    test.dbQueryRaw.mockResolvedValueOnce([current]);
    test.txQueryRaw
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ original_transaction_id: '55555555-5555-4555-8555-555555555555' }])
      .mockResolvedValueOnce([replacement]);

    const result = await test.service.update(user(), DAILY_ID, {
      cashUzs: '500',
      cardUzs: '0',
      transferUzs: '0',
    });

    expect(result.id).toBe(DAILY_ID);
    expect(test.withActor).toHaveBeenCalledTimes(1);
    expect(test.mint).toHaveBeenCalledWith(USER_ID);

    const reversalSql = renderSqlCall(test.txQueryRaw.mock.calls[1] ?? []);
    expect(reversalSql).toContain('UPDATE fincore.revenue_transactions');
    expect(reversalSql).toContain("pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')");
    expect(reversalSql).toContain('INSERT INTO fincore.revenue_reversals');
    expect(reversalSql).not.toContain('CLICK_PAYME');
    expect(reversalSql).not.toContain('CORPORATE_CARD');
    expect(reversalSql).not.toContain("'OTHER'");

    const insertCall = test.txExecuteRaw.mock.calls.find((call) =>
      renderSqlCall(call).includes('INSERT INTO fincore.revenue_transactions'),
    );
    expect(insertCall).toBeDefined();
    const insertValues = valuesInSqlCall(insertCall ?? []);
    expect(insertValues.filter((value) => value === OWNER_ID)).toHaveLength(2);
    expect(insertValues).not.toContain(USER_ID);
  });

  it('does not fetch the post-write aggregate when replacement insertion fails', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([aggregateRow()]);
    test.txQueryRaw
      .mockResolvedValueOnce([aggregateRow()])
      .mockResolvedValueOnce([{ original_transaction_id: '55555555-5555-4555-8555-555555555555' }]);
    test.txExecuteRaw.mockImplementation(async (...args: unknown[]) => {
      if (renderSqlCall(args).includes('INSERT INTO fincore.revenue_transactions'))
        throw new Error('synthetic replacement failure');
      return 1;
    });

    await expect(
      test.service.update(user(), DAILY_ID, {
        cashUzs: '500',
        cardUzs: '0',
        transferUzs: '0',
      }),
    ).rejects.toThrow('synthetic replacement failure');

    // Only the pre-transaction lookup ran. A real Prisma transaction rolls
    // back both the reversal ledger row and status transition on this error.
    expect(test.dbQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns an edit result without requiring a separate read permission', async () => {
    const test = harness();
    test.dbQueryRaw.mockResolvedValueOnce([aggregateRow()]);
    test.txQueryRaw
      .mockResolvedValueOnce([aggregateRow()])
      .mockResolvedValueOnce([{ original_transaction_id: '55555555-5555-4555-8555-555555555555' }])
      .mockResolvedValueOnce([aggregateRow({ cash_uzs: '500', total_uzs: '1000' })]);

    await expect(
      test.service.update(user({ permissions: ['revenue.edit'] }), DAILY_ID, {
        cashUzs: '500',
      }),
    ).resolves.toMatchObject({ id: DAILY_ID, cashUzs: '500' });
    expect(test.withActor).toHaveBeenCalledTimes(1);
  });
});
