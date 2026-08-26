import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '@/config';

/**
 * The only thing a provider is allowed to know: an already-resolved destination
 * and the text to send. It does not touch the database, does not claim work,
 * does not decide retry policy and never sees a user id.
 */
export interface DeliveryRequest {
  /** Resolved server-side from the recipient's verified account — never from a caller. */
  chatId: bigint;
  text: string;
}

export type DeliveryOutcome =
  | { kind: 'success'; providerMessageId: string | null }
  /** Worth trying again later. */
  | { kind: 'retryable'; errorCode: string; retryAfterMs?: number }
  /** Trying again cannot help. */
  | { kind: 'permanent'; errorCode: string };

export interface NotificationDeliveryProvider {
  readonly channel: 'telegram';
  send(request: DeliveryRequest): Promise<DeliveryOutcome>;
}

/** 4xx codes where the request itself is wrong; repeating it changes nothing. */
const PERMANENT_HTTP = new Set([400, 401, 403, 404, 406, 410]);

@Injectable()
export class TelegramDeliveryProvider implements NotificationDeliveryProvider {
  readonly channel = 'telegram' as const;
  private readonly logger = new Logger(TelegramDeliveryProvider.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async send(request: DeliveryRequest): Promise<DeliveryOutcome> {
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!this.env.TELEGRAM_ENABLED || !token)
      // Nothing about this improves by waiting: the deployment is not configured.
      return { kind: 'permanent', errorCode: 'TELEGRAM_DISABLED' };

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: request.chatId.toString(), text: request.text }),
        signal: AbortSignal.timeout(10_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
        error_code?: number;
        description?: string;
        parameters?: { retry_after?: number };
      } | null;

      if (response.ok && payload?.ok)
        return {
          kind: 'success',
          providerMessageId:
            typeof payload.result?.message_id === 'number'
              ? String(payload.result.message_id)
              : null,
        };

      const status = payload?.error_code ?? response.status;

      // Telegram asks for a specific pause; honour it, bounded by the worker.
      if (status === 429) {
        const seconds = payload?.parameters?.retry_after;
        return {
          kind: 'retryable',
          errorCode: 'TELEGRAM_RATE_LIMITED',
          ...(typeof seconds === 'number' && seconds > 0
            ? { retryAfterMs: Math.min(seconds, 86_400) * 1_000 }
            : {}),
        };
      }

      if (PERMANENT_HTTP.has(status))
        return { kind: 'permanent', errorCode: `TELEGRAM_HTTP_${status}` };

      // 5xx and anything unrecognised: assume the far side may recover.
      return { kind: 'retryable', errorCode: `TELEGRAM_HTTP_${status}` };
    } catch (error) {
      // Timeout / DNS / socket — transient by nature. The message is redacted
      // because a fetch error can echo the request URL, which carries the token.
      const raw = error instanceof Error ? error.message : String(error);
      const code = /timeout|aborted|TimeoutError/i.test(raw)
        ? 'TELEGRAM_TIMEOUT'
        : 'TELEGRAM_NETWORK_ERROR';
      this.logger.warn(`Telegram yuborish xatosi: ${code}`);
      return { kind: 'retryable', errorCode: code };
    }
  }
}
