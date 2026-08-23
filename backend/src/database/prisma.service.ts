import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { APP_ENV, type AppEnv } from '@/config';
import { ApiException } from '@/common/errors/api-exception';
/** The transaction-scoped client Prisma hands to $transaction callbacks. */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type DatabaseStatus = 'CONNECTED' | 'NOT_CONFIGURED' | 'CONNECTION_FAILED';

/** Removes any connection string from text before it reaches a log sink. */
export function redactConnectionString(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
}

/**
 * Owns the single PrismaClient instance and its lifecycle.
 *
 * The client is created lazily so the application still boots when no database
 * is configured yet: `/api/health` can then report NOT_CONFIGURED instead of the
 * process crashing on startup. Any request path that needs data calls `db` and
 * receives a clean 503 rather than an unhandled initialization error.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client: PrismaClient | null = null;
  private state: DatabaseStatus;
  private lastError: string | null = null;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    this.state = env.DATABASE_URL ? 'CONNECTION_FAILED' : 'NOT_CONFIGURED';
  }

  get status(): DatabaseStatus {
    return this.state;
  }

  /** Human-readable reason for a failed connection; never contains credentials. */
  get statusDetail(): string | null {
    return this.lastError;
  }

  get db(): PrismaClient {
    if (!this.client)
      throw new ApiException(
        503,
        'DATABASE_UNAVAILABLE',
        "Ma'lumotlar bazasi ulanmagan. DATABASE_URL sozlanmagan yoki ulanish muvaffaqiyatsiz.",
      );
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    if (!this.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL is not set — starting without a database (NOT_CONFIGURED).');
      return;
    }
    const client = new PrismaClient({
      datasources: { db: { url: this.env.DATABASE_URL } },
      log: this.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    try {
      await client.$connect();
      this.client = client;
      this.state = 'CONNECTED';
      this.logger.log('Database connected.');
    } catch (error) {
      this.lastError = redactConnectionString(
        error instanceof Error ? error.message.split('\n')[0] ?? error.name : String(error),
      );
      this.state = 'CONNECTION_FAILED';
      await client.$disconnect().catch(() => undefined);
      this.logger.error(`Database connection failed: ${this.lastError}`);
    }
  }

  /**
   * Runs `work` inside a transaction that carries the acting user's identity.
   *
   * Audited tables refuse plain writes: their trigger calls
   * fn_current_actor_id(), which reads `app.actor_token` from the session. The
   * setting is applied with SET LOCAL so it dies with the transaction and can
   * never leak into the next request on a pooled connection.
   */
  async withActor<T>(actorToken: string, work: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // set_config(..., true) is the parameterised form of SET LOCAL.
      await tx.$executeRaw`SELECT set_config('app.actor_token', ${actorToken}, true)`;
      return work(tx);
    });
  }

  /** Cheap round-trip used by the health endpoint. */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.lastError = redactConnectionString(
        error instanceof Error ? error.message.split('\n')[0] ?? error.name : String(error),
      );
      this.state = 'CONNECTION_FAILED';
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect().catch(() => undefined);
  }
}
