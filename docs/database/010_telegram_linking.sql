-- ============================================================================
-- FINCORE — 010_telegram_linking.sql
--
-- PHASE 38: secure Telegram account linking.
--
-- Two operational tables only. Neither stores a bot token, a webhook secret or
-- a raw linking token — those live in backend environment configuration and,
-- for the linking token, only as an HMAC digest.
--
-- Safety invariants:
--   * no financial, audit, import or report row is touched;
--   * both tables are purely operational and cascade with the users account
--     they belong to (PHASE 36 user_identities history is unaffected);
--   * one live Telegram identity may back exactly one FinCore account, and one
--     FinCore account may hold exactly one live Telegram binding;
--   * private chats only — a group or channel can never be bound.
--
-- Forward-only and idempotent after 001 -> 009.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Lifecycle enums
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'telegram_account_status'
  ) THEN
    CREATE TYPE fincore.telegram_account_status AS ENUM ('linked', 'disabled', 'unlinked');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'telegram_link_token_status'
  ) THEN
    CREATE TYPE fincore.telegram_link_token_status AS ENUM ('pending', 'consumed', 'revoked');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- telegram_accounts — the live binding between a FinCore account and a chat
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.telegram_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES fincore.users(id) ON DELETE CASCADE,

  -- Delivery in a later phase needs the real numeric ids, so they are stored as
  -- given by Telegram. They are protected by table privileges (no PUBLIC grant)
  -- and MUST NOT be echoed back through any API — the link-status endpoint
  -- returns a masked suffix only.
  telegram_user_id BIGINT NOT NULL,
  chat_id          BIGINT NOT NULL,

  -- Private chats only: a group/channel binding would let anyone in that chat
  -- act as the linked employee.
  chat_type        TEXT NOT NULL DEFAULT 'private'
                     CONSTRAINT telegram_accounts_private_chat_only CHECK (chat_type = 'private'),

  -- Display-only, supplied by Telegram. Never used as identity proof.
  telegram_username TEXT,
  display_name      TEXT,

  status       fincore.telegram_account_status NOT NULL DEFAULT 'linked',
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at  TIMESTAMPTZ,
  disabled_at  TIMESTAMPTZ,
  unlinked_at  TIMESTAMPTZ,
  version      INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT telegram_accounts_status_consistent CHECK (
    (status = 'disabled') = (disabled_at IS NOT NULL)
    AND (status = 'unlinked') = (unlinked_at IS NOT NULL)
  )
);

COMMENT ON TABLE fincore.telegram_accounts IS
  'PHASE 38: live Telegram binding for a FinCore account. Operational only — cascades with the users row. Holds no bot token and no webhook secret; chat_id/telegram_user_id are never returned by an API.';
COMMENT ON COLUMN fincore.telegram_accounts.telegram_user_id IS
  'Telegram numeric user id. Identity for uniqueness only — never accepted from a client as proof of who someone is.';
COMMENT ON COLUMN fincore.telegram_accounts.chat_id IS
  'Private chat id used by a later delivery phase. Never exposed through an API response.';
COMMENT ON COLUMN fincore.telegram_accounts.status IS
  'linked = deliverable; disabled = retained but suppressed; unlinked = historical row, frees the uniqueness slot.';

REVOKE ALL ON TABLE fincore.telegram_accounts FROM PUBLIC;

-- One live binding per FinCore account, and one live binding per Telegram
-- identity. Partial so an unlinked row stays for history without blocking a
-- later re-link by the same person.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_accounts_live_user_unique
  ON fincore.telegram_accounts (user_id)
  WHERE status <> 'unlinked';

CREATE UNIQUE INDEX IF NOT EXISTS telegram_accounts_live_identity_unique
  ON fincore.telegram_accounts (telegram_user_id)
  WHERE status <> 'unlinked';

-- ----------------------------------------------------------------------------
-- telegram_link_tokens — single-use, expiring proof of who is linking
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.telegram_link_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES fincore.users(id) ON DELETE CASCADE,

  -- HMAC-SHA256(raw_token, TELEGRAM_LINK_TOKEN_PEPPER), base64url. The raw
  -- token exists only in the HTTP response that created it and in the message
  -- the employee sends to the bot; it is never written down anywhere.
  token_hash    TEXT NOT NULL,

  status        fincore.telegram_link_token_status NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT telegram_link_tokens_status_consistent CHECK (
    (status = 'consumed') = (consumed_at IS NOT NULL)
    AND (status = 'revoked') = (revoked_at IS NOT NULL)
  )
);

COMMENT ON TABLE fincore.telegram_link_tokens IS
  'PHASE 38: one-time expiring linking tokens. Stores only an HMAC of the token; a replay, an expired token or a revoked token can never bind an account.';
COMMENT ON COLUMN fincore.telegram_link_tokens.token_hash IS
  'HMAC-SHA256 of the raw token under TELEGRAM_LINK_TOKEN_PEPPER. The raw value is never persisted, logged or audited.';

REVOKE ALL ON TABLE fincore.telegram_link_tokens FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_link_tokens_hash_unique
  ON fincore.telegram_link_tokens (token_hash);

-- At most one pending token per account: issuing a new link revokes the old one.
CREATE INDEX IF NOT EXISTS telegram_link_tokens_pending_by_user
  ON fincore.telegram_link_tokens (user_id)
  WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- updated_at maintenance, reusing the helper installed by 001
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'telegram_accounts'
      AND t.tgname = 'trg_telegram_accounts_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_telegram_accounts_updated_at
      BEFORE UPDATE ON fincore.telegram_accounts
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'telegram_link_tokens'
      AND t.tgname = 'trg_telegram_link_tokens_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_telegram_link_tokens_updated_at
      BEFORE UPDATE ON fincore.telegram_link_tokens
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Purge any bot token an earlier build may have persisted
-- ----------------------------------------------------------------------------

-- The token now lives only in TELEGRAM_BOT_TOKEN. This row is a credential, not
-- business data; deleting it is the point of the phase. It is empty on the
-- current database, so this is defensive rather than corrective.
DELETE FROM fincore.system_settings WHERE key = 'telegram_bot_token';

COMMIT;
