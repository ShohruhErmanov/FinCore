import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { APP_ENV, type AppEnv } from '@/config';
import { SESSION_COOKIE } from '@/auth/session.cookie';
import { ApiException } from '../errors/api-exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CORS controls which responses browsers may read; it does not authorize a
 * cookie-bearing cross-site mutation. Validate the browser's source before
 * authentication so an ambient session cannot be used for CSRF.
 *
 * Requests without browser source metadata remain available to non-browser
 * integrations (notably the secret-authenticated Telegram webhook), but they
 * may not carry a FinCore session cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly frontendOrigin: string;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.frontendOrigin = new URL(env.FRONTEND_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const source = request.get('origin') ?? request.get('referer');
    if (source) {
      if (this.originOf(source) === this.frontendOrigin) return true;
      throw this.denied();
    }

    const signedCookies = request.signedCookies as Record<string, unknown> | undefined;
    if (signedCookies?.[SESSION_COOKIE]) throw this.denied();

    return true;
  }

  private originOf(value: string): string | null {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  }

  private denied(): ApiException {
    return new ApiException(403, 'CSRF_ORIGIN_DENIED', 'So\u2018rov manbasi tasdiqlanmadi.');
  }
}
