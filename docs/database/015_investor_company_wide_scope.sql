-- ============================================================================
-- FINCORE — 015_investor_company_wide_scope.sql
--
-- Lets the investor role be granted without a branch.
--
-- WHY A SECOND CAPABILITY AND NOT allows_all_branch_scope = true
-- --------------------------------------------------------------
-- The two are different statements and must not be merged:
--
--   allows_all_branch_scope  — "this role reads EVERY branch's ledger".
--     AuthService turns it into a branchScopes list containing every active
--     branch, and fincore.trg_user_roles_validate_branch_scope treats a NULL
--     grant as shorthand for that list.
--
--   allows_branchless_scope  — "this role has no branch dimension at all".
--     An investor reads no branch ledger; they read their own settlement.
--     Their grant carries no branch because none applies, not because they
--     may see all of them.
--
-- Setting allows_all_branch_scope = true on the investor role would have made
-- the trigger pass, but it would also have declared the investor an all-branch
-- reader — a claim that is false and that other code is entitled to rely on.
--
-- Safety invariants:
--   * one additive column with a false default, so every existing role keeps
--     its exact current behaviour;
--   * the trigger stays fail-closed: a role that declares neither capability
--     still cannot be granted branchlessly, and an unknown role_id is denied;
--   * no table is dropped, truncated or rewritten; no business row is touched;
--   * only the investor role row is updated, and only in the new column.
--
-- Forward-only and idempotent after 001 -> 014.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Capability
-- ----------------------------------------------------------------------------

ALTER TABLE fincore.roles
  ADD COLUMN IF NOT EXISTS allows_branchless_scope BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN fincore.roles.allows_branchless_scope IS
  'The role has no branch dimension, so a user_roles grant may carry branch_id = NULL. This is NOT allows_all_branch_scope: it does not claim the role reads every branch.';

-- The investor is the only role with this shape today. Every other role keeps
-- the false default and therefore behaves exactly as before.
UPDATE fincore.roles
   SET allows_branchless_scope = true
 WHERE code = 'investor'
   AND allows_branchless_scope IS DISTINCT FROM true;

-- ----------------------------------------------------------------------------
-- 2. Grant validation
-- ----------------------------------------------------------------------------

-- Same shape as the original, with the second capability added to the escape
-- clause. Both lookups COALESCE to false, so a role that declares neither — or
-- a role_id that does not resolve at all — is still denied a NULL grant.
CREATE OR REPLACE FUNCTION fincore.trg_user_roles_validate_branch_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_allows_all        boolean;
  v_allows_branchless boolean;
BEGIN
  SELECT allows_all_branch_scope, allows_branchless_scope
    INTO v_allows_all, v_allows_branchless
    FROM fincore.roles WHERE id = NEW.role_id;

  IF NEW.branch_id IS NULL
     AND NOT COALESCE(v_allows_all, false)
     AND NOT COALESCE(v_allows_branchless, false) THEN
    RAISE EXCEPTION 'role % may not be granted with an all-branch (NULL) scope', NEW.role_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged; only the function body it already points at
-- has been replaced, so no other role's validation path moves.

COMMIT;
