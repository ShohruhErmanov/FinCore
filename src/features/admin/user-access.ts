import type { AuthenticatedUser } from '@/shared/types/domain';

export function isBusinessOwner(user: AuthenticatedUser): boolean {
  return user.roles.some((role) => (role.role as string) === 'business_owner');
}

export type AccessModel = 'cashier' | 'finance_manager' | 'finance_cashier' | 'director';

export function accessModelFor(user: AuthenticatedUser): AccessModel {
  if (user.roles.some((role) => role.role === 'director')) return 'director';
  const finance = user.roles.some((role) => role.role === 'finance_manager');
  const cashier = user.roles.some((role) => role.role === 'cashier');
  return finance && cashier ? 'finance_cashier' : finance ? 'finance_manager' : 'cashier';
}

export function formatCapitalInput(value: string): string {
  return value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
