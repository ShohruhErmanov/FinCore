import { describe, expect, it } from 'vitest';
import { ApiException } from '../errors/api-exception';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { requireAnyPermission, requirePermission } from './permissions';

const userWith = (...permissions: string[]) => ({ permissions }) as unknown as AuthenticatedUser;

const refusal = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return error as ApiException;
  }
  throw new Error('expected a refusal');
};

describe('in-service permission checks', () => {
  it('lets a holder of the permission through', () => {
    expect(() => requirePermission(userWith('investor.manage'), 'investor.manage')).not.toThrow();
    expect(() =>
      requireAnyPermission(userWith('reports.view'), ['revenue_plan.manage', 'reports.view']),
    ).not.toThrow();
  });

  it('refuses with the guard’s 403 body, naming what was missing', () => {
    const single = refusal(() => requirePermission(userWith('reports.view'), 'investor.manage'));
    expect(single.getStatus()).toBe(403);
    expect(single.getResponse()).toMatchObject({
      code: 'FORBIDDEN',
      details: { missingPermissions: ['investor.manage'] },
    });

    const either = refusal(() =>
      requireAnyPermission(userWith(), ['revenue.view_own_branch', 'revenue.view_all_branches']),
    );
    expect(either.getResponse()).toMatchObject({
      details: { missingPermissions: ['revenue.view_own_branch', 'revenue.view_all_branches'] },
    });
  });
});
