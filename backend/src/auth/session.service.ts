import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '@/config';

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

/**
 * Opaque server-side sessions. The cookie carries only a random identifier, so
 * no user data or permission set ever leaves the server, and logout genuinely
 * revokes access (unlike a self-contained JWT).
 *
 * STORAGE — the approved schema (docs/database/001_reference_schema.sql) has no
 * sessions table and this phase may not invent one, so records live in process
 * memory. That is correct for a single instance and NOT correct behind more
 * than one replica: sessions would not be shared and a restart signs everyone
 * out. Choosing the persistent store (Redis vs. a fincore.sessions table) is an
 * open decision — see docs/PHASE_18_1_BACKEND_FOUNDATION.md §16.
 */
@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ttlMs: number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.ttlMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
    this.sweeper = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweeper.unref();
  }

  get ttlSeconds(): number {
    return Math.floor(this.ttlMs / 1000);
  }

  create(userId: string): string {
    const id = randomBytes(32).toString('base64url');
    this.sessions.set(id, { userId, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  /** Returns the owning user id, or null when the session is unknown or expired. */
  resolve(sessionId: string): string | null {
    const record = this.sessions.get(sessionId);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return record.userId;
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Used when an account is disabled or its permissions change. */
  destroyAllForUser(userId: string): void {
    for (const [id, record] of this.sessions)
      if (constantTimeEquals(record.userId, userId)) this.sessions.delete(id);
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, record] of this.sessions)
      if (record.expiresAt <= now) {
        this.sessions.delete(id);
        removed += 1;
      }
    if (removed > 0) this.logger.debug(`${removed} ta muddati o‘tgan sessiya tozalandi.`);
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    this.sessions.clear();
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
