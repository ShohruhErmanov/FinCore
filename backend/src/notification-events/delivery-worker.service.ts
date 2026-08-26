import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { APP_ENV, type AppEnv } from '@/config';
import { TelegramDeliveryProvider, type DeliveryOutcome } from '@/telegram/telegram-delivery.provider';
import { renderNotification, UnsupportedEventTypeError } from './message-renderer';
import { nextAttemptAt } from './retry-policy';
import {
  NotificationDeliveriesRepository,
  type DeliveryContext,
} from './notification-deliveries.repository';

export interface PollSummary {
  claimed: number;
  delivered: number;
  retried: number;
  permanentlyFailed: number;
}

/**
 * Drains the PHASE 39 outbox.
 *
 * Bounded polling, never a spin loop: one timer, one batch per tick, and a tick
 * that finds the previous one still running skips rather than piling up. The
 * database remains the queue — there is no broker here.
 */
@Injectable()
export class NotificationDeliveryWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  /** Identifies this process in lease_owner. Random, not derived from any secret. */
  readonly workerId = `${hostname()}-${process.pid}-${randomBytes(4).toString('hex')}`;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly deliveries: NotificationDeliveriesRepository,
    private readonly provider: TelegramDeliveryProvider,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  onModuleInit(): void {
    if (!this.env.NOTIFICATION_WORKER_ENABLED) {
      this.logger.log('Bildirishnoma worker o‘chirilgan (NOTIFICATION_WORKER_ENABLED=false).');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.env.NOTIFICATION_WORKER_INTERVAL_MS);
    // Never hold the process open just for the poll timer.
    this.timer.unref?.();
    this.logger.log(`Bildirishnoma worker ishga tushdi: ${this.workerId}`);
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // In-flight work is left to finish or to have its lease expire; nothing new
    // is claimed once stopping is set.
    this.logger.log('Bildirishnoma worker to‘xtatildi.');
  }

  /** One poll. Public so tests can drive it without a timer. */
  async tick(): Promise<PollSummary | null> {
    if (this.stopping || this.running) return null;
    this.running = true;
    try {
      return await this.pollOnce();
    } catch (error) {
      // A failing poll must never take the application down.
      this.logger.error(
        `Bildirishnoma polli xato bilan yakunlandi: ${error instanceof Error ? error.name : 'Error'}`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<PollSummary> {
    const summary: PollSummary = { claimed: 0, delivered: 0, retried: 0, permanentlyFailed: 0 };

    const claimed = await this.deliveries.claim(this.workerId, {
      limit: this.env.NOTIFICATION_WORKER_BATCH_SIZE,
      leaseSeconds: this.env.NOTIFICATION_WORKER_LEASE_SECONDS,
    });
    summary.claimed = claimed.length;
    if (claimed.length === 0) return summary;

    const contexts = await this.deliveries.loadContext(claimed.map((row) => row.id));
    for (const context of contexts) {
      // One bad delivery must not cost the rest of the batch.
      try {
        const outcome = await this.processOne(context);
        if (outcome === 'delivered') summary.delivered += 1;
        else if (outcome === 'retry') summary.retried += 1;
        else summary.permanentlyFailed += 1;
      } catch (error) {
        this.logger.error(
          `Yetkazishni yakunlab bo‘lmadi: delivery=${context.deliveryId} sabab=${
            error instanceof Error ? error.name : 'Error'
          }`,
        );
      }
    }

    this.logger.log(
      `Bildirishnoma polli: claimed=${summary.claimed} delivered=${summary.delivered} retry=${summary.retried} failed=${summary.permanentlyFailed}`,
    );
    return summary;
  }

  private async processOne(context: DeliveryContext): Promise<'delivered' | 'retry' | 'failed'> {
    // Channel comes from the row, not from the event payload.
    if (context.channel !== 'telegram')
      return this.finalise(context, { kind: 'permanent', errorCode: 'CHANNEL_UNSUPPORTED' });

    let text: string;
    try {
      text = renderNotification(context.eventType, context.payload);
    } catch (error) {
      // Deterministic: the same event will fail the same way forever.
      const code =
        error instanceof UnsupportedEventTypeError ? 'EVENT_TYPE_UNSUPPORTED' : 'RENDER_FAILED';
      return this.finalise(context, { kind: 'permanent', errorCode: code });
    }

    const chatId = await this.deliveries.resolveTelegramChat(context.recipientIdentityId);
    if (chatId === null)
      // No verified linked private account — nothing to retry towards, and the
      // API is deliberately not called at all.
      return this.finalise(context, { kind: 'permanent', errorCode: 'RECIPIENT_UNREACHABLE' });

    const outcome = await this.provider.send({ chatId, text });
    return this.finalise(context, outcome);
  }

  private async finalise(
    context: DeliveryContext,
    outcome: DeliveryOutcome,
  ): Promise<'delivered' | 'retry' | 'failed'> {
    if (outcome.kind === 'success') {
      await this.deliveries.markDelivered(
        context.deliveryId,
        this.workerId,
        outcome.providerMessageId,
      );
      return 'delivered';
    }

    if (outcome.kind === 'permanent') {
      await this.deliveries.markPermanentlyFailed(
        context.deliveryId,
        this.workerId,
        outcome.errorCode,
      );
      this.log(context, outcome.errorCode, 'permanent');
      return 'failed';
    }

    // Retryable — but only while attempts remain. `attempts` was already
    // incremented by the claim, so it is read, never bumped again.
    if (context.attempts >= this.env.NOTIFICATION_MAX_ATTEMPTS) {
      await this.deliveries.markPermanentlyFailed(
        context.deliveryId,
        this.workerId,
        `MAX_ATTEMPTS_${outcome.errorCode}`,
      );
      this.log(context, outcome.errorCode, 'max-attempts');
      return 'failed';
    }

    const due = nextAttemptAt(context.attempts, {
      baseMs: this.env.NOTIFICATION_RETRY_BASE_MS,
      maxMs: this.env.NOTIFICATION_RETRY_MAX_MS,
      retryAfterMs: outcome.retryAfterMs,
    });
    await this.deliveries.markRetry(context.deliveryId, this.workerId, outcome.errorCode, due);
    this.log(context, outcome.errorCode, 'retry');
    return 'retry';
  }

  /** Diagnostics only — no chat id, no payload, no provider body. */
  private log(context: DeliveryContext, errorCode: string, category: string): void {
    this.logger.warn(
      `Yetkazish ${category}: delivery=${context.deliveryId} event=${context.eventType} channel=${context.channel} attempt=${context.attempts} code=${errorCode} worker=${this.workerId}`,
    );
  }
}
