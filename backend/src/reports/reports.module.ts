import { Module } from '@nestjs/common';
import { CashierReportService } from './cashier-report.service';
import { DashboardService } from './dashboard.service';
import { ExpenseAnalyticsService } from './expense-analytics.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, DashboardService, ExpenseAnalyticsService, CashierReportService],
  exports: [ReportsService, DashboardService],
})
export class ReportsModule {}
