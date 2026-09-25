import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fromBackend = resolve(process.cwd(), '../docs/database/020_business_owner_role.sql');
const fromRoot = resolve(process.cwd(), 'docs/database/020_business_owner_role.sql');
const sql = readFileSync(existsSync(fromBackend) ? fromBackend : fromRoot, 'utf8');

describe('020 business owner role contract', () => {
  it('creates the exact strategic role and read scope', () => {
    expect(sql).toContain("'business_owner'");
    expect(sql).toContain("'Biznes egasi'");
    expect(sql).toMatch(/'Biznes egasi',\s*true,\s*true,\s*false/);
  });

  it('grants only the approved read permission set', () => {
    for (const permission of [
      'dashboard.view',
      'expense.view_own_branch',
      'expense.view_all_branches',
      'budget.view',
      'revenue.view_own_branch',
      'revenue.view_all_branches',
      'reports.view',
      'investor.view_all',
      'audit.view',
    ])
      expect(sql).toContain(`'${permission}'`);

    expect(sql).toContain('v_grants IS DISTINCT FROM v_expected');
    expect(sql).toContain('business_owner has a forbidden mutation permission');
  });

  it('does not alter any existing role or financial table', () => {
    expect(sql).not.toMatch(/UPDATE\s+fincore\.roles/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/TRUNCATE|DROP\s+TABLE/i);
    expect(sql).not.toMatch(/revenue_transactions|expenses|budget_lines|investor_payments/i);
  });
});
