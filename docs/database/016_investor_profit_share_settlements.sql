-- ============================================================================
-- FINCORE — 016_investor_profit_share_settlements.sql
--
-- The investor's share of actual revenue, and the request -> decision -> payment
-- workflow that settles it.
--
-- WHY NO NEW FACT TABLE
-- ---------------------
-- 014 had to RECORD entitlement because nothing in the schema defined what an
-- investor was owed. That is no longer true for this figure: actual revenue
-- already exists as fincore.v_revenue_net_rows (posted revenue transactions,
-- reversed ones excluded), keyed by accounting period and branch. A new "fact
-- revenue" table would be a second copy of numbers the ledger already owns and
-- would drift from it the first time a transaction is reversed. So the share is
-- a VIEW over the live ledger, not stored data.
--
-- ENTITLEMENT AND SHARE ARE DIFFERENT NUMBERS, DELIBERATELY
-- ---------------------------------------------------------
-- fincore.investor_entitlements stays exactly what 014 made it: an amount a
-- director RECORDS for a period, whatever the business reason. The share added
-- here is DERIVED: actual revenue x ownership_percent. They are not merged, one
-- does not overwrite the other, and no trigger keeps them in step — they answer
-- two different questions and the business may well want both.
--
-- MONEY REPRESENTATION — A DELIBERATE, NARROW DEVIATION
-- -----------------------------------------------------
-- Every stored money column in FinCore is BIGINT whole so'm, and this migration
-- does not change that: investor_payments stays BIGINT, and a payout request's
-- requested_amount_uzs is BIGINT too, because a payment that cannot be made in
-- whole so'm cannot be made at all.
--
-- The SHARE itself is NUMERIC(20,2). It is a computed ratio, not a ledger
-- amount: 302 841 471 x 2% is exactly 6 056 829.42, and rounding that to whole
-- so'm before anyone sees it would silently lose the remainder on every period
-- and make the yearly total disagree with the sum of its months. So the exact
-- figure is computed and displayed, and only the payable amount is integer.
--
-- Rounding policy, stated once and applied everywhere:
--   * share            = round(actual_revenue::numeric * ownership_percent / 100, 2)
--                        — half-up, PostgreSQL NUMERIC, never floating point;
--   * payable ceiling  = floor(share - already settled) in whole so'm;
--   * the sub-so'm remainder is never written off and never paid — it simply
--     stays visible in the remaining figure.
--
-- Safety invariants:
--   * one enum, one view, one table, three permissions — all additive;
--   * nothing existing is read, moved, altered or deleted;
--   * 014's tables, its append-only payment ledger and its triggers are untouched;
--   * a request's financial facts are immutable after insert — a director can
--     never revise what an investor asked for;
--   * the status machine is enforced in the database, not only in the service;
--   * a paid request is terminal and is bound 1:1 to its payment row, so the
--     same request cannot be paid twice even by direct SQL;
--   * at most one open request per investor per period;
--   * the table carries the shared audit trigger, which also makes a signed
--     actor context MANDATORY at the database layer (see section 6).
--
-- Forward-only and idempotent after 001 -> 015.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Request status
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'investor_payout_status'
  ) THEN
    CREATE TYPE fincore.investor_payout_status AS ENUM (
      'pending',   -- investor asked, nobody has decided
      'approved',  -- director agreed; money has not moved yet
      'rejected',  -- director declined, with a reason
      'paid',      -- an investor_payments row settles it
      'cancelled'  -- withdrawn by the investor before a decision, or after approval
    );
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. The share, derived from the live revenue ledger
-- ----------------------------------------------------------------------------
--
-- One row per active investor per accounting period. Two scopes, decided by the
-- profile itself rather than by a flag invented here:
--
--   * branch_id IS NULL  -> the investor owns a share of the company, so the
--     actual revenue is every branch's (this is the PHASE 47 company-wide case);
--   * branch_id IS NOT NULL -> the investor owns a share of that one branch, so
--     only that branch's revenue counts.
--
-- Periods with no revenue still produce a row, with zero. An investor asking
-- "what was my share in January?" deserves the answer 0, not an empty result.

CREATE OR REPLACE VIEW fincore.v_investor_period_share AS
SELECT
  ip.id                                    AS investor_id,
  ap.id                                    AS accounting_period_id,
  ap.year,
  ap.month,
  ip.branch_id,
  ip.ownership_percent,
  COALESCE(fact.actual_uzs, 0)::bigint     AS fact_revenue_uzs,
  -- NUMERIC throughout: bigint / 100 would truncate, and float would be wrong
  -- in ways that only show up on some amounts.
  round(
    COALESCE(fact.actual_uzs, 0)::numeric * ip.ownership_percent / 100,
    2
  )::numeric(20, 2)                        AS calculated_share_uzs
FROM fincore.investor_profiles ip
CROSS JOIN fincore.accounting_periods ap
LEFT JOIN LATERAL (
  SELECT SUM(r.amount_uzs)::bigint AS actual_uzs
  FROM fincore.v_revenue_net_rows r
  WHERE r.accounting_period_id = ap.id
    AND (ip.branch_id IS NULL OR r.branch_id = ip.branch_id)
) fact ON true
WHERE ip.is_active = true;

COMMENT ON VIEW fincore.v_investor_period_share IS
  'Derived investor share per accounting period: posted revenue (branch-scoped when the profile names a branch, company-wide otherwise) times ownership_percent, exact to two decimals. Never stored — always the ledger''s current truth.';

-- ----------------------------------------------------------------------------
-- 3. Payout requests
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.investor_payout_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  investor_id           UUID NOT NULL REFERENCES fincore.investor_profiles(id) ON DELETE CASCADE,
  accounting_period_id  UUID NOT NULL REFERENCES fincore.accounting_periods(id) ON DELETE RESTRICT,

  -- What was actually asked for. BIGINT, because this is what gets paid.
  requested_amount_uzs  fincore.uzs_amount_positive NOT NULL,

  -- What the share WAS when the request was raised. Revenue can be reversed and
  -- ownership_percent can be renegotiated afterwards; a decision must be
  -- reviewable against the numbers it was actually made on, so these three are
  -- snapshots, not lookups.
  calculated_share_uzs  NUMERIC(20, 2) NOT NULL CHECK (calculated_share_uzs >= 0),
  fact_revenue_uzs      BIGINT NOT NULL CHECK (fact_revenue_uzs >= 0),
  ownership_percent     NUMERIC(5, 2) NOT NULL
                          CHECK (ownership_percent >= 0 AND ownership_percent <= 100),

  status                fincore.investor_payout_status NOT NULL DEFAULT 'pending',

  investor_note         TEXT,
  decision_note         TEXT,

  decided_at            TIMESTAMPTZ,
  decided_by            UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,

  -- The payment that settles this request. Set exactly when status becomes
  -- 'paid', and unique, so one payment can never settle two requests.
  payment_id            UUID REFERENCES fincore.investor_payments(id) ON DELETE RESTRICT,

  created_by            UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A request may never ask for more than the share it is based on. The service
  -- applies a tighter rule (it also subtracts what is already settled), but this
  -- one holds even against direct SQL.
  CONSTRAINT investor_payout_within_share
    CHECK (requested_amount_uzs::numeric <= calculated_share_uzs),

  -- A decision without a decider, or a decider without a decision, means the
  -- audit trail cannot answer "who".
  CONSTRAINT investor_payout_decision_complete
    CHECK (
      (status IN ('pending'))
      OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
      OR (status = 'cancelled')
    ),

  -- Rejecting without saying why is not a decision anyone can act on.
  CONSTRAINT investor_payout_rejection_reasoned
    CHECK (status <> 'rejected' OR nullif(btrim(decision_note), '') IS NOT NULL),

  -- Paid means the money is in the ledger. No payment row, no paid status.
  CONSTRAINT investor_payout_paid_has_payment
    CHECK ((status = 'paid') = (payment_id IS NOT NULL))
);

COMMENT ON TABLE fincore.investor_payout_requests IS
  'Investor-initiated payout requests against a period''s derived share, with the director decision and the single investor_payments row that settles them.';

REVOKE ALL ON TABLE fincore.investor_payout_requests FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 4. Indexes, including the double-payment guards
-- ----------------------------------------------------------------------------

-- One payment settles at most one request. This is the hard stop against paying
-- the same request twice: the second attempt has to reuse the payment id and
-- collides here, or invent a second payment and collide with the rule below.
CREATE UNIQUE INDEX IF NOT EXISTS investor_payout_requests_payment_unique
  ON fincore.investor_payout_requests (payment_id)
  WHERE payment_id IS NOT NULL;

-- An investor cannot have two live requests for the same period. Rejected,
-- cancelled and paid rows are excluded, so a rejected month can be asked for
-- again, and a paid month can be asked for again only for what is still left.
CREATE UNIQUE INDEX IF NOT EXISTS investor_payout_requests_open_unique
  ON fincore.investor_payout_requests (investor_id, accounting_period_id)
  WHERE status IN ('pending', 'approved');

-- The director's queue: everything still awaiting a decision, oldest first.
CREATE INDEX IF NOT EXISTS investor_payout_requests_pending_idx
  ON fincore.investor_payout_requests (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS investor_payout_requests_investor_idx
  ON fincore.investor_payout_requests (investor_id, accounting_period_id);

-- ----------------------------------------------------------------------------
-- 5. The status machine, enforced in the database
-- ----------------------------------------------------------------------------
--
-- The service enforces the same rules with better error messages. This trigger
-- exists so that a bug, a migration script or a direct psql session cannot walk
-- a request backwards out of a terminal state or quietly restate what was asked
-- for after a decision was made.

CREATE OR REPLACE FUNCTION fincore.trg_investor_payout_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Every request starts life awaiting a decision.
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'a payout request must be created as pending, not %', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- The financial facts of a request are what the investor asked for. Nobody
  -- revises them afterwards — a different amount is a different request.
  IF NEW.investor_id IS DISTINCT FROM OLD.investor_id
     OR NEW.accounting_period_id IS DISTINCT FROM OLD.accounting_period_id
     OR NEW.requested_amount_uzs IS DISTINCT FROM OLD.requested_amount_uzs
     OR NEW.calculated_share_uzs IS DISTINCT FROM OLD.calculated_share_uzs
     OR NEW.fact_revenue_uzs IS DISTINCT FROM OLD.fact_revenue_uzs
     OR NEW.ownership_percent IS DISTINCT FROM OLD.ownership_percent
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a payout request''s facts are immutable once raised'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Terminal means terminal. Especially 'paid': money has already moved.
    IF OLD.status IN ('paid', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'payout request is already % and cannot change', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (
      (OLD.status = 'pending'  AND NEW.status IN ('approved', 'rejected', 'cancelled'))
      OR (OLD.status = 'approved' AND NEW.status IN ('paid', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'payout request cannot move from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    -- Re-pointing a settled request at a different payment would hide a double
    -- payment behind an unchanged status.
    RAISE EXCEPTION 'a payout request''s payment cannot be replaced'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The settling payment must be for the same investor and the same period, and
  -- must not be a reversed one.
  IF NEW.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM fincore.investor_payments p
      WHERE p.id = NEW.payment_id
        AND p.investor_id = NEW.investor_id
        AND p.accounting_period_id = NEW.accounting_period_id
        AND p.status = 'posted'
        AND p.amount_uzs = NEW.requested_amount_uzs
    ) THEN
      RAISE EXCEPTION 'the settling payment must be a posted payment of the requested amount, for this investor and period'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fincore.trg_investor_payout_requests_guard() IS
  'Keeps a payout request''s facts immutable and its status transitions legal, independently of the application.';

-- ----------------------------------------------------------------------------
-- 6. Triggers
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payout_requests'
      AND t.tgname = 'trg_investor_payout_requests_guard' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payout_requests_guard
      BEFORE INSERT OR UPDATE ON fincore.investor_payout_requests
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_investor_payout_requests_guard()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payout_requests'
      AND t.tgname = 'trg_investor_payout_requests_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payout_requests_updated_at
      BEFORE UPDATE ON fincore.investor_payout_requests
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;

  -- Audited like every other table where money is decided. As in 014, this is
  -- not only bookkeeping: fincore.trg_audit_after_write() calls
  -- fn_current_actor_id(), which fails closed, so attaching it makes a signed
  -- actor context MANDATORY for this table at the database layer.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'investor_payout_requests'
      AND t.tgname = 'trg_investor_payout_requests_audit' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_investor_payout_requests_audit
      AFTER INSERT OR UPDATE ON fincore.investor_payout_requests
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_audit_after_write()';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 7. Permissions
-- ----------------------------------------------------------------------------
--
-- Three new codes, one per distinct authority. Reading requests needs no new
-- permission: an investor reads their own through investor.view_own and a
-- director reads everyone's through investor.view_all, both of which 014
-- already defines and grants.

INSERT INTO fincore.permissions (code, category, description) VALUES
  ('investor.settlement.request', 'investor', 'O‘z ulushi bo‘yicha to‘lov so‘rovi yuborish'),
  ('investor.settlement.approve', 'investor', 'Investor to‘lov so‘rovini tasdiqlash yoki rad etish'),
  ('investor.settlement.pay',     'investor', 'Tasdiqlangan so‘rov bo‘yicha to‘lovni amalga oshirish')
ON CONFLICT (code) DO NOTHING;

-- The investor may ask. Nothing more: approving or paying one's own request is
-- exactly the separation this workflow exists to create.
INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code = 'investor.settlement.request'
WHERE r.code = 'investor' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO fincore.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fincore.roles r
JOIN fincore.permissions p ON p.code IN ('investor.settlement.approve', 'investor.settlement.pay')
WHERE r.code = 'director' AND r.is_active = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
