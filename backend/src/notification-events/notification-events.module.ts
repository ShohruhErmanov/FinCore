import { Module } from '@nestjs/common';
import { TelegramModule } from '@/telegram/telegram.module';
import { NotificationDeliveryWorker } from './delivery-worker.service';
import { NotificationDeliveriesRepository } from './notification-deliveries.repository';
import { NotificationEventsService } from './notification-events.service';

/**
 * Infrastructure only — no controller, and deliberately no HTTP surface: a
 * notification event may be raised by trusted backend code alone.
 *
 * PHASE 41 will inject NotificationEventsService into the business services;
 * PHASE 40 will drive NotificationDeliveriesRepository from a worker.
 */
@Module({
  imports: [TelegramModule],
  providers: [NotificationEventsService, NotificationDeliveriesRepository, NotificationDeliveryWorker],
  exports: [NotificationEventsService, NotificationDeliveriesRepository],
})
export class NotificationEventsModule {}
