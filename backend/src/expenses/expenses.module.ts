import { Module } from '@nestjs/common';
import { NotificationEventsModule } from '@/notification-events/notification-events.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [NotificationEventsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
