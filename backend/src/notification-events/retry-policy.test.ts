import { describe, expect, it } from 'vitest';
import { backoffDelayMs, nextAttemptAt } from './retry-policy';

const opts = { baseMs: 30_000, maxMs: 3_600_000 };

describe('backoffDelayMs', () => {
  it('waits the base delay on the first attempt', () => {
    expect(backoffDelayMs(1, opts)).toBe(30_000);
  });

  it('doubles with every further attempt', () => {
    expect(backoffDelayMs(2, opts)).toBe(60_000);
    expect(backoffDelayMs(3, opts)).toBe(120_000);
    expect(backoffDelayMs(4, opts)).toBe(240_000);
  });

  it('never exceeds the configured maximum', () => {
    expect(backoffDelayMs(20, opts)).toBe(3_600_000);
    expect(backoffDelayMs(30, opts)).toBe(3_600_000);
  });

  it('stays finite and non-negative for absurd attempt counts', () => {
    for (const attempt of [0, -5, 1_000, Number.NaN]) {
      const delay = backoffDelayMs(attempt, opts);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(opts.maxMs);
    }
  });

  it('honours a provider retry_after that is longer than the backoff', () => {
    expect(backoffDelayMs(1, { ...opts, retryAfterMs: 300_000 })).toBe(300_000);
  });

  it('ignores a provider retry_after that would shorten the wait', () => {
    expect(backoffDelayMs(4, { ...opts, retryAfterMs: 1_000 })).toBe(240_000);
  });

  it('still caps a hostile retry_after', () => {
    expect(backoffDelayMs(1, { ...opts, retryAfterMs: 999_999_999 })).toBe(3_600_000);
  });

  it('never returns a delay below the base when max is misconfigured lower', () => {
    expect(backoffDelayMs(1, { baseMs: 30_000, maxMs: 1_000 })).toBe(30_000);
  });
});

describe('nextAttemptAt', () => {
  it('adds the delay to the supplied instant', () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    expect(nextAttemptAt(2, opts, now)).toEqual(new Date('2026-08-20T10:01:00.000Z'));
  });
});
