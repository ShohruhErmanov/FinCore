import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '@/common';
import {
  TelegramLinkCreatedResponseDto,
  TelegramLinkStatusResponseDto,
} from './dto/telegram-link.dto';
import {
  TelegramLinkService,
  type TelegramLinkCreatedDto,
  type TelegramLinkStatusDto,
} from './telegram-link.service';

/**
 * Self-service only. Every route acts on the caller's own account — the user id
 * comes from the session, never from the request — so no notification.manage
 * permission is involved: linking your own Telegram is not an admin action.
 */
@ApiTags('notifications')
@ApiCookieAuth('cookie')
@Controller('notifications/telegram/link')
export class TelegramLinkController {
  constructor(private readonly links: TelegramLinkService) {}

  @Post()
  @ApiOperation({ summary: 'O‘z hisobing uchun bir martalik Telegram havolasi' })
  @ApiOkResponse({ type: TelegramLinkCreatedResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'TELEGRAM_LINK_FORBIDDEN — tizim yoki nofaol hisob' })
  @ApiResponse({ status: 409, description: 'TELEGRAM_DISABLED / TELEGRAM_ALREADY_LINKED' })
  create(@CurrentUser() user: AuthenticatedUser): Promise<TelegramLinkCreatedDto> {
    return this.links.createLink(user);
  }

  @Get()
  @ApiOperation({ summary: 'O‘z Telegram ulanish holating' })
  @ApiOkResponse({ type: TelegramLinkStatusResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  status(@CurrentUser() user: AuthenticatedUser): Promise<TelegramLinkStatusDto> {
    return this.links.status(user);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'O‘z Telegram ulanishini uzish' })
  @ApiResponse({ status: 204, description: 'Uzildi' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 404, description: 'TELEGRAM_LINK_NOT_FOUND' })
  unlink(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.links.unlink(user);
  }
}
