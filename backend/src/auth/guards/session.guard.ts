import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException, IS_PUBLIC_KEY, type AuthenticatedRequest } from '@/common';
import { SESSION_COOKIE } from '../session.cookie';
import { SessionService } from '../session.service';
import { AuthService } from '../auth.service';

/**
 * Resolves the signed session cookie into a fresh AuthenticatedUser on every
 * request. Applied globally; opt out with @Public().
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Only the *signed* jar is read: an unsigned cookie of the same name is a forgery.
    const sessionId = request.signedCookies?.[SESSION_COOKIE];
    if (typeof sessionId !== 'string' || sessionId.length === 0)
      throw ApiException.unauthenticated();

    const userId = this.sessions.resolve(sessionId);
    if (!userId) throw ApiException.unauthenticated();

    try {
      request.user = await this.auth.getAuthenticatedUser(userId);
    } catch (error) {
      // A disabled or deleted account must not keep a live session.
      this.sessions.destroy(sessionId);
      throw error;
    }
    request.sessionId = sessionId;
    return true;
  }
}
