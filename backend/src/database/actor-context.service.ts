import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '@/config';

/**
 * Mints the short-lived, HMAC-signed actor token the database requires before
 * it will accept an audited write (fincore.fn_current_actor_id).
 *
 * The database is the trust boundary here: it refuses to take the acting user
 * from a column value, so every write transaction must carry a token proving
 * which authenticated user is responsible. Token layout, fixed by the SQL:
 *
 *   <key_id>:<base64url(payload)>:<base64url(hmac_sha256(payload_b64, key))>
 *   payload = { uid, iat, exp }   // seconds since epoch
 *
 * The HMAC covers the base64url payload *string*, not its decoded bytes.
 */
@Injectable()
export class ActorContextService {
  private readonly keyId: string;
  private readonly key: Buffer;
  private readonly ttlSeconds: number;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.keyId = env.ACTOR_SIGNING_KEY_ID;
    this.key = Buffer.from(env.ACTOR_SIGNING_KEY, 'base64');
    this.ttlSeconds = env.ACTOR_TOKEN_TTL_SECONDS;
  }

  /** Valid for seconds, not hours: it only has to survive one transaction. */
  mint(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ uid: userId, iat: now, exp: now + this.ttlSeconds }),
    ).toString('base64url');
    const signature = createHmac('sha256', this.key).update(payload, 'utf8').digest('base64url');
    return `${this.keyId}:${payload}:${signature}`;
  }

  /** Used by the startup self-check; never part of a request path. */
  verify(token: string): boolean {
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    const [, payload, signature] = parts as [string, string, string];
    const expected = createHmac('sha256', this.key).update(payload, 'utf8').digest();
    const given = Buffer.from(signature, 'base64url');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
