import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@/database';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('returns read-only metadata and never exposes audit payloads or secrets', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 42n,
          actor_name: 'Biznes egasi',
          action: 'expenses.create',
          entity_type: 'expenses',
          entity_id: 'expense-1',
          result: 'success',
          branch_name: 'Sayxun',
          occurred_at: new Date('2026-09-25T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ total: 1n }]);
    const service = new AuditService({
      db: { $queryRaw: queryRaw },
    } as unknown as PrismaService);

    const page = await service.list(1, 50, 'expenses');

    expect(page).toEqual({
      data: [
        {
          id: '42',
          actorName: 'Biznes egasi',
          action: 'expenses.create',
          entityType: 'expenses',
          entityId: 'expense-1',
          result: 'success',
          branchName: 'Sayxun',
          occurredAt: '2026-09-25T10:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    const serialized = JSON.stringify(page);
    expect(serialized).not.toMatch(/before_payload|after_payload|password|token|secret/i);
  });
});
