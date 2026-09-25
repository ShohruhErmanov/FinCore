import { describe, expect, it, vi } from 'vitest';
import { ApiException, type AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { InvestorsService } from './investors.service';

const INVESTOR_A = '00000000-0000-4000-8000-0000000000a1';
const INVESTOR_B = '00000000-0000-4000-8000-0000000000a2';
const USER_A = '00000000-0000-4000-8000-0000000000b1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';
const DIRECTOR = '00000000-0000-4000-8000-0000000000b9';
const BRANCH_A = '00000000-0000-4000-8000-0000000000c1';
const BRANCH_B = '00000000-0000-4000-8000-0000000000c2';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_A,
    fullName: 'Ali Valiyev',
    phone: '+998901112233',
    status: 'active',
    roles: [],
    permissions: ['investor.view_own'],
    branchScopes: [BRANCH_A],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

const PROFILES = [
  {
    id: INVESTOR_A,
    user_id: USER_A,
    ownership_percent: { toString: () => '2.00' },
    is_active: true,
    branch: { id: BRANCH_A, code: 'SAYXUN', name: 'Sayxun' },
  },
  {
    id: INVESTOR_B,
    user_id: USER_B,
    ownership_percent: { toString: () => '5.00' },
    is_active: true,
    branch: { id: BRANCH_B, code: 'XALQLAR', name: 'Xalqlar do‘stligi' },
  },
];

/** Twelve months; only August carries figures, matching the worked example. */
function monthlyRows() {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    period_id: index === 7 ? 'period-8' : null,
    entitled: index === 7 ? 10_000_000n : 0n,
    paid: index === 7 ? 8_000_000n : 0n,
    payment_count: index === 7 ? 1n : 0n,
  }));
}

function build() {
  const queryRaw = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
    const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
    if (sql.includes('generate_series')) return Promise.resolve(monthlyRows());
    return Promise.resolve([]);
  });

  const prisma = {
    db: {
      investor_profiles: {
        findMany: vi.fn().mockResolvedValue(PROFILES),
        count: vi.fn().mockResolvedValue(1),
      },
      users: {
        findMany: vi.fn().mockResolvedValue([
          { id: USER_A, full_name: 'Ali Valiyev', phone: '+998901112233' },
          { id: USER_B, full_name: 'Vali Aliyev', phone: '+998907778899' },
        ]),
      },
      user_identities: {
        findMany: vi.fn().mockResolvedValue([
          { id: USER_A, display_name: 'Ali Valiyev' },
          { id: USER_B, display_name: 'Vali Aliyev' },
        ]),
      },
      accounting_periods: { findUnique: vi.fn().mockResolvedValue({ year: 2026, month: 8 }) },
      $queryRaw: queryRaw,
    },
    withActor: vi.fn(async (_token: string, work: (tx: unknown) => Promise<unknown>) =>
      work({
        $executeRaw: vi.fn().mockResolvedValue(1),
        investor_profiles: { create: vi.fn(), update: vi.fn() },
      }),
    ),
  } as unknown as PrismaService;

  const actor = { mint: vi.fn().mockReturnValue('token') } as unknown as ActorContextService;
  return new InvestorsService(prisma, actor);
}

describe('InvestorsService — authorization', () => {
  it('lets an investor read their own dashboard', async () => {
    const result = await build().dashboard(user(), INVESTOR_A, 2026);
    expect(result.investor.id).toBe(INVESTOR_A);
    expect(result.investor.ownershipPercent).toBe(2);
  });

  it('refuses one investor reading another — no IDOR through the url id', async () => {
    await expect(build().dashboard(user(), INVESTOR_B, 2026)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('refuses a caller holding neither investor permission', async () => {
    await expect(
      build().dashboard(user({ permissions: [] }), INVESTOR_A, 2026),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets a director with investor.view_all read any investor', async () => {
    const director = user({
      id: DIRECTOR,
      permissions: ['investor.view_all'],
      branchScopes: [BRANCH_A, BRANCH_B],
    });
    const result = await build().dashboard(director, INVESTOR_B, 2026);
    expect(result.investor.id).toBe(INVESTOR_B);
  });

  it('applies branch scope to a branch-scoped investor', async () => {
    const reader = user({
      id: DIRECTOR,
      permissions: ['investor.view_all'],
      branchScopes: [BRANCH_A], // cannot read BRANCH_B
    });
    await expect(build().dashboard(reader, INVESTOR_B, 2026)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('hides out-of-scope investors from the list', async () => {
    const reader = user({ permissions: ['investor.view_all'], branchScopes: [BRANCH_A] });
    const rows = await build().list(reader, 2026);
    expect(rows.map((row) => row.id)).toEqual([INVESTOR_A]);
  });

  it('refuses the list without investor.view_all', async () => {
    await expect(build().list(user(), 2026)).rejects.toBeInstanceOf(ApiException);
  });

  it('refuses every mutation without investor.manage', async () => {
    const service = build();
    const reader = user({ permissions: ['investor.view_all'] });
    await expect(
      service.setEntitlement(reader, INVESTOR_A, { periodId: 'p', entitledAmountUzs: '1' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.recordPayment(reader, INVESTOR_A, { paidOn: '2026-08-20', amountUzs: '1' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.reversePayment(reader, INVESTOR_A, INVESTOR_A, { reason: 'xato' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an ownership percentage outside 0..100', async () => {
    const manager = user({ permissions: ['investor.manage'] });
    await expect(
      build().create(manager, { userId: USER_A, ownershipPercent: 140 }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects a non-positive payment before it reaches the database', async () => {
    const manager = user({ permissions: ['investor.manage'] });
    await expect(
      build().recordPayment(manager, INVESTOR_A, { paidOn: '2026-08-20', amountUzs: '0' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('InvestorsService — aggregation', () => {
  it('keeps reads available when the optional capital table has not been applied', async () => {
    const service = build();
    const prisma = (service as unknown as { prisma: PrismaService }).prisma;
    const queryRaw = prisma.db.$queryRaw as unknown as ReturnType<typeof vi.fn>;
    queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('investor_capital_contributions')) {
        const error = Object.assign(
          new Error('relation "fincore.investor_capital_contributions" does not exist'),
          {
            code: 'P2010',
            meta: {
              code: '42P01',
              message: 'relation "fincore.investor_capital_contributions" does not exist',
            },
          },
        );
        return Promise.reject(error);
      }
      if (sql.includes('generate_series')) return Promise.resolve(monthlyRows());
      return Promise.resolve([]);
    });

    await expect(service.dashboard(user(), INVESTOR_A, 2026)).resolves.toMatchObject({
      investor: { id: INVESTOR_A, capitalContribution: null },
    });
  });

  it('returns twelve months and derives the year from them', async () => {
    const result = await build().dashboard(user(), INVESTOR_A, 2026);
    expect(result.months).toHaveLength(12);
    expect(result.months[7]?.label).toBe('Avgust');
    expect(result.months[7]?.settlement.paidPercent).toBe(80);
    expect(result.months[7]?.settlement.remainingAmountUzs).toBe('2000000');

    expect(result.annual.entitledAmountUzs).toBe('10000000');
    expect(result.annual.paidAmountUzs).toBe('8000000');
    expect(result.annual.remainingAmountUzs).toBe('2000000');
    expect(result.annual.paidPercent).toBe(80);
  });

  it('shows an empty month as zero rather than omitting it', async () => {
    const result = await build().dashboard(user(), INVESTOR_A, 2026);
    expect(result.months[0]?.settlement.status).toBe('no_entitlement');
    expect(result.months[0]?.settlement.paidPercent).toBe(0);
  });

  it('keeps ownership percent separate from paid percent', async () => {
    const result = await build().dashboard(user(), INVESTOR_A, 2026);
    expect(result.investor.ownershipPercent).toBe(2);
    expect(result.annual.paidPercent).toBe(80);
  });
});

/**
 * PHASE 46 §12 — the permission matrix stated in the task, asserted per role
 * rather than in the abstract, so a future permission seed change fails here.
 */
describe('InvestorsService — role matrix', () => {
  const roleUser = (permissions: string[], id = USER_B) =>
    user({
      id,
      permissions: permissions as AuthenticatedUser['permissions'],
      branchScopes: [BRANCH_A, BRANCH_B],
    });

  const CASES = [
    { name: 'Cashier', permissions: ['expense.create', 'revenue.create'] },
    {
      name: 'Finance Manager',
      permissions: ['expense.view_all_branches', 'budget.create_edit', 'master_data.manage'],
    },
  ];

  for (const role of CASES) {
    it(`denies ${role.name} investor.manage`, async () => {
      await expect(
        build().setEntitlement(roleUser(role.permissions), INVESTOR_A, {
          periodId: 'p',
          entitledAmountUzs: '1',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it(`denies ${role.name} investor.view_all`, async () => {
      await expect(build().list(roleUser(role.permissions), 2026)).rejects.toMatchObject({
        status: 403,
      });
    });
  }

  it('denies an investor investor.view_all', async () => {
    await expect(
      build().list(user({ permissions: ['investor.view_own'] }), 2026),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('denies an investor investor.manage', async () => {
    await expect(
      build().recordPayment(user({ permissions: ['investor.view_own'] }), INVESTOR_A, {
        paidOn: '2026-08-20',
        amountUzs: '1000',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows a Director both investor.view_all and investor.manage', async () => {
    const director = user({
      id: DIRECTOR,
      permissions: ['investor.view_all', 'investor.manage'],
      branchScopes: [BRANCH_A, BRANCH_B],
    });
    await expect(build().list(director, 2026)).resolves.toHaveLength(2);
    await expect(build().dashboard(director, INVESTOR_B, 2026)).resolves.toMatchObject({
      investor: { id: INVESTOR_B },
    });
  });

  it('never exposes password material in an investor projection', async () => {
    const director = user({
      id: DIRECTOR,
      permissions: ['investor.view_all'],
      branchScopes: [BRANCH_A, BRANCH_B],
    });
    const board = await build().dashboard(director, INVESTOR_A, 2026);
    const serialized = JSON.stringify(board);
    expect(serialized).not.toMatch(/password/i);
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(serialized).not.toMatch(/session/i);
  });
});

/**
 * PHASE 48.1 — deleting the login account in Foydalanuvchilar removes the
 * person from the company, so Investorlar must stop listing them entirely.
 */
describe('InvestorsService — deleted account', () => {
  function buildOrphaned() {
    const queryRaw = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('generate_series')) return Promise.resolve(monthlyRows());
      return Promise.resolve([]);
    });
    const prisma = {
      db: {
        investor_profiles: {
          // The profile row survives — its payments are append-only…
          findMany: vi.fn().mockResolvedValue(PROFILES),
          count: vi.fn().mockResolvedValue(1),
        },
        // …but INVESTOR_A's login account has been deleted.
        users: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: USER_B, full_name: 'Vali Aliyev', phone: '+998907778899' }]),
        },
        accounting_periods: { findUnique: vi.fn().mockResolvedValue({ year: 2026, month: 8 }) },
        $queryRaw: queryRaw,
      },
      withActor: vi.fn(),
    } as unknown as PrismaService;
    const actor = { mint: vi.fn().mockReturnValue('token') } as unknown as ActorContextService;
    return new InvestorsService(prisma, actor);
  }

  const director = () =>
    user({ id: DIRECTOR, permissions: ['investor.view_all'], branchScopes: [BRANCH_A, BRANCH_B] });

  it('drops the investor from the list once the account is deleted', async () => {
    const rows = await buildOrphaned().list(director(), 2026);
    expect(rows.map((row) => row.id)).toEqual([INVESTOR_B]);
    expect(rows.some((row) => row.id === INVESTOR_A)).toBe(false);
  });

  it('never renders a tombstone name for a deleted account', async () => {
    const rows = await buildOrphaned().list(director(), 2026);
    expect(rows.map((row) => row.fullName)).not.toContain('Noma’lum');
  });

  it('answers INVESTOR_NOT_FOUND for the deleted investor by id', async () => {
    await expect(buildOrphaned().dashboard(director(), INVESTOR_A, 2026)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('leaves the remaining investor readable', async () => {
    const result = await buildOrphaned().dashboard(director(), INVESTOR_B, 2026);
    expect(result.investor.id).toBe(INVESTOR_B);
    expect(result.annual.paidPercent).toBe(80);
  });

  it('gives an empty section when every account is gone', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = {
      db: {
        investor_profiles: { findMany: vi.fn().mockResolvedValue(PROFILES), count: vi.fn() },
        users: { findMany: vi.fn().mockResolvedValue([]) },
        accounting_periods: { findUnique: vi.fn() },
        $queryRaw: queryRaw,
      },
      withActor: vi.fn(),
    } as unknown as PrismaService;
    const service = new InvestorsService(prisma, {
      mint: vi.fn(),
    } as unknown as ActorContextService);

    await expect(service.list(director(), 2026)).resolves.toEqual([]);
  });
});
