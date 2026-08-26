import { Module } from '@nestjs/common';
import { TelegramLinkController } from './telegram-link.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramDeliveryProvider } from './telegram-delivery.provider';

@Module({
  controllers: [TelegramLinkController, TelegramWebhookController],
  providers: [TelegramLinkService, TelegramDeliveryProvider],
  // The notification settings read path asks which employees are reachable;
  // it never touches chat ids itself.
  exports: [TelegramLinkService, TelegramDeliveryProvider],
})
export class TelegramModule {}
