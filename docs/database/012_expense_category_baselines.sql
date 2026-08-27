-- ============================================================================
-- FINCORE — 012_expense_category_baselines.sql
--
-- Director-maintained baseline plan per (expense category × branch), mirroring
-- the "Boshlang'ich Sayxun / Xalqlar do'stligi / jami" columns of the Excel
-- «Sozlamalar» sheet.
--
-- This is deliberately NOT a second monthly budget. fincore.budget_lines
-- remains the only source every report reads; this table holds the director's
-- own reference figures, edited in Settings and shown there with row and column
-- totals. The grand total is computed, never stored.
--
-- Safety invariants:
--   * one additive table; nothing existing is read, moved or deleted;
--   * one row per (category, branch) — the matrix cannot hold duplicates;
--   * amounts use the project's non-negative UZS domain;
--   * no financial, audit, revenue or user row is touched.
--
-- Forward-only and idempotent after 001 -> 011.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fincore.expense_category_baselines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A baseline is meaningless without its category, so it goes with it.
  category_id UUID NOT NULL REFERENCES fincore.expense_categories(id) ON DELETE CASCADE,
  -- A branch is never hard-deleted; RESTRICT keeps it that way.
  branch_id   UUID NOT NULL REFERENCES fincore.branches(id) ON DELETE RESTRICT,

  amount_uzs  fincore.uzs_amount_nonnegative NOT NULL DEFAULT 0,

  -- Durable PHASE 36 identity, not the deletable authentication account.
  -- The author attribution and baseline survive users account hard-delete.
  updated_by  UUID,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rebuild explicitly so rerunning this idempotent migration also repairs an
-- earlier local copy that referenced fincore.users directly.
ALTER TABLE fincore.expense_category_baselines
  DROP CONSTRAINT IF EXISTS expense_category_baselines_updated_by_fkey;
ALTER TABLE fincore.expense_category_baselines
  ADD CONSTRAINT expense_category_baselines_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES fincore.user_identities(id) ON DELETE RESTRICT;

COMMENT ON TABLE fincore.expense_category_baselines IS
  'Director''s baseline expense plan per category and branch (Excel «Sozlamalar» D/E columns). NOT the monthly budget — fincore.budget_lines stays the single source for every report.';
COMMENT ON COLUMN fincore.expense_category_baselines.amount_uzs IS
  'Butun so''m. Domen CHECK (VALUE >= 0) manfiy qiymatni rad etadi.';

REVOKE ALL ON TABLE fincore.expense_category_baselines FROM PUBLIC;

-- The matrix cell is unique: one amount per category per branch.
CREATE UNIQUE INDEX IF NOT EXISTS expense_category_baselines_cell_unique
  ON fincore.expense_category_baselines (category_id, branch_id);

-- The settings grid reads the whole matrix branch-first for its column totals.
CREATE INDEX IF NOT EXISTS expense_category_baselines_by_branch
  ON fincore.expense_category_baselines (branch_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'expense_category_baselines'
      AND t.tgname = 'trg_expense_category_baselines_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_expense_category_baselines_updated_at
      BEFORE UPDATE ON fincore.expense_category_baselines
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;
END;
$$;

COMMIT;
