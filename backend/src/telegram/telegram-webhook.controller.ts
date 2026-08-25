import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@/common';
import { TelegramWebhookAckDto } from './dto/telegram-link.dto';
import { TelegramLinkService } from './telegram-link.service';

/**
 * Telegram calls this, not a browser, so it carries no FinCore session — the
 * only thing that authenticates the caller is the secret header Telegram was
 * configured with (setWebhook `secret_token`).
 *
 * Two deliberate properties:
 *   * the response is always a bare acknowledgement, so a prober cannot learn
 *     whether a token exists, is expired or is already consumed;
 *   * the request body is never logged — it carries chat ids and, on a link
 *     message, the raw token.
 *
 * Body size is bounded by the platform's default 100kb JSON limit; a Telegram
 * update is orders of magnitude smaller, so no extra limiter is introduced.
 */
@ApiExcludeController()
@Controller('integrations/telegram')
export class TelegramWebhookController {
  constructor(private readonly links: TelegramLinkService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Record<string, unknown>,
  ): Promise<TelegramWebhookAckDto> {
    this.links.assertWebhookSecret(secret);
    await this.links.handleUpdate(update);
    return { ok: true };
  }
}
