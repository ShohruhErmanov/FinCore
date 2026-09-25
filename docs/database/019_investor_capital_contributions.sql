-- ============================================================================
-- FINCORE — 019_investor_capital_contributions.sql
--
-- Records one immutable initial capital contribution for a newly-created
-- investor and uses its accounting period as the first period eligible for
-- profit share. Existing investors are intentionally left without a row: no
-- historical start month can be inferred safely from a payout or entitlement.
-- Their current calculation therefore remains backward-compatible.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fincore.investor_capital_contributions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id        UUID NOT NULL UNIQUE
                       REFERENCES fincore.investor_profiles(id) ON DELETE RESTRICT,
  amount_uzs         fincore.uzs_amount_positive NOT NULL,
  start_period_id    UUID NOT NULL
                       REFERENCES fincore.accounting_periods(id) ON DELETE RESTRICT,
  payment_method_id  UUID NOT NULL
                       REFERENCES fincore.payment_methods(id) ON DELETE RESTRICT,
  created_by         UUID NOT NULL
                       REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.investor_capital_contributions IS
  'Append-only initial investor capital fact. It is separate from investor entitlements and payout payments; start_period_id is the first profit-share month.';
COMMENT ON COLUMN fincore.investor_capital_contributions.amount_uzs IS
  'Whole-UZS capital actually contributed. It never derives ownership_percent.';

CREATE INDEX IF NOT EXISTS investor_capital_contributions_start_period_idx
  ON fincore.investor_capital_contributions (start_period_id);
CREATE INDEX IF NOT EXISTS investor_capital_contributions_payment_method_idx
  ON fincore.investor_capital_contributions (payment_method_id);

-- The initial contribution is an immutable financial fact. Payment method is
-- deliberately limited to the three product-supported capital channels even
-- though the shared reference table may also contain operational methods.
CREATE OR REPLACE FUNCTION fincore.trg_investor_capital_contributions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_method_code TEXT;
  v_method_active BOOLEAN;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'investor capital contribution is append-only'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT code, is_active
    INTO v_method_code, v_method_active
  FROM fincore.payment_methods
  WHERE id = NEW.payment_method_id;

  IF v_method_code IS NULL OR NOT COALESCE(v_method_active, false)
     OR v_method_code NOT IN ('CASH', 'CARD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'capital contribution payment method must be active CASH, CARD, or BANK_TRANSFER'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- `users` cannot use the generic audit trigger because serialising the whole
-- row would leak password_hash. This narrow insert audit records only safe
-- account metadata and still fails closed on a missing signed actor context.
CREATE OR REPLACE FUNCTION fincore.trg_users_create_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fincore
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := fincore.fn_current_actor_id();
  INSERT INTO fincore.audit_logs (
    actor_user_id, action, entity_type, entity_id, result, before_payload, after_payload
  ) VALUES (
    v_actor,
    'users.create',
    'users',
    NEW.id::text,
    'success',
    NULL,
    jsonb_build_object(
      'id', NEW.id::text,
      'full_name', NEW.full_name,
      'status', NEW.status::text,
      'is_system', NEW.is_system
    )
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fincore.trg_users_create_audit() IS
  'Safe account-creation audit. Password hash, phone, email, session and secrets are deliberately excluded.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'users'
      AND t.tgname = 'trg_users_create_audit'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_users_create_audit
      AFTER INSERT ON fincore.users
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_users_create_audit()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'investor_capital_contributions'
      AND t.tgname = 'trg_investor_capital_contributions_guard'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_capital_contributions_guard
      BEFORE INSERT OR UPDATE OR DELETE ON fincore.investor_capital_contributions
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_investor_capital_contributions_guard()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'investor_capital_contributions'
      AND t.tgname = 'trg_investor_capital_contributions_audit'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_capital_contributions_audit
      AFTER INSERT ON fincore.investor_capital_contributions
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write()';
  END IF;

  -- Profile creation is part of the same atomic investor onboarding event.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore'
      AND c.relname = 'investor_profiles'
      AND t.tgname = 'trg_investor_profiles_audit'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_profiles_audit
      AFTER INSERT OR UPDATE ON fincore.investor_profiles
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write()';
  END IF;
END
$$;

-- A period remains present before the investor's start month, but its revenue
-- and share are zero. This preserves the 12-month report contract while making
-- annual aggregation (sum revenue, then apply ownership once) start-safe.
CREATE OR REPLACE VIEW fincore.v_investor_period_share AS
SELECT
  ip.id                                    AS investor_id,
  ap.id                                    AS accounting_period_id,
  ap.year,
  ap.month,
  ip.branch_id,
  ip.ownership_percent,
  COALESCE(fact.actual_uzs, 0)::bigint     AS fact_revenue_uzs,
  round(
    COALESCE(fact.actual_uzs, 0)::numeric * ip.ownership_percent / 100,
    2
  )::numeric(20, 2)                        AS calculated_share_uzs
FROM fincore.investor_profiles ip
CROSS JOIN fincore.accounting_periods ap
LEFT JOIN fincore.investor_capital_contributions capital
       ON capital.investor_id = ip.id
LEFT JOIN fincore.accounting_periods start_period
       ON start_period.id = capital.start_period_id
LEFT JOIN LATERAL (
  SELECT SUM(r.amount_uzs)::bigint AS actual_uzs
  FROM fincore.v_revenue_net_rows r
  WHERE r.accounting_period_id = ap.id
    AND (ip.branch_id IS NULL OR r.branch_id = ip.branch_id)
    AND (
      capital.id IS NULL
      OR (ap.year, ap.month) >= (start_period.year, start_period.month)
    )
) fact ON true
WHERE ip.is_active = true;

COMMENT ON VIEW fincore.v_investor_period_share IS
  'Derived investor share per period. New investors receive revenue only from their immutable capital start period; legacy investors without a contribution row retain the pre-019 behavior.';

REVOKE ALL ON fincore.investor_capital_contributions FROM PUBLIC;

COMMIT;
