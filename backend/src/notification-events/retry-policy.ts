/**
 * Deterministic exponential backoff. No jitter on purpose: the project has no
 * shared retry utility, and a predictable delay is what makes the worker's
 * behaviour testable.
 *
 *   delay = min(baseMs * 2^(attempt - 1), maxMs)
 *
 * `attempt` is the value the claim already stored, so it is never incremented
 * a second time here.
 */
export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** From a provider that asked for a specific pause (Telegram 429). */
  retryAfterMs?: number | undefined;
}

export function backoffDelayMs(attempt: number, options: BackoffOptions): number {
  const safeAttempt = Math.max(1, Math.min(Math.trunc(attempt) || 1, 30));
  const base = Math.max(1, options.baseMs);
  const max = Math.max(base, options.maxMs);

  // 2^29 at most, so the multiplication cannot overflow into Infinity.
  const exponential = base * 2 ** (safeAttempt - 1);
  let delay = Math.min(exponential, max);

  // A provider's own request may lengthen the wait, never shorten it, and is
  // still capped so a hostile or buggy value cannot park a row for days.
  if (typeof options.retryAfterMs === 'number' && Number.isFinite(options.retryAfterMs))
    delay = Math.min(Math.max(delay, Math.max(0, options.retryAfterMs)), max);

  return Math.max(0, Math.trunc(delay));
}

export function nextAttemptAt(attempt: number, options: BackoffOptions, now = new Date()): Date {
  return new Date(now.getTime() + backoffDelayMs(attempt, options));
}
