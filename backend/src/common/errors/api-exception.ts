import { HttpException } from '@nestjs/common';

/**
 * Wire format for every error the API emits. The frontend parses exactly this
 * shape (src/shared/api/client.ts → apiErrorSchema); nothing else is accepted.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiException extends HttpException {
  readonly code: string;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    const body: ApiErrorBody = details ? { code, message, details } : { code, message };
    super(body, status);
    this.code = code;
  }

  static unauthenticated(message = 'Sessiya tugagan. Qayta kiring.'): ApiException {
    return new ApiException(401, 'UNAUTHENTICATED', message);
  }

  static invalidCredentials(message = 'Telefon yoki parol noto‘g‘ri.'): ApiException {
    return new ApiException(401, 'INVALID_CREDENTIALS', message);
  }

  static accountDisabled(message = 'Hisob nofaol yoki bloklangan.'): ApiException {
    return new ApiException(401, 'ACCOUNT_DISABLED', message);
  }

  static forbidden(message = 'Bu amal uchun ruxsatingiz yo‘q.', details?: Record<string, unknown>): ApiException {
    return new ApiException(403, 'FORBIDDEN', message, details);
  }
}
