import { describe, expect, it, vi } from 'vitest';
import type { AuthService, SessionService } from '@/auth';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { AdminUsersService } from './users.service';
import type { UserCreateDto } from './dto/admin.dto';

const DIRECTOR_ID = '00000000-0000-4000-8000-0000000000d1';
const NEW_USER_ID = '00000000-0000-4000-8000-0000000000e1';
const PERIOD_ID = '00000000-0000-4000-8000-0000000000f1';
const BRANCH_ID = '00000000-0000-4000-8000-0000000000c1';
const PASSWORD = 'InvestorParol2026';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: DIRECTOR_ID,
    fullName: 'Direktor',
    phone: '+998900000001',
    status: 'active',
    roles: [
      {
        id: 'r1',
        role: 'director',
        roleName: 'Direktor',
        branchId: null,
        branchName: null,
      },
    ],
    permissions: ['user.manage', 'investor.manage', 'investor.view_all'],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
    ...overrides,
  };
}

function investorInput(overrides: Partial<UserCreateDto> = {}): UserCreateDto {
  return {
    fullName: 'Ali Valiyev',
    phone: '+998901112233',
    role: 'investor',
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ownershipPercent: 2,
    capitalAmountUzs: '100000000',
    startPeriodId: PERIOD_ID,
    capitalPaymentMethodCode: 'BANK_TRANSFER',
    // trg_user_roles_validate_branch_scope only allows a NULL grant for a role
    // whose allows_all_branch_scope is true; the investor role has it false, so
    // the grant must name a branch.
    branchId: BRANCH_ID,
    ...overrides,
  } as UserCreateDto;
}

function setup() {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const createdRoles: Array<{ role_id: string; branch_id: string | null }> = [];
  let capturedUserData: Record<string, unknown> | null = null;

  const tx = {
    users: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        capturedUserData = data;
        return { id: NEW_USER_ID };
      }),
    },
    user_roles: {
      create: vi.fn(async ({ data }: { data: { role_id: string; branch_id: string | null } }) => {
        createdRoles.push(data);
        return { id: 'ur1' };
      }),
    },
    $executeRaw: executeRaw,
  };

  const prisma = {
    db: {
      users: { findMany: vi.fn().mockResolvedValue([]) },
      branches: { findFirst: vi.fn().mockResolvedValue({ id: BRANCH_ID }) },
      roles: {
        findMany: vi.fn().mockResolvedValue([{ id: 'role-investor', code: 'investor' }]),
      },
      accounting_periods: {
        findFirst: vi.fn().mockResolvedValue({ id: PERIOD_ID }),
        findUnique: vi.fn().mockResolvedValue({ id: PERIOD_ID }),
      },
      payment_methods: {
        findUnique: vi.fn().mockResolvedValue({ id: 'payment-bank', is_active: true }),
      },
    },
    withActor: vi.fn(async (_token: string, work: (t: unknown) => Promise<unknown>) => work(tx)),
  } as unknown as PrismaService;

  const auth = {
    getAuthenticatedUser: vi.fn(async (id: string) =>
      user({ id, fullName: 'Ali Valiyev', permissions: ['investor.view_own'] }),
    ),
  } as unknown as AuthService;
  const actor = { mint: vi.fn().mockReturnValue('token') } as unknown as ActorContextService;
  const sessions = { destroyAllForUser: vi.fn() } as unknown as SessionService;

  const service = new AdminUsersService(prisma, actor, auth, sessions);
  return { service, prisma, tx, executeRaw, createdRoles, userData: () => capturedUserData };
}

describe('Director creates an investor', () => {
  it('refuses Business Owner creation through the ordinary Users API', async () => {
    const { service, prisma } = setup();

    await expect(
      service.create(user(), investorInput({ role: 'business_owner' as never })),
    ).rejects.toMatchObject({
      status: 403,
      code: 'BUSINESS_OWNER_CREATION_DENIED',
    });
    expect(prisma.withActor).not.toHaveBeenCalled();
  });

  it('writes account, ownership and capital contribution in one transaction', async () => {
    const { service, prisma, executeRaw } = setup();
    await service.create(user(), investorInput());

    expect(prisma.withActor).toHaveBeenCalledTimes(1);
    const sql = executeRaw.mock.calls.map((call) => String(call[0]?.join?.('?') ?? call[0]));
    expect(sql.some((text) => text.includes('investor_profiles'))).toBe(true);
    expect(sql.some((text) => text.includes('investor_capital_contributions'))).toBe(true);
  });

  it('hashes the password and never keeps the plaintext', async () => {
    const { service, userData } = setup();
    await service.create(user(), investorInput());

    const data = userData()!;
    expect(data.password_hash).toBeTypeOf('string');
    // bcrypt, the same helper the login path verifies against.
    expect(String(data.password_hash)).toMatch(/^\$2[aby]\$/);
    expect(String(data.password_hash)).not.toContain(PASSWORD);
    expect(JSON.stringify(data)).not.toContain(PASSWORD);
    expect(data).not.toHaveProperty('password');
  });

  it('returns a projection that carries no password material', async () => {
    const { service } = setup();
    const created = await service.create(user(), investorInput());

    const serialized = JSON.stringify(created);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('password_hash');
    expect(created).not.toHaveProperty('passwordHash');
  });

  it('grants exactly the investor role, scoped to the named branch', async () => {
    const { service, createdRoles } = setup();
    await service.create(user(), investorInput());

    // One grant only: no cashier or finance role is quietly added alongside.
    expect(createdRoles).toHaveLength(1);
    expect(createdRoles[0]?.role_id).toBe('role-investor');
    expect(createdRoles[0]?.branch_id).toBe(BRANCH_ID);
  });

  it('accepts a company-wide investor and grants it with no branch', async () => {
    // Since migration 015 the investor role carries allows_branchless_scope, so
    // a NULL grant is the company-wide case rather than a constraint violation.
    const { service, prisma, createdRoles } = setup();
    vi.mocked(prisma.db.branches.findFirst).mockResolvedValue(null);

    await service.create(user(), investorInput({ branchId: null }));

    expect(createdRoles).toHaveLength(1);
    expect(createdRoles[0]?.role_id).toBe('role-investor');
    expect(createdRoles[0]?.branch_id).toBeNull();
  });

  it('still refuses a cashier with no branch', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.db.branches.findFirst).mockResolvedValue(null);
    await expect(
      service.create(user(), investorInput({ role: 'cashier', branchId: null })),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('seeds the current period entitlement only when one is supplied', async () => {
    const withAmount = setup();
    await withAmount.service.create(user(), investorInput({ entitledAmountUzs: '10000000' }));
    const sqlWith = withAmount.executeRaw.mock.calls.map((c) => String(c[0]?.join?.('?') ?? c[0]));
    expect(sqlWith.some((t) => t.includes('investor_entitlements'))).toBe(true);

    const without = setup();
    await without.service.create(user(), investorInput());
    const sqlWithout = without.executeRaw.mock.calls.map((c) => String(c[0]?.join?.('?') ?? c[0]));
    expect(sqlWithout.some((t) => t.includes('investor_entitlements'))).toBe(false);
  });

  it('rejects a password that does not match its confirmation', async () => {
    const { service } = setup();
    await expect(
      service.create(user(), investorInput({ confirmPassword: 'boshqa-parol-123' })),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('requires a positive capital amount and valid start references', async () => {
    const invalidAmount = setup();
    await expect(
      invalidAmount.service.create(user(), investorInput({ capitalAmountUzs: '0' })),
    ).rejects.toMatchObject({ status: 422 });

    const invalidPeriod = setup();
    vi.mocked(invalidPeriod.prisma.db.accounting_periods.findUnique).mockResolvedValue(null);
    await expect(invalidPeriod.service.create(user(), investorInput())).rejects.toMatchObject({
      status: 422,
    });

    const invalidMethod = setup();
    vi.mocked(invalidMethod.prisma.db.payment_methods.findUnique).mockResolvedValue(null);
    await expect(invalidMethod.service.create(user(), investorInput())).rejects.toMatchObject({
      status: 422,
    });
  });

  it('allows only a director to create an investor', async () => {
    const { service } = setup();
    const financeManager = user({
      roles: [
        {
          id: 'r2',
          role: 'finance_manager',
          roleName: 'Moliya rahbari',
          branchId: null,
          branchName: null,
        },
      ],
      permissions: ['user.manage'],
    });
    await expect(service.create(financeManager, investorInput())).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rolls back the whole onboarding when capital insert fails', async () => {
    const { service, prisma, executeRaw } = setup();
    executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('capital write failed'));

    await expect(service.create(user(), investorInput())).rejects.toThrow('capital write failed');
    expect(prisma.withActor).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-director actor granting the director role', async () => {
    const { service } = setup();
    const financeManager = user({
      roles: [
        {
          id: 'r2',
          role: 'finance_manager',
          roleName: 'Moliya rahbari',
          branchId: null,
          branchName: null,
        },
      ],
      permissions: ['user.manage'],
    });
    await expect(
      service.create(financeManager, investorInput({ role: 'director' })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('fails cleanly when the investor role is absent from the database', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.db.roles.findMany).mockResolvedValue([]);
    await expect(service.create(user(), investorInput())).rejects.toMatchObject({
      status: 404,
    });
  });
});
