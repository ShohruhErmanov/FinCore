import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import type { ActorContextService, PrismaService } from '@/database';
import { MasterWriteService } from './master-write.service';

const DIRECTOR: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [],
  permissions: ['master_data.manage'],
  branchScopes: [],
  writeBranchScopes: [],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
};

function rows(year: number) {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    year,
    month: index + 1,
    status: 'open' as const,
  }));
}

function harness(existing: number) {
  const count = vi.fn().mockResolvedValue(existing);
  const createMany = vi.fn().mockResolvedValue({ count: 12 - existing });
  const findMany = vi.fn().mockResolvedValue(rows(2027));
  const audit = vi.fn().mockResolvedValue(1);
  const tx = {
    accounting_periods: { count, createMany, findMany },
    $executeRaw: audit,
  };
  const withActor = vi.fn(async (_token: string, work: (value: typeof tx) => Promise<unknown>) =>
    work(tx),
  );
  const prisma = { withActor } as unknown as PrismaService;
  const actor = { mint: vi.fn().mockReturnValue('signed-token') } as unknown as ActorContextService;
  return {
    service: new MasterWriteService(prisma, actor),
    actor,
    withActor,
    count,
    createMany,
    findMany,
    audit,
  };
}

describe('MasterWriteService accounting year creation', () => {
  it('atomically creates all twelve real periods and returns them in month order', async () => {
    const test = harness(0);

    const result = await test.service.createAccountingYear(DIRECTOR, 2027);

    expect(test.actor.mint).toHaveBeenCalledWith(DIRECTOR.id);
    expect(test.withActor).toHaveBeenCalledTimes(1);
    expect(test.createMany).toHaveBeenCalledWith({
      data: Array.from({ length: 12 }, (_, month) => ({
        year: 2027,
        month: month + 1,
        status: 'open',
      })),
      skipDuplicates: true,
    });
    expect(test.audit).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(12);
    expect(result[0]).toMatchObject({ year: 2027, month: 1, label: 'Yanvar 2027' });
    expect(result[11]).toMatchObject({ year: 2027, month: 12, label: 'Dekabr 2027' });
  });

  it('fills a legitimate partial year rather than leaving the navbar incomplete', async () => {
    const test = harness(1);

    await test.service.createAccountingYear(DIRECTOR, 2027);

    expect(test.createMany).toHaveBeenCalledTimes(1);
    expect(test.audit).toHaveBeenCalledTimes(1);
  });

  it('rejects a complete existing year without writing or auditing', async () => {
    const test = harness(12);

    await expect(test.service.createAccountingYear(DIRECTOR, 2027)).rejects.toMatchObject({
      code: 'ACCOUNTING_YEAR_EXISTS',
    });
    expect(test.createMany).not.toHaveBeenCalled();
    expect(test.audit).not.toHaveBeenCalled();
  });

  it('rolls back when the resulting year is not complete', async () => {
    const test = harness(0);
    test.findMany.mockResolvedValueOnce(rows(2027).slice(0, 11));

    await expect(test.service.createAccountingYear(DIRECTOR, 2027)).rejects.toMatchObject({
      code: 'ACCOUNTING_YEAR_INCOMPLETE',
    });
  });
});
