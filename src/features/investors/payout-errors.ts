import { ApiError } from '@/shared/api/client';

/** Turns an API refusal into the sentence the server actually sent. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Amalni bajarib bo‘lmadi. Qayta urinib ko‘ring.';
}
