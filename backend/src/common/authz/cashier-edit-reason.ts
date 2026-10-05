import { ApiException } from '../errors/api-exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

export function hasCashierRole(user: AuthenticatedUser): boolean {
  return user.roles.some((assignment) => assignment.role === 'cashier');
}

/**
 * A cashier correction must always carry a human explanation. This is enforced
 * at the service boundary as well as in the UI, so a direct API call cannot
 * bypass it.
 */
export function cashierEditReason(
  user: AuthenticatedUser,
  value: string | undefined,
): string | null {
  const reason = value?.trim() || null;
  if (hasCashierRole(user) && !reason)
    throw new ApiException(
      422,
      'EDIT_REASON_REQUIRED',
      'Kassir tahrirlashi uchun izoh kiritish majburiy.',
    );
  return reason;
}
