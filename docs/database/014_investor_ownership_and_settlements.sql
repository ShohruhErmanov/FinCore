-- ============================================================================
-- FINCORE — 014_investor_ownership_and_settlements.sql
--
-- Investor ownership, per-period entitlement and the payment ledger that
-- settles it.
--
-- WHY ENTITLEMENT IS STORED, NOT DERIVED
-- --------------------------------------
-- FinCore has no existing investor concept: no role, no permission, no table,
-- no formula. Nothing in the schema or the services defines how much of a
-- period belongs to an investor, and revenue share, profit share and a fixed
-- repayment schedule all produce different numbers from the same data. Picking
-- one here would invent business logic rather than implement it, so the
-- entitled amount is RECORDED per period by whoever holds investor.manage.
--
-- Should the business later decide entitlement is, say, ownership_percent of
-- net profit, that rule can populate exactly these rows — the storage model and
-- every aggregate built on it stay valid. No formula is baked into the schema.
--
-- Safety invariants:
--   * three additive tables, one enum, one role, three permissions;
--   * nothing existing is read, moved, altered or deleted;
--   * ownership_percent is constrained to 0..100 by the table, not the API;
--   * payments are append-only — one posted -> reversed transition, no DELETE;
--   * amounts use the project's UZS domains, so negatives are impossible;
--   * the new role receives investor.view_own and NOTHING else;
--   * both financial tables carry the shared audit trigger, which also makes a
--     signed actor context mandatory at the database layer (see section 5).
--
-- Forward-only and idempotent after 001 -> 013.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Payment status
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'investor_payment_status'
  ) THEN
    CREATE TYPE fincore.investor_payment_status AS ENUM ('posted', 'reversed');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Investor profile — ownership, not entitlement
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.investor_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Durable PHASE 36 identity (user_identities.id = users.id). RESTRICT because
  -- an investor carrying settlement history must not be erasable.
  user_id           UUID NOT NULL REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,

  -- Share of the company, expressed in percent. This is NOT the paid ratio:
  -- 2% ownership and "80% of what is owed has been paid" are different numbers
  -- and the UI must never merge them.
  ownership_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    CONSTRAINT investor_profiles_ownership_range CHECK (ownership_percent >= 0 AND ownership_percent <= 100),

  -- NULL = company-wide investor. A branch id scopes the investor to one
  -- branch; the API reuses the existing branch scope, it does not invent one.
  branch_id         UUID REFERENCES fincore.branches(id) ON DELETE RESTRICT,

  note              TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,

  created_by        UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.investor_profiles IS
  'Investor ownership record. ownership_percent is the share of the company and is never the share of an entitlement that has been paid.';
COMMENT ON COLUMN fincore.investor_profiles.branch_id IS
  'NULL = company-wide. Otherwise the investor is scoped to this branch and every aggregate is filtered by it.';

REVOKE ALL ON TABLE fincore.investor_profiles FROM PUBLIC;

-- One investor record per account.
CREATE UNIQUE INDEX IF NOT EXISTS investor_profiles_user_unique
  ON fincore.investor_profiles (user_id);

-- ----------------------------------------------------------------------------
-- 3. Entitlement — the recorded amount owed for one period
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.investor_entitlements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  investor_id           UUID NOT NULL REFERENCES fincore.investor_profiles(id) ON DELETE CASCADE,
  accounting_period_id  UUID NOT NULL REFERENCES fincore.accounting_periods(id) ON DELETE RESTRICT,

  entitled_amount_uzs   fincore.uzs_amount_nonnegative NOT NULL DEFAULT 0,
  note                  TEXT,

  created_by            UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  updated_by            UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.investor_entitlements IS
  'Amount owed to an investor for one accounting period, recorded per period so yearly figures are a real SUM of months and history is never overwritten by a current-state field.';

REVOKE ALL ON TABLE fincore.investor_entitlements FROM PUBLIC;

-- One entitlement per investor per period; the yearly total is SUM over these.
CREATE UNIQUE INDEX IF NOT EXISTS investor_entitlements_period_unique
  ON fincore.investor_entitlements (investor_id, accounting_period_id);

-- ----------------------------------------------------------------------------
-- 4. Payments — append-only settlement ledger
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.investor_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  investor_id           UUID NOT NULL REFERENCES fincore.investor_profiles(id) ON DELETE CASCADE,
  accounting_period_id  UUID NOT NULL REFERENCES fincore.accounting_periods(id) ON DELETE RESTRICT,

  paid_on               DATE NOT NULL,
  amount_uzs            fincore.uzs_amount_positive NOT NULL,
  note                  TEXT,

  status                fincore.investor_payment_status NOT NULL DEFAULT 'posted',
  reversal_reason       TEXT,
  reversed_at           TIMESTAMPTZ,
  reversed_by           UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,

  created_by            UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.investor_payments IS
  'Append-only ledger of money actually paid to an investor. A mistake is corrected by reversing the row, exactly as fincore.revenue_transactions does; aggregates count status = posted only.';

REVOKE ALL ON TABLE fincore.investor_payments FROM PUBLIC;

CREATE INDEX IF NOT EXISTS investor_payments_by_investor_period
  ON fincore.investor_payments (investor_id, accounting_period_id);
CREATE INDEX IF NOT EXISTS investor_payments_reversed
  ON fincore.investor_payments (status) WHERE status = 'reversed';

-- ----------------------------------------------------------------------------
-- 5. Triggers
-- ----------------------------------------------------------------------------

-- The period is derived from paid_on so a caller can never file a payment into
-- a period that does not match its own date.
CREATE OR REPLACE FUNCTION fincore.trg_investor_payments_derive_period()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.accounting_period_id :=
    fincore.fn_ensure_period(EXTRACT(YEAR FROM NEW.paid_on)::int, EXTRACT(MONTH FROM NEW.paid_on)::int);
  RETURN NEW;
END;
$$;

-- Append-only, mirroring fincore.trg_revenue_transactions_guard: no DELETE, and
-- the only permitted UPDATE is a single posted -> reversed transition that
-- leaves every financial column untouched.
CREATE OR REPLACE FUNCTION fincore.trg_investor_payments_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'investor_payments are append-only; hard delete of % is not permitted', OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Reverse the payment instead.';
  END IF;

  IF NOT (
    OLD.status = 'posted' AND NEW.status = 'reversed'
    AND ROW(NEW.investor_id, NEW.accounting_period_id, NEW.paid_on, NEW.amount_uzs, NEW.note, NEW.created_by, NEW.created_at)
      IS NOT DISTINCT FROM
        ROW(OLD.investor_id, OLD.accounting_period_id, OLD.paid_on, OLD.amount_uzs, OLD.note, OLD.created_by, OLD.created_at)
  ) THEN
    RAISE EXCEPTION 'investor_payments are immutable except a single posted->reversed transition (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payments'
      AND t.tgname = 'trg_investor_payments_derive_period' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payments_derive_period
      BEFORE INSERT ON fincore.investor_payments
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_investor_payments_derive_period()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payments'
      AND t.tgname = 'trg_investor_payments_guard' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payments_guard
      BEFORE UPDATE OR DELETE ON fincore.investor_payments
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_investor_payments_guard()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payments'
      AND t.tgname = 'trg_investor_payments_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payments_updated_at
      BEFORE UPDATE ON fincore.investor_payments
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_entitlements'
      AND t.tgname = 'trg_investor_entitlements_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_entitlements_updated_at
      BEFORE UPDATE ON fincore.investor_entitlements
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_profiles'
      AND t.tgname = 'trg_investor_profiles_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_profiles_updated_at
      BEFORE UPDATE ON fincore.investor_profiles
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;

  -- Money moving to an investor is a financial mutation, so it is audited the
  -- same way fincore.expenses, revenue_transactions and budget_lines are: the
  -- shared fincore.trg_audit_after_write(), INSERT and UPDATE, row level.
  --
  -- This is not only bookkeeping. That function calls fn_current_actor_id(),
  -- which fails closed, so attaching it is what makes a signed actor context
  -- MANDATORY for these tables at the database layer rather than a convention
  -- the service layer is trusted to follow.
  --
  -- DELETE is deliberately not audited here, matching the existing financial
  -- tables: investor_payments is append-only (trg_investor_payments_guard
  -- rejects DELETE outright), so there is no delete path to record.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payments'
      AND t.tgname = 'trg_investor_payments_audit' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payments_audit
      AFTER INSERT OR UPDATE ON fincore.investor_payments
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_entitlements'
      AND t.tgname = 'trg_investor_entitlements_audit' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_entitlements_audit
      AFTER INSERT OR UPDATE ON fincore.investor_entitlements
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write()';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Role and permissions
-- ----------------------------------------------------------------------------

-- allows_all_branch_scope = false: an investor never reads every branch by role
-- policy. Scope comes from the profile's branch, or from an explicit grant.
INSERT INTO fincore.roles (code, name, allows_all_branch_scope)
VALUES ('investor', 'Investor', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fincore.permissions (code, category, description) VALUES
  ('investor.view_own', 'investor', 'O‘zining investor hisob-kitobini ko‘rish'),
  ('investor.view_all', 'investor', 'Barcha investorlarning hisob-kitobini ko‘rish'),
  ('investor.manage',   'investor', 'Investor ulushi, tegishli summa va to‘lovlarini boshqarish')
ON CONFLICT (code) DO NOTHING;

-- The investor role gets exactly one capability. It deliberately receives no
-- expense, revenue, budget, user or role permission.
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code = 'investor.view_own'
WHERE r.code = 'investor' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code IN ('investor.view_all', 'investor.manage')
WHERE r.code = 'director' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
