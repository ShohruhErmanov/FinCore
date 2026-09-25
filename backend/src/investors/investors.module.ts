import { Module } from '@nestjs/common';
import { NotificationEventsModule } from '@/notification-events/notification-events.module';
import { InvestorPayoutsController } from './investor-payouts.controller';
import { InvestorPayoutsService } from './investor-payouts.service';
import { InvestorsController } from './investors.controller';
import { InvestorsService } from './investors.service';

@Module({
  imports: [NotificationEventsModule],
  controllers: [InvestorsController, InvestorPayoutsController],
  providers: [InvestorsService, InvestorPayoutsService],
  exports: [InvestorsService],
})
export class InvestorsModule {}
