-- ============================================================================
-- FINCORE — 011_notification_event_outbox.sql
--
-- PHASE 39: transactional notification outbox.
--
-- Two tables with deliberately different natures:
--
--   notification_events      immutable. Written inside the SAME transaction as
--                            the business mutation it describes, so an event
--                            can never exist for a change that rolled back —
--                            and can never be rewritten afterwards.
--
--   notification_deliveries  mutable outbox state. One row per (event,
--                            recipient, channel); a PHASE 40 worker claims rows
--                            with FOR UPDATE SKIP LOCKED under a lease.
--
-- Safety invariants:
--   * no financial, audit, import, revenue or user row is read, moved or
--     deleted by this migration;
--   * neither table carries a secret — no bot token, webhook secret, link
--     token, session token, password or raw Telegram update;
--   * attribution uses fincore.user_identities (PHASE 36), so deleting a
--     users account never deletes notification history and never orphans it;
--   * nothing here cascades from fincore.users.
--
-- Forward-only and idempotent after 001 -> 010.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'notification_channel'
  ) THEN
    -- Telegram is the only channel PHASE 40 will implement; the enum exists so
    -- adding another one later is a migration, not a schema redesign.
    CREATE TYPE fincore.notification_channel AS ENUM ('telegram');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'fincore' AND t.typname = 'notification_delivery_status'
  ) THEN
    CREATE TYPE fincore.notification_delivery_status AS ENUM (
      'pending', 'processing', 'retry', 'delivered', 'cancelled', 'permanently_failed'
    );
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- notification_events — immutable record of "this happened"
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.notification_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vocabulary is owned by the backend catalog, never by a client. TEXT rather
  -- than an enum on purpose: adding an event type must not require a migration,
  -- and the catalog already refuses anything it does not define.
  event_type        TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  aggregate_type    TEXT NOT NULL CHECK (length(trim(aggregate_type)) > 0),

  -- TEXT, not UUID: some aggregates are addressed by a composite logical id
  -- (a DailyRevenue is "daily-{branchId}-{YYYY-MM-DD}", PHASE 19).
  aggregate_id      TEXT NOT NULL CHECK (length(trim(aggregate_id)) > 0),

  -- NULL for a company-wide event. RESTRICT, not CASCADE: a branch is never
  -- hard-deleted, and history must not disappear if that ever changes.
  branch_id         UUID REFERENCES fincore.branches(id) ON DELETE RESTRICT,

  -- Who caused it. Points at the durable identity anchor (PHASE 36), so the
  -- attribution survives deletion of the authentication account. NULL means the
  -- event was raised by the system rather than by a person.
  actor_identity_id UUID REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,

  -- Minimal, backend-shaped summary. The service validates it against a
  -- per-event-type allowlist before this row is ever written.
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb
                      CONSTRAINT notification_events_payload_is_object
                      CHECK (jsonb_typeof(payload) = 'object'),

  -- Logical identity of the event, built by the backend catalog. Globally
  -- unique rather than scoped: every key the catalog builds is prefixed with
  -- its event_type, so a global index gives the same protection as
  -- (event_type, dedupe_key) while ALSO catching a key-construction bug that
  -- accidentally makes two different event types collide.
  dedupe_key        TEXT NOT NULL CHECK (length(trim(dedupe_key)) > 0),

  -- Which recipient policy / message template applied when this was raised, so
  -- a later policy change cannot silently reinterpret old history.
  policy_version    INT NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  template_version  INT NOT NULL DEFAULT 1 CHECK (template_version > 0),

  -- When the business fact happened vs. when it may first be delivered. They
  -- differ for deferred events (e.g. an end-of-day reminder).
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fincore.notification_events IS
  'PHASE 39: immutable notification events. Written in the same transaction as the business mutation, so an event cannot outlive a rollback. Contains no secret and no full-record snapshot; attribution is via user_identities so it survives account deletion.';
COMMENT ON COLUMN fincore.notification_events.payload IS
  'Minimal backend-built summary. Validated against a per-event-type allowlist; password/token/secret/chat-id style fields are refused before insert.';
COMMENT ON COLUMN fincore.notification_events.dedupe_key IS
  'Globally unique logical identity of the event, always prefixed with event_type by the catalog. Re-raising the same logical event is a no-op rather than a duplicate.';
COMMENT ON COLUMN fincore.notification_events.actor_identity_id IS
  'fincore.user_identities(id) — NOT users(id). Deleting the account leaves this attribution intact.';

REVOKE ALL ON TABLE fincore.notification_events FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS notification_events_dedupe_key_unique
  ON fincore.notification_events (dedupe_key);

-- History lookups: "what happened to this aggregate".
CREATE INDEX IF NOT EXISTS notification_events_by_aggregate
  ON fincore.notification_events (aggregate_type, aggregate_id, occurred_at DESC);

-- Immutability, using the same helpers audit_logs and period_status_events use.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'notification_events'
      AND t.tgname = 'trg_notification_events_no_update' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_notification_events_no_update
      BEFORE UPDATE ON fincore.notification_events
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_update()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'notification_events'
      AND t.tgname = 'trg_notification_events_no_delete' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_notification_events_no_delete
      BEFORE DELETE ON fincore.notification_events
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_reject_delete()';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- notification_deliveries — mutable outbox state, one row per recipient
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fincore.notification_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT: events are append-only, so this can never dangle. It also means
  -- a delivery row can never be orphaned by tidying up events.
  event_id              UUID NOT NULL REFERENCES fincore.notification_events(id) ON DELETE RESTRICT,

  -- Durable identity again: deleting the account must not delete the record
  -- that a message was (or was not) delivered to that person.
  recipient_identity_id UUID NOT NULL REFERENCES fincore.user_identities(id) ON DELETE RESTRICT,

  channel               fincore.notification_channel NOT NULL,
  status                fincore.notification_delivery_status NOT NULL DEFAULT 'pending',

  attempts              INT NOT NULL DEFAULT 0
                          CONSTRAINT notification_deliveries_attempts_nonnegative
                          CHECK (attempts >= 0),

  next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Lease held by a PHASE 40 worker while it is processing this row. An expired
  -- lease is reclaimable, which is how a crashed worker recovers.
  lease_until           TIMESTAMPTZ,
  lease_owner           TEXT,

  last_error_code       TEXT,
  provider_message_id   TEXT,

  delivered_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  permanently_failed_at TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A terminal status and its timestamp are the same fact; they cannot diverge.
  CONSTRAINT notification_deliveries_terminal_timestamps CHECK (
    (status = 'delivered') = (delivered_at IS NOT NULL)
    AND (status = 'cancelled') = (cancelled_at IS NOT NULL)
    AND (status = 'permanently_failed') = (permanently_failed_at IS NOT NULL)
  ),
  -- A lease is an owner AND a deadline, never one without the other.
  CONSTRAINT notification_deliveries_lease_paired CHECK (
    (lease_owner IS NULL) = (lease_until IS NULL)
  ),
  -- Processing without a lease would be invisible to expiry recovery.
  CONSTRAINT notification_deliveries_processing_has_lease CHECK (
    status <> 'processing' OR lease_owner IS NOT NULL
  )
);

COMMENT ON TABLE fincore.notification_deliveries IS
  'PHASE 39: per-recipient outbox state. Claimed by a PHASE 40 worker with FOR UPDATE SKIP LOCKED under a lease. Holds no chat id and no credential — the channel address is resolved at send time from the recipient own verified link.';
COMMENT ON COLUMN fincore.notification_deliveries.recipient_identity_id IS
  'fincore.user_identities(id) — NOT users(id). Delivery history survives account deletion.';
COMMENT ON COLUMN fincore.notification_deliveries.lease_owner IS
  'Opaque worker identifier. Together with lease_until it lets a crashed worker''s rows be reclaimed after expiry instead of being stuck in processing forever.';

REVOKE ALL ON TABLE fincore.notification_deliveries FROM PUBLIC;

-- One delivery per recipient per channel per event: a re-run of fan-out is a
-- no-op instead of a second message.
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_unique_target
  ON fincore.notification_deliveries (event_id, recipient_identity_id, channel);

-- The claim path: due work, oldest first. Terminal rows are outside the
-- predicate, so they are not even visible to the worker's index scan.
CREATE INDEX IF NOT EXISTS notification_deliveries_claimable
  ON fincore.notification_deliveries (next_attempt_at)
  WHERE status IN ('pending', 'retry');

-- The recovery path: leases that a worker never released.
CREATE INDEX IF NOT EXISTS notification_deliveries_expired_leases
  ON fincore.notification_deliveries (lease_until)
  WHERE status = 'processing';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'fincore' AND c.relname = 'notification_deliveries'
      AND t.tgname = 'trg_notification_deliveries_updated_at' AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_notification_deliveries_updated_at
      BEFORE UPDATE ON fincore.notification_deliveries
      FOR EACH ROW EXECUTE FUNCTION fincore.trg_touch_updated_at()';
  END IF;
END;
$$;

COMMIT;
