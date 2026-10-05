import { Module } from '@nestjs/common';
import { NotificationEventsModule } from '@/notification-events/notification-events.module';
import { DailyRevenuesController } from './daily-revenues.controller';
import { DailyRevenuesService } from './daily-revenues.service';

@Module({
  imports: [NotificationEventsModule],
  controllers: [DailyRevenuesController],
  providers: [DailyRevenuesService],
  // The Telegram reminder preview and the cashier report both read daily
  // revenue through this service rather than re-deriving the aggregation.
  exports: [DailyRevenuesService],
})
export class DailyRevenuesModule {}
