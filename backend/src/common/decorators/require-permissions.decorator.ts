import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'fincore:permissions';

/**
 * Requires every listed permission code (AND, not OR). Codes are the same
 * strings the frontend checks with hasPermission().
 */
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
