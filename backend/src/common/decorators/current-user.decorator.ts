import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiException } from '../errors/api-exception';
import type { AuthenticatedRequest, AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the session user. Only reachable behind SessionGuard, so a missing
 * user here means a route was wired without the guard — a bug, not a 401.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw ApiException.unauthenticated();
    return request.user;
  },
);
