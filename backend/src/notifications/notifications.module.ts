import { Module } from '@nestjs/common';
import { ReportsModule } from '@/reports/reports.module';
import { DailyRevenuesModule } from '@/daily-revenues/daily-revenues.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ReportsModule, DailyRevenuesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
