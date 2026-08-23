import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { DashboardQueryDto, MonthlyQueryDto, YearQueryDto } from './dto/reports.dto';
import { DashboardService, type DashboardResponse } from './dashboard.service';
import { ReportsService, type BranchComparisonReport, type MonthlyReport } from './reports.service';

/**
 * Every figure here comes from the sanctioned views in
 * 003_report_and_reconciliation_queries.sql. Permission codes are the mock's:
 * reports.view for both reports, dashboard.view for the dashboard.
 */
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Bosh sahifa KPI, dinamika va yillik xulosa' })
  @ApiQuery({ name: 'period', description: 'Hisob davri UUID' })
  @ApiQuery({ name: 'branch', description: 'Filial UUID yoki "all"' })
  @ApiQuery({ name: 'granularity', enum: ['daily', 'weekly', 'monthly'] })
  @ApiResponse({ status: 200, description: 'DashboardResponse' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — dashboard.view yo‘q' })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponse> {
    return this.dashboard.get(user, query.period, query.branch ?? 'all', query.granularity ?? 'monthly');
  }

  @Get('monthly')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Oylik hisobot: kategoriya × oy matritsasi' })
  @ApiQuery({ name: 'year', example: 2026 })
  @ApiQuery({ name: 'branch', description: 'Filial UUID yoki "all"' })
  @ApiResponse({ status: 200, description: 'MonthlyReport' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — reports.view yo‘q' })
  getMonthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyQueryDto,
  ): Promise<MonthlyReport> {
    const branchFilter = this.reports.resolveBranchFilter(user, query.branch);
    return this.reports.monthly(user, Number(query.year), branchFilter);
  }

  @Get('branch-comparison')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Filiallar taqqoslashi: oylar va yillik jami' })
  @ApiQuery({ name: 'year', example: 2026 })
  @ApiResponse({ status: 200, description: 'BranchComparisonReport' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — reports.view yo‘q' })
  getBranchComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: YearQueryDto,
  ): Promise<BranchComparisonReport> {
    return this.reports.branchComparison(user, Number(query.year));
  }
}
