import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/common';
import { DailyRevenuesController } from './daily-revenues.controller';
import type {
  DailyRevenueCreateResult,
  DailyRevenuesService,
} from './daily-revenues.service';

const actor = {
  id: '33333333-3333-4333-8333-333333333333',
  fullName: 'Test user',
  phone: '+998901234567',
  status: 'active',
  roles: [],
  permissions: ['revenue.create'],
  branchScopes: ['11111111-1111-4111-8111-111111111111'],
  writeBranchScopes: ['11111111-1111-4111-8111-111111111111'],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
} satisfies AuthenticatedUser;

const input = {
  businessDate: '2026-08-20',
  branchId: '11111111-1111-4111-8111-111111111111',
  cashUzs: '1',
  cardUzs: '0',
  transferUzs: '0',
  idempotencyKey: 'request-key',
};

const revenue = {
  id: `daily-${input.branchId}-${input.businessDate}`,
  businessDate: input.businessDate,
  periodId: '22222222-2222-4222-8222-222222222222',
  branchId: input.branchId,
  branchName: 'Markaziy filial',
  cashUzs: '1',
  cardUzs: '0',
  transferUzs: '0',
  totalUzs: '1',
  comment: null,
  enteredBy: actor.id,
  enteredByName: actor.fullName,
  createdAt: '2026-08-20T05:00:00.000Z',
  updatedAt: '2026-08-20T05:00:00.000Z',
};

describe('DailyRevenuesController idempotency status', () => {
  it.each([
    [false, HttpStatus.CREATED],
    [true, HttpStatus.OK],
  ])('uses replayed=%s to return HTTP %s', async (replayed, expectedStatus) => {
    const result: DailyRevenueCreateResult = { revenue, replayed };
    const service = { create: vi.fn().mockResolvedValue(result) } as unknown as DailyRevenuesService;
    const response = { status: vi.fn() } as unknown as Response;
    const controller = new DailyRevenuesController(service);

    await expect(
      controller.create(actor, input.idempotencyKey, input, response),
    ).resolves.toEqual(revenue);
    expect(response.status).toHaveBeenCalledWith(expectedStatus);
  });
});
