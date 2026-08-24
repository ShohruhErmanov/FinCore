import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  MonthlyPreviewQueryDto,
  ReminderPreviewResponseDto,
  TelegramSettingsInputDto,
  TelegramTestDto,
} from './dto/notification.dto';
import { ReminderPreviewQueryDto } from '@/daily-revenues/dto/daily-revenue.dto';
import {
  NotificationsService,
  type MonthlyReportPreviewDto,
  type TelegramSettingsDto,
  type TelegramTestResultDto,
  type ReminderPreviewDto,
} from './notifications.service';

/**
 * All five routes require notification.manage — the permission the mock
 * backend checks on every one of them (handlers.ts:1262-1380).
 */
@ApiTags('notifications')
@ApiCookieAuth('cookie')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('telegram')
  @RequirePermissions('notification.manage')
  @ApiOperation({ summary: 'Telegram sozlamalari (bot tokeni qaytarilmaydi)' })
  @ApiResponse({ status: 200, description: 'TelegramSettings — botTokenSet faqat boolean' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — notification.manage yo‘q' })
  getSettings(): Promise<TelegramSettingsDto> {
    return this.notifications.getSettings();
  }

  @Put('telegram')
  @RequirePermissions('notification.manage')
  @ApiOperation({ summary: 'Telegram sozlamalarini saqlash' })
  @ApiBody({ type: TelegramSettingsInputDto })
  @ApiResponse({ status: 200, description: 'Yangilangan TelegramSettings' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — notification.manage yo‘q' })
  @ApiResponse({ status: 422, description: 'BOT_TOKEN_REQUIRED' })
  saveSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: TelegramSettingsInputDto,
  ): Promise<TelegramSettingsDto> {
    return this.notifications.saveSettings(actor, body);
  }

  @Get('monthly-preview')
  @RequirePermissions('notification.manage')
  @ApiOperation({ summary: 'Oylik hisobot xabarining ko‘rinishi' })
  @ApiQuery({ name: 'period', description: 'Hisob davri UUID' })
  @ApiResponse({ status: 200, description: 'MonthlyReportPreview' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — notification.manage yo‘q' })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  monthlyPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyPreviewQueryDto,
  ): Promise<MonthlyReportPreviewDto> {
    return this.notifications.monthlyPreview(user, query.period);
  }

  @Get('reminder-preview')
  @RequirePermissions('notification.manage')
  @ApiOperation({ summary: 'Kunlik tushum kiritmagan filiallar (eslatma ko‘rinishi)' })
  @ApiQuery({ name: 'date', required: false, example: '2026-08-20' })
  @ApiOkResponse({ type: ReminderPreviewResponseDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — notification.manage yo‘q' })
  reminderPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReminderPreviewQueryDto,
  ): Promise<ReminderPreviewDto> {
    return this.notifications.reminderPreview(user, query.date);
  }

  @Post('telegram/test')
  @RequirePermissions('notification.manage')
  @ApiOperation({ summary: 'Sinov xabari yuborish' })
  @ApiBody({ type: TelegramTestDto })
  @ApiResponse({ status: 201, description: '{ delivered, chatId, note }' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — notification.manage yo‘q' })
  @ApiResponse({ status: 422, description: 'BOT_TOKEN_REQUIRED / CHAT_ID_INVALID' })
  sendTest(@Body() body: TelegramTestDto): Promise<TelegramTestResultDto> {
    return this.notifications.sendTest(body.chatId);
  }
}
