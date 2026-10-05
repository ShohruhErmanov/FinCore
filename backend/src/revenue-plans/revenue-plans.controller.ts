import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiException, CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { SaveRevenuePlanDto } from './dto/revenue-plan.dto';
import type { RevenuePlanYear } from './revenue-plan-year';
import { RevenuePlansService, type RevenuePlanBoardDto } from './revenue-plans.service';

/**
 * Reading the board needs revenue_plan.manage OR reports.view — an OR the
 * @RequirePermissions decorator cannot express, so the GET checks it inline
 * and raises the same FORBIDDEN shape the guard would. Writing needs
 * revenue_plan.manage alone, which the guard handles.
 *
 * The board is company-wide: the mock returns every branch column to anyone
 * allowed to see it, so no branch-scope filter is applied.
 */
@ApiTags('revenue-plans')
@Controller('revenue-plans')
export class RevenuePlansController {
  constructor(private readonly revenuePlans: RevenuePlansService) {}

  // Two segments, so it can never be mistaken for ':periodId' below.
  @Get('year/:year')
  @ApiOperation({
    summary: 'Yil bo‘yicha barcha oylar tushum rejasi: filial kesimida reja va fakt',
  })
  @ApiParam({ name: 'year', example: 2026 })
  @ApiResponse({ status: 200, description: 'RevenuePlanYear' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR — yil 2000–2100 oralig‘ida emas' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — revenue_plan.manage yoki reports.view yo‘q',
  })
  year(
    @CurrentUser() user: AuthenticatedUser,
    @Param('year', ParseIntPipe) year: number,
  ): Promise<RevenuePlanYear> {
    this.assertCanRead(user);
    if (year < 2000 || year > 2100)
      throw new ApiException(400, 'VALIDATION_ERROR', 'Yil 2000–2100 oralig‘ida bo‘lishi kerak.');
    return this.revenuePlans.year(year);
  }

  @Get(':periodId')
  @ApiOperation({ summary: 'Davr tushum rejasi: filial kesimida reja va fakt' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RevenuePlanBoard' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR — noto‘g‘ri UUID' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — revenue_plan.manage yoki reports.view yo‘q',
  })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ): Promise<RevenuePlanBoardDto> {
    this.assertCanRead(user);
    return this.revenuePlans.get(periodId);
  }

  @Put(':periodId')
  @RequirePermissions('revenue_plan.manage')
  @ApiOperation({ summary: 'Davr tushum rejasini saqlash (butun to‘plamni almashtiradi)' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiBody({ type: SaveRevenuePlanDto })
  @ApiResponse({ status: 200, description: 'Yangilangan RevenuePlanBoard' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — revenue_plan.manage yo‘q' })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PERIOD_CLOSED / REVENUE_PLAN_LOCKED' })
  @ApiResponse({ status: 422, description: 'REFERENCE_INVALID — filial topilmadi' })
  savePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() body: SaveRevenuePlanDto,
  ): Promise<RevenuePlanBoardDto> {
    return this.revenuePlans.savePlan(user, periodId, body.lines);
  }

  /** The board and the year are read by the same people. */
  private assertCanRead(user: AuthenticatedUser): void {
    const allowed = ['revenue_plan.manage', 'reports.view'];
    if (!allowed.some((code) => user.permissions.includes(code)))
      throw ApiException.forbidden(undefined, { missingPermissions: allowed });
  }
}
