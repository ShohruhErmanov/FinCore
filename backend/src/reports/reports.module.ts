import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ controllers: [ReportsController], providers: [ReportsService, DashboardService] })
export class ReportsModule {}
