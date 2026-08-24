import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  DailyRevenueCreateDto,
  DailyRevenueListQueryDto,
  DailyRevenueResponseDto,
  DailyRevenueUpdateDto,
  PaginatedDailyRevenueResponseDto,
} from './dto/daily-revenue.dto';
import {
  DailyRevenuesService,
  type DailyRevenueDto,
  type PaginatedDailyRevenues,
} from './daily-revenues.service';

/**
 * Permission codes follow the mock backend (handlers.ts:1027-1164). Reading
 * needs revenue.view_own_branch — every role that holds view_all_branches also
 * holds it — and creating needs revenue.create. PATCH accepts revenue.edit OR
 * revenue.create, which the AND-only guard cannot express, so that route
 * checks the pair inside the service and emits the same missingPermissions body.
 */
@ApiTags('daily-revenues')
@ApiCookieAuth('cookie')
@Controller('daily-revenues')
export class DailyRevenuesController {
  constructor(private readonly revenues: DailyRevenuesService) {}

  @Get()
  @ApiOperation({ summary: 'Kunlik tushum jurnali (filtr + sahifalash)' })
  @ApiQuery({ name: 'branch', required: false, description: 'Filial UUID yoki "all"' })
  @ApiQuery({ name: 'periodId', required: false, description: 'Hisob davri UUID' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-08-31' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiQuery({ name: 'sort', required: false, example: 'businessDate:desc' })
  @ApiOkResponse({ type: PaginatedDailyRevenueResponseDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — revenue.view_own_branch yo‘q' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DailyRevenueListQueryDto,
  ): Promise<PaginatedDailyRevenues> {
    return this.revenues.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta kunlik tushum (daily-{branchId}-{YYYY-MM-DD})' })
  @ApiOkResponse({ type: DailyRevenueResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'BRANCH_SCOPE_DENIED' })
  @ApiResponse({ status: 404, description: 'REVENUE_NOT_FOUND' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DailyRevenueDto> {
    return this.revenues.detail(user, id);
  }

  @Post()
  @RequirePermissions('revenue.create')
  @ApiOperation({ summary: 'Kunlik tushum kiritish (1 kun + 1 filial = 3 tagacha tranzaksiya)' })
  @ApiBody({ type: DailyRevenueCreateDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Body ichidagi idempotencyKey bilan aynan bir xil bo‘lishi kerak',
  })
  @ApiCreatedResponse({ type: DailyRevenueResponseDto, description: 'Yangi DailyRevenue' })
  @ApiOkResponse({ type: DailyRevenueResponseDto, description: 'Idempotent qayta so‘rov natijasi' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'PERMISSION_DENIED / BRANCH_SCOPE_DENIED' })
  @ApiResponse({ status: 409, description: 'REVENUE_DAY_EXISTS / PERIOD_LOCKED' })
  @ApiResponse({ status: 422, description: 'AMOUNT_INVALID / DATE_OR_PERIOD_INVALID / IDEMPOTENCY_KEY_REQUIRED' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: DailyRevenueCreateDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DailyRevenueDto> {
    return this.revenues.create(user, idempotencyKey, body).then((result) => {
      response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
      return result.revenue;
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kunlik tushumni tahrirlash (bekor qilish + qayta kiritish)' })
  @ApiBody({ type: DailyRevenueUpdateDto })
  @ApiOkResponse({ type: DailyRevenueResponseDto, description: 'DailyRevenue — id o‘zgarmaydi' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — revenue.edit yoki revenue.create kerak' })
  @ApiResponse({ status: 404, description: 'REVENUE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PERIOD_LOCKED' })
  @ApiResponse({ status: 422, description: 'AMOUNT_INVALID' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DailyRevenueUpdateDto,
  ): Promise<DailyRevenueDto> {
    return this.revenues.update(user, id, body);
  }
}
