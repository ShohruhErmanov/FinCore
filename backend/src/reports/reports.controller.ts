import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  BranchComparisonQueryDto,
  CashierReportResponseDto,
  CashiersQueryDto,
  DashboardQueryDto,
  MonthlyQueryDto,
} from './dto/reports.dto';
import { CashierReportService, type CashierReportDto } from './cashier-report.service';
import { DashboardService, type DashboardResponse } from './dashboard.service';
import { ReportsService, type BranchComparisonReport, type MonthlyReport } from './reports.service';

/**
 * Every figure here comes from the sanctioned views in
 * 003_report_and_reconciliation_queries.sql. Permission codes are the mock's:
 * reports.view for both reports, dashboard.view for the dashboard.
 */
@ApiTags('reports')
@ApiCookieAuth('cookie')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly dashboard: DashboardService,
    private readonly cashiers: CashierReportService,
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
    return this.dashboard.get(
      user,
      query.period,
      query.branch ?? 'all',
      query.granularity ?? 'monthly',
    );
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
  @ApiQuery({
    name: 'month',
    required: false,
    example: 8,
    description: 'Ikki filial bitta jadval kategoriya matritsasi uchun oy',
  })
  @ApiQuery({ name: 'branch', required: false, description: 'Filial UUID yoki "all"' })
  @ApiResponse({ status: 200, description: 'BranchComparisonReport' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — reports.view yo‘q' })
  getBranchComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BranchComparisonQueryDto,
  ): Promise<BranchComparisonReport> {
    const tashkentMonth = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', month: 'numeric' }).format(
        new Date(),
      ),
    );
    return this.reports.branchComparison(
      user,
      Number(query.year),
      query.month ?? tashkentMonth,
      query.branch ?? 'all',
    );
  }

  @Get('cashiers')
  @ApiOperation({ summary: 'Kassirlar kesimi: oylik, reja ulushi, yig‘ilgan tushum' })
  @ApiQuery({ name: 'period', description: 'Hisob davri UUID' })
  @ApiQuery({ name: 'branch', required: false, description: 'Filial UUID yoki "all"' })
  @ApiOkResponse({ type: CashierReportResponseDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({
    status: 403,
    description:
      'FORBIDDEN — reports.view_cashiers yoki reports.view_own_performance kerak / BRANCH_SCOPE_DENIED',
  })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  getCashiers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CashiersQueryDto,
  ): Promise<CashierReportDto> {
    return this.cashiers.get(user, query.period, query.branch);
  }
}
