import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  PayoutCancelDto,
  PayoutDecisionDto,
  PayoutMarkPaidDto,
  PayoutRequestCreateDto,
  PayoutYearQueryDto,
} from './dto/payout.dto';
import {
  InvestorPayoutsService,
  type PayoutRequestRow,
  type PayoutSummary,
} from './investor-payouts.service';

/**
 * Its own base path rather than more routes under /investors: a literal segment
 * and a :id parameter on the same prefix is the kind of ordering dependency
 * that breaks quietly when a route is later moved.
 *
 * As on InvestorsController, the reads that are OR-shaped (own profile OR
 * view_all) carry no @RequirePermissions — the guard can only AND, so the
 * service enforces them and emits the same missingPermissions body.
 */
@ApiTags('investor-payouts')
@ApiCookieAuth('cookie')
@Controller('investor-payouts')
export class InvestorPayoutsController {
  constructor(private readonly payouts: InvestorPayoutsService) {}

  // Declared before ':id'-shaped routes so the literal path wins.
  @Get('me')
  @RequirePermissions('investor.view_own')
  @ApiOperation({ summary: 'Joriy investorning yillik ulushi va to‘lov so‘rovlari' })
  @ApiResponse({ status: 200, description: 'PayoutSummary' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.view_own yo‘q' })
  @ApiResponse({ status: 404, description: 'INVESTOR_NOT_FOUND' })
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayoutYearQueryDto,
  ): Promise<PayoutSummary> {
    return this.payouts.mySummary(user, query.year ?? new Date().getUTCFullYear());
  }

  @Get()
  @ApiOperation({
    summary: 'Investorlar ro‘yxati, yillik fakt tushum va ulush bilan',
    description:
      'Avtorizatsiya InvestorsService.list bilan bir xil — investor.view_all talab qilinadi.',
  })
  @ApiResponse({ status: 200, description: 'InvestorRef[] + annual share' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.view_all yo‘q' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayoutYearQueryDto,
  ): Promise<Array<unknown>> {
    return this.payouts.list(user, query.year ?? new Date().getUTCFullYear());
  }

  @Get('requests')
  @RequirePermissions('investor.view_all')
  @ApiOperation({ summary: 'Investor to‘lov so‘rovlari navbati — read-only ro‘yxat' })
  @ApiResponse({ status: 200, description: 'PayoutRequestRow[]' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.view_all yo‘q' })
  queue(@CurrentUser() user: AuthenticatedUser): Promise<PayoutRequestRow[]> {
    return this.payouts.queue(user);
  }

  @Post('requests')
  @RequirePermissions('investor.settlement.request')
  @ApiOperation({
    summary: 'O‘z ulushi bo‘yicha to‘lov so‘rovi',
    description:
      'Investor profili sessiyadan aniqlanadi — so‘rovda investor id yo‘q, shuning uchun boshqa investor nomidan so‘rov yuborib bo‘lmaydi.',
  })
  @ApiBody({ type: PayoutRequestCreateDto })
  @ApiResponse({ status: 201, description: 'PayoutRequestRow' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — investor.settlement.request yo‘q' })
  @ApiResponse({ status: 409, description: 'PAYOUT_ALREADY_REQUESTED / PAYOUT_NOTHING_AVAILABLE' })
  @ApiResponse({ status: 422, description: 'PAYOUT_EXCEEDS_AVAILABLE / AMOUNT_INVALID' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PayoutRequestCreateDto,
  ): Promise<PayoutRequestRow> {
    return this.payouts.request(user, body);
  }

  @Post('requests/:id/decision')
  @RequirePermissions('investor.settlement.approve')
  @ApiOperation({ summary: 'Direktor qarori: tasdiqlash yoki rad etish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: PayoutDecisionDto })
  @ApiResponse({ status: 409, description: 'PAYOUT_NOT_PENDING' })
  @ApiResponse({ status: 422, description: 'PAYOUT_REASON_REQUIRED' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PayoutDecisionDto,
  ): Promise<PayoutRequestRow> {
    return this.payouts.decide(user, id, body);
  }

  @Post('requests/:id/payment')
  @RequirePermissions('investor.settlement.pay')
  @ApiOperation({
    summary: 'Tasdiqlangan so‘rov bo‘yicha to‘lovni qayd etish',
    description:
      'To‘lov investor_payments ledgeriga yoziladi va so‘rovga 1:1 bog‘lanadi, shuning uchun bir so‘rov ikki marta to‘lanmaydi.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: PayoutMarkPaidDto })
  @ApiResponse({ status: 409, description: 'PAYOUT_NOT_APPROVED / PAYOUT_ALREADY_SETTLED' })
  @ApiResponse({ status: 422, description: 'PAYOUT_DATE_OUTSIDE_PERIOD' })
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PayoutMarkPaidDto,
  ): Promise<PayoutRequestRow> {
    return this.payouts.markPaid(user, id, body);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('investor.settlement.request')
  @ApiOperation({ summary: 'Investor o‘z so‘rovini qaytarib oladi' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: PayoutCancelDto })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — faqat o‘z so‘rovi' })
  @ApiResponse({ status: 409, description: 'PAYOUT_NOT_CANCELLABLE' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PayoutCancelDto,
  ): Promise<PayoutRequestRow> {
    return this.payouts.cancel(user, id, body);
  }

  // Last: a uuid param must not shadow the literal paths above.
  @Get('investor/:id')
  @ApiOperation({ summary: 'Bitta investorning ulushi (direktor uchun)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN / BRANCH_SCOPE_DENIED' })
  @ApiResponse({ status: 404, description: 'INVESTOR_NOT_FOUND' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PayoutYearQueryDto,
  ): Promise<PayoutSummary> {
    return this.payouts.summary(user, id, query.year ?? new Date().getUTCFullYear());
  }
}
