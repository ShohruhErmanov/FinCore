import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  InvestorCreateDto,
  InvestorEntitlementDto,
  InvestorPaymentDto,
  InvestorUpdateDto,
  InvestorYearQueryDto,
  ReversePaymentDto,
} from './dto/investor.dto';
import {
  InvestorsService,
  type InvestorDashboard,
  type InvestorRef,
} from './investors.service';

/**
 * Reads carry no @RequirePermissions because the rule is OR-shaped — either
 * investor.view_all, or investor.view_own for the caller's own profile — and
 * the guard can only AND. The service enforces it and emits the same
 * missingPermissions body the guard would, so authorization never depends on
 * which layer happened to run.
 */
@ApiTags('investors')
@ApiCookieAuth('cookie')
@Controller('investors')
export class InvestorsController {
  constructor(private readonly investors: InvestorsService) {}

  @Get()
  @ApiOperation({ summary: 'Investorlar ro‘yxati va yillik jamlari' })
  @ApiResponse({ status: 200, description: 'InvestorRef[] + annual settlement' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.view_all yo‘q' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestorYearQueryDto,
  ): Promise<Array<InvestorRef & { annual: unknown }>> {
    return this.investors.list(user, query.year ?? new Date().getUTCFullYear());
  }

  // Declared before ':id' so the literal path is not captured as a uuid param.
  @Get('me')
  // A single permission, so the guard can express it; the OR-shaped rule on
  // GET :id still lives in the service.
  @RequirePermissions('investor.view_own')
  @ApiOperation({ summary: 'Joriy foydalanuvchining investor profili' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.view_own yoq' })
  @ApiResponse({ status: 404, description: 'INVESTOR_NOT_FOUND' })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<InvestorRef> {
    return this.investors.mine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Investor dashboardi: yillik jami + 12 oy + to‘lovlar tarixi' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN / BRANCH_SCOPE_DENIED' })
  @ApiResponse({ status: 404, description: 'INVESTOR_NOT_FOUND' })
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InvestorYearQueryDto,
  ): Promise<InvestorDashboard> {
    return this.investors.dashboard(user, id, query.year ?? new Date().getUTCFullYear());
  }

  @Post()
  @RequirePermissions('investor.manage')
  @ApiOperation({ summary: 'Yangi investor qayd etish' })
  @ApiBody({ type: InvestorCreateDto })
  @ApiResponse({ status: 201, description: 'InvestorRef' })
  @ApiResponse({ status: 409, description: 'INVESTOR_EXISTS' })
  @ApiResponse({ status: 422, description: 'OWNERSHIP_PERCENT_INVALID / REFERENCE_INVALID' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InvestorCreateDto,
  ): Promise<InvestorRef> {
    return this.investors.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions('investor.manage')
  @ApiOperation({ summary: 'Investor ulushi yoki filialini o‘zgartirish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: InvestorUpdateDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InvestorUpdateDto,
  ): Promise<InvestorRef> {
    return this.investors.update(user, id, body);
  }

  @Put(':id/entitlements')
  @RequirePermissions('investor.manage')
  @ApiOperation({ summary: 'Davr uchun investorga tegishli summani qayd etish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: InvestorEntitlementDto })
  @ApiResponse({ status: 404, description: 'INVESTOR_NOT_FOUND / PERIOD_NOT_FOUND' })
  setEntitlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InvestorEntitlementDto,
  ): Promise<InvestorDashboard> {
    return this.investors.setEntitlement(user, id, body);
  }

  @Post(':id/payments')
  @RequirePermissions('investor.manage')
  @ApiOperation({ summary: 'Investorga to‘lovni qayd etish (append-only)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: InvestorPaymentDto })
  @ApiResponse({ status: 422, description: 'AMOUNT_INVALID' })
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InvestorPaymentDto,
  ): Promise<InvestorDashboard> {
    return this.investors.recordPayment(user, id, body);
  }

  @Post(':id/payments/:paymentId/reverse')
  @RequirePermissions('investor.manage')
  @ApiOperation({ summary: 'To‘lovni bekor qilish — yagona ruxsat etilgan o‘zgartirish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'paymentId', format: 'uuid' })
  @ApiBody({ type: ReversePaymentDto })
  @ApiResponse({ status: 409, description: 'PAYMENT_ALREADY_REVERSED' })
  @ApiResponse({ status: 404, description: 'PAYMENT_NOT_FOUND' })
  reversePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ReversePaymentDto,
  ): Promise<InvestorDashboard> {
    return this.investors.reversePayment(user, id, paymentId, body);
  }
}
