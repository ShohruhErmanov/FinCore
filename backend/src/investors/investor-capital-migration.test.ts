import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fromBackend = resolve(process.cwd(), '../docs/database/019_investor_capital_contributions.sql');
const fromRoot = resolve(process.cwd(), 'docs/database/019_investor_capital_contributions.sql');
const migrationPath = existsSync(fromBackend) ? fromBackend : fromRoot;
const sql = readFileSync(migrationPath, 'utf8');

describe('019 investor capital migration contract', () => {
  it('keeps capital separate, positive, and one initial fact per investor', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS fincore.investor_capital_contributions');
    expect(sql).toMatch(/investor_id\s+UUID NOT NULL UNIQUE/);
    expect(sql).toContain('amount_uzs         fincore.uzs_amount_positive NOT NULL');
    expect(sql).toContain('investor capital contribution is append-only');
  });

  it('accepts only the three capital payment channels', () => {
    expect(sql).toContain("v_method_code NOT IN ('CASH', 'CARD', 'BANK_TRANSFER')");
  });

  it('zeros pre-start periods and leaves legacy profiles backward-compatible', () => {
    expect(sql).toContain('capital.id IS NULL');
    expect(sql).toContain('(ap.year, ap.month) >= (start_period.year, start_period.month)');
  });

  it('requires actor-backed audit for profile and capital creation', () => {
    expect(sql).toContain('trg_users_create_audit');
    expect(sql).toContain('trg_investor_capital_contributions_audit');
    expect(sql).toContain('trg_investor_profiles_audit');
    expect(sql).toContain('fincore.trg_audit_after_write()');
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*password_hash/is);
  });
});
