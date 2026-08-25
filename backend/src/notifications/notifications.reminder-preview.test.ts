import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import {
  currentTashkentBusinessDate,
  DailyRevenuesService,
  isValidBusinessDate,
} from '@/daily-revenues/daily-revenues.service';
import type { DashboardService } from '@/reports/dashboard.service';
import type { AppEnv } from '@/config';
import type { TelegramLinkService } from '@/telegram/telegram-link.service';
import { NotificationsService } from './notifications.service';

const BRANCH_ONE = '11111111-1111-4111-8111-111111111111';
const BRANCH_TWO = '22222222-2222-4222-8222-222222222222';

/** Nobody has verified a Telegram link, so no employee is reachable. */
const LINK_STUB = {
  linkedUserIds: async () => new Set<string>(),
} as unknown as TelegramLinkService;

/** Telegram off: the preview must still render without any credential present. */
const TELEGRAM_OFF = { TELEGRAM_ENABLED: false } as unknown as AppEnv;

const user: AuthenticatedUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  fullName: 'Test Cashier',
  phone: '+998901234567',
  status: 'active',
  roles: [],
  permissions: ['notification.manage'],
  branchScopes: [BRANCH_ONE, BRANCH_TWO],
  writeBranchScopes: [BRANCH_ONE],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Daily revenue business-date helpers', () => {
  it('uses the Asia/Tashkent calendar day at the UTC boundary', () => {
    expect(currentTashkentBusinessDate(new Date('2026-08-19T20:30:00.000Z'))).toBe(
      '2026-08-20',
    );
  });

  it('rejects impossible Gregorian dates before SQL receives them', () => {
    expect(isValidBusinessDate('2026-02-28')).toBe(true);
    expect(isValidBusinessDate('2026-02-29')).toBe(false);
    expect(isValidBusinessDate('2026-13-01')).toBe(false);
    expect(isValidBusinessDate('not-a-date')).toBe(false);
  });

  it('limits reminder totals to the three DailyRevenue-managed channels', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { branch_id: BRANCH_ONE, total_uzs: '2750000' },
    ]);
    const revenues = new DailyRevenuesService(
      { db: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as ActorContextService,
    );

    await expect(revenues.totalsByBranch('2026-08-20', [BRANCH_ONE])).resolves.toEqual(
      new Map([[BRANCH_ONE, '2750000']]),
    );

    const [template, requestedDate, branchScopes] = queryRaw.mock.calls[0] as [
      readonly string[],
      string,
      string[],
    ];
    const sql = Array.from(template).join('?');
    expect(sql).toContain("pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')");
    expect(sql).not.toContain('CLICK_PAYME');
    expect(sql).not.toContain('CORPORATE_CARD');
    expect(sql).not.toContain("'OTHER'");
    expect(requestedDate).toBe('2026-08-20');
    expect(branchScopes).toEqual([BRANCH_ONE]);
  });

  it('rejects an invalid reminder date without querying the database', async () => {
    const queryRaw = vi.fn();
    const revenues = new DailyRevenuesService(
      { db: { $queryRaw: queryRaw } } as unknown as PrismaService,
      {} as ActorContextService,
    );

    await expect(revenues.totalsByBranch('2026-02-31', [BRANCH_ONE])).rejects.toMatchObject({
      code: 'DATE_OR_PERIOD_INVALID',
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.reminderPreview', () => {
  it('passes the visible branch scope to storage and preserves missing-entry nulls', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T20:30:00.000Z'));

    const findBranches = vi.fn().mockResolvedValue([
      { id: BRANCH_ONE, name: 'Chilonzor' },
      { id: BRANCH_TWO, name: 'Yunusobod' },
    ]);
    const totalsByBranch = vi.fn().mockResolvedValue(new Map([[BRANCH_ONE, '2750000']]));
    const prisma = {
      db: {
        branches: { findMany: findBranches },
        // No stored Telegram config means there are no configured recipients;
        // this also keeps the test entirely read-only and database-free.
        $queryRaw: vi.fn().mockResolvedValue([]),
        users: { findMany: vi.fn() },
      },
    } as unknown as PrismaService;
    const notifications = new NotificationsService(
      prisma,
      {} as DashboardService,
      { totalsByBranch } as unknown as DailyRevenuesService,
      LINK_STUB,
      TELEGRAM_OFF,
    );

    const result = await notifications.reminderPreview(user);

    expect(findBranches).toHaveBeenCalledWith({
      where: { is_active: true, id: { in: user.branchScopes } },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });
    expect(totalsByBranch).toHaveBeenCalledWith('2026-08-20', user.branchScopes);
    expect(result.businessDate).toBe('2026-08-20');
    expect(result.branches[0]).toMatchObject({
      branchId: BRANCH_ONE,
      totalUzs: '2750000',
      recipients: [],
      message: null,
    });
    expect(result.branches[1]).toMatchObject({
      branchId: BRANCH_TWO,
      totalUzs: null,
      recipients: [],
    });
    expect(result.branches[1]?.message).toContain('Yunusobod');
    expect(result.branches[1]?.message).toContain('20.08.2026');
  });

  it('forwards an explicitly requested valid business date unchanged', async () => {
    const totalsByBranch = vi.fn().mockResolvedValue(new Map());
    const notifications = new NotificationsService(
      {
        db: {
          branches: { findMany: vi.fn().mockResolvedValue([]) },
          $queryRaw: vi.fn().mockResolvedValue([]),
          users: { findMany: vi.fn() },
        },
      } as unknown as PrismaService,
      {} as DashboardService,
      { totalsByBranch } as unknown as DailyRevenuesService,
      LINK_STUB,
      TELEGRAM_OFF,
    );

    const result = await notifications.reminderPreview(user, '2026-07-31');

    expect(totalsByBranch).toHaveBeenCalledWith('2026-07-31', user.branchScopes);
    expect(result.businessDate).toBe('2026-07-31');
  });
});
