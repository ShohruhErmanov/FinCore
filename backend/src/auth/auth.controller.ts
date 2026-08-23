import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Public, type AuthenticatedRequest, type AuthenticatedUser } from '@/common';
import { APP_ENV, type AppEnv } from '@/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SESSION_COOKIE, sessionCookieOptions } from './session.cookie';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  // Overrides the global budget for this route only: guessing a password must
  // stay far more expensive than reading data.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Telefon/parol bilan kirish; sessiya cookie o‘rnatiladi' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const user = await this.auth.authenticate(dto.login, dto.password);
    const sessionId = this.sessions.create(user.id);
    response.cookie(
      SESSION_COOKIE,
      sessionId,
      sessionCookieOptions(this.env, this.sessions.ttlSeconds),
    );
    return user;
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sessiyani tugatish' })
  logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): void {
    const sessionId = request.signedCookies?.[SESSION_COOKIE];
    if (typeof sessionId === 'string') this.sessions.destroy(sessionId);
    // maxAge 0 so the browser drops it; the remaining attributes must match the
    // ones it was set with or the clear is ignored.
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.env, 0));
  }

  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi, rollari va ruxsatlari' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
