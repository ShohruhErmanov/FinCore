import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Migration 011 is written but deliberately NOT applied, so the guarantees it
 * declares cannot be executed against PostgreSQL here — and this repository has
 * no integration-test harness that talks to a real database.
 *
 * These assertions therefore check the migration text itself: that it declares
 * the immutability, uniqueness, lifecycle and no-cascade rules PHASE 39 depends
 * on, and that it introduces nothing destructive. Applying it stays a separate,
 * explicitly approved step.
 */
const sql = readFileSync(
  join(__dirname, '..', '..', '..', 'docs', 'database', '011_notification_event_outbox.sql'),
  'utf8',
);

describe('migration 011 — safety', () => {
  it('is a single all-or-nothing transaction', () => {
    expect(sql.match(/^BEGIN;/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;/gm)).toHaveLength(1);
  });

  it('creates only the two notification tables', () => {
    const created = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([\w.]+)/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      'fincore.notification_deliveries',
      'fincore.notification_events',
    ]);
  });

  it('never drops, truncates or deletes anything', () => {
    expect(sql).not.toMatch(/\bDROP\b/);
    expect(sql).not.toMatch(/\bTRUNCATE\b/);
    expect(sql).not.toMatch(/\bDELETE FROM\b/);
    expect(sql).not.toMatch(/\bUPDATE fincore\./);
    // No back-fill from existing business tables either.
    expect(sql).not.toMatch(/INSERT INTO fincore\.(?!notification)/);
  });

  it('withholds PUBLIC access from both tables', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE fincore\.notification_events FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE fincore\.notification_deliveries FROM PUBLIC/);
  });
});

describe('migration 011 — notification_events immutability', () => {
  it('rejects UPDATE and DELETE with the project-wide append-only helpers', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_notification_events_no_update\s+BEFORE UPDATE ON fincore\.notification_events[\s\S]{0,120}trg_reject_update/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER trg_notification_events_no_delete\s+BEFORE DELETE ON fincore\.notification_events[\s\S]{0,120}trg_reject_delete/,
    );
  });

  it('has no updated_at column or touch trigger — an event is written once', () => {
    const events = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS fincore.notification_events'),
      sql.indexOf('CREATE TABLE IF NOT EXISTS fincore.notification_deliveries'),
    );
    expect(events).not.toMatch(/updated_at/);
    expect(sql).not.toMatch(/trg_notification_events_updated_at/);
  });

  it('makes the dedupe key globally unique', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS notification_events_dedupe_key_unique\s+ON fincore\.notification_events \(dedupe_key\)/,
    );
  });

  it('keeps the payload a JSON object', () => {
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(payload\) = 'object'\)/);
  });
});

describe('migration 011 — history survives account deletion', () => {
  it('attributes the actor to user_identities, never to users', () => {
    expect(sql).toMatch(
      /actor_identity_id UUID REFERENCES fincore\.user_identities\(id\) ON DELETE RESTRICT/,
    );
  });

  it('attributes the recipient to user_identities, never to users', () => {
    expect(sql).toMatch(
      /recipient_identity_id UUID NOT NULL REFERENCES fincore\.user_identities\(id\) ON DELETE RESTRICT/,
    );
  });

  it('never cascades from any table', () => {
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/REFERENCES fincore\.users\(/);
  });
});

describe('migration 011 — delivery state model', () => {
  it('defines the full delivery lifecycle', () => {
    expect(sql).toMatch(
      /CREATE TYPE fincore\.notification_delivery_status AS ENUM \(\s*'pending', 'processing', 'retry', 'delivered', 'cancelled', 'permanently_failed'\s*\)/,
    );
  });

  it('forbids negative attempts', () => {
    expect(sql).toMatch(/notification_deliveries_attempts_nonnegative\s+CHECK \(attempts >= 0\)/);
  });

  it('ties each terminal status to its timestamp', () => {
    expect(sql).toMatch(/\(status = 'delivered'\) = \(delivered_at IS NOT NULL\)/);
    expect(sql).toMatch(/\(status = 'cancelled'\) = \(cancelled_at IS NOT NULL\)/);
    expect(sql).toMatch(/\(status = 'permanently_failed'\) = \(permanently_failed_at IS NOT NULL\)/);
  });

  it('requires a lease owner and deadline together, and for anything processing', () => {
    expect(sql).toMatch(/\(lease_owner IS NULL\) = \(lease_until IS NULL\)/);
    expect(sql).toMatch(/status <> 'processing' OR lease_owner IS NOT NULL/);
  });

  it('allows one delivery per event, recipient and channel', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_unique_target\s+ON fincore\.notification_deliveries \(event_id, recipient_identity_id, channel\)/,
    );
  });

  it('indexes only the claim and lease-recovery paths', () => {
    expect(sql).toMatch(
      /notification_deliveries_claimable[\s\S]{0,120}WHERE status IN \('pending', 'retry'\)/,
    );
    expect(sql).toMatch(
      /notification_deliveries_expired_leases[\s\S]{0,120}WHERE status = 'processing'/,
    );
    // Five in total across both tables — dedupe, aggregate history, the unique
    // delivery target, the claim path and lease recovery. No speculative extras.
    expect(sql.match(/CREATE (UNIQUE )?INDEX/g)).toHaveLength(5);
  });
});

describe('migration 011 — no secrets', () => {
  it('declares no credential-shaped column', () => {
    const columns = [...sql.matchAll(/^\s{2}(\w+)\s+(UUID|TEXT|INT|JSONB|TIMESTAMPTZ|fincore\.)/gm)].map(
      (m) => m[1]!.toLowerCase(),
    );
    expect(columns.length).toBeGreaterThan(20);
    for (const forbidden of ['token', 'secret', 'password', 'chat_id', 'pepper', 'phone', 'email'])
      expect(columns).not.toContain(forbidden);
  });
});
