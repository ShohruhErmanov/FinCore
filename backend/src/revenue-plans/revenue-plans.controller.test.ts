import { describe, expect, it, vi } from 'vitest';
import { ApiException, type AuthenticatedUser } from '@/common';
import { RevenuePlansController } from './revenue-plans.controller';
import type { RevenuePlansService } from './revenue-plans.service';

const actor = (permissions: string[]) =>
  ({ id: 'u-1', permissions }) as unknown as AuthenticatedUser;

function controller() {
  const service = { year: vi.fn().mockResolvedValue({ year: 2026 }), get: vi.fn() };
  return {
    service,
    controller: new RevenuePlansController(service as unknown as RevenuePlansService),
  };
}

const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof ApiException ? error.getStatus() : 'other';
  }
  return 'none';
};

describe('GET /revenue-plans/year/:year', () => {
  it('lets anyone who may read the monthly board read the year', async () => {
    for (const permission of ['revenue_plan.manage', 'reports.view']) {
      const { controller: subject, service } = controller();
      await expect(subject.year(actor([permission]), 2026)).resolves.toEqual({ year: 2026 });
      expect(service.year).toHaveBeenCalledWith(2026);
    }
  });

  it('refuses everyone else before touching the database', () => {
    // An investor or a cashier: neither may see the company's plans.
    const { controller: subject, service } = controller();
    expect(statusOf(() => subject.year(actor(['investor.view_own']), 2026))).toBe(403);
    expect(statusOf(() => subject.year(actor(['revenue.view_own_branch']), 2026))).toBe(403);
    expect(service.year).not.toHaveBeenCalled();
  });

  it('rejects a year outside the supported range', () => {
    const { controller: subject, service } = controller();
    expect(statusOf(() => subject.year(actor(['reports.view']), 1999))).toBe(400);
    expect(statusOf(() => subject.year(actor(['reports.view']), 2101))).toBe(400);
    expect(service.year).not.toHaveBeenCalled();
  });
});
