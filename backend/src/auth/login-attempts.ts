import { Injectable } from '@nestjs/common';
import { ApiException } from '@/common';

/** Wrong passwords allowed for one login inside the window before it pauses. */
export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Bounds memory against a flood of made-up logins. */
const MAX_TRACKED_LOGINS = 10_000;

/**
 * A per-account brake on password guessing, next to the per-IP throttle on the
 * login route. The IP limit alone does not stop guesses spread over many
 * addresses at one phone number; this does, by pausing that login until its
 * oldest failure leaves the window.
 *
 * Unknown logins are counted exactly like real ones, so a pause never reveals
 * which phone numbers exist. Process-local, like the sessions themselves.
 */
@Injectable()
export class LoginAttempts {
  private readonly failures = new Map<string, number[]>();

  /** Throws while this login is paused. */
  assertAllowed(key: string, now = Date.now()): void {
    if (this.recent(key, now).length >= MAX_LOGIN_FAILURES)
      throw new ApiException(
        429,
        'LOGIN_TEMPORARILY_LOCKED',
        'Juda ko‘p noto‘g‘ri urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring.',
      );
  }

  recordFailure(key: string, now = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.failures.set(key, recent);
    if (this.failures.size > MAX_TRACKED_LOGINS) this.sweep(now);
  }

  /** A correct password clears the slate for that login. */
  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter((at) => now - at < LOGIN_FAILURE_WINDOW_MS);
    if (kept.length) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  private sweep(now: number): void {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
    // Still over the cap: drop the oldest entries (Map keeps insertion order).
    for (const key of this.failures.keys()) {
      if (this.failures.size <= MAX_TRACKED_LOGINS) break;
      this.failures.delete(key);
    }
  }
}
