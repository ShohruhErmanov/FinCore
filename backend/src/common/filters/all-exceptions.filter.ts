import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '../errors/api-exception';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Guarantees that every failure — including ones Nest raises before a controller
 * runs — leaves as `{ code, message, details? }` JSON. An HTML error page here
 * would surface in the browser as the API_UNAVAILABLE contract violation the
 * frontend client throws on non-JSON responses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.toBody(exception, status);

    if (status >= 500) {
      // Full detail stays server-side; the client only sees the generic message.
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== 401) {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${body.code}`);
    }

    response.status(status).json(body);
  }

  private toBody(exception: unknown, status: number): ApiErrorBody {
    if (exception instanceof HttpException) {
      const payload: unknown = exception.getResponse();

      // Already in our contract shape (ApiException): the code and message were
      // written for the client on purpose, so they pass through even at 5xx —
      // that is how 503 stays DATABASE_UNAVAILABLE instead of being masked.
      if (isRecord(payload) && typeof payload.code === 'string' && typeof payload.message === 'string') {
        const details = isRecord(payload.details) ? payload.details : undefined;
        return details
          ? { code: payload.code, message: payload.message, details }
          : { code: payload.code, message: payload.message };
      }

      if (status >= 500)
        return { code: 'INTERNAL_ERROR', message: 'Serverda kutilmagan xatolik yuz berdi.' };

      // Nest built-ins, most importantly ValidationPipe's BadRequestException.
      const code = CODE_BY_STATUS[status] ?? 'REQUEST_FAILED';
      if (status === 429)
        return { code, message: 'Juda ko‘p urinish. Bir oz kutib, qayta urinib ko‘ring.' };
      if (isRecord(payload) && Array.isArray(payload.message))
        return {
          code,
          message: 'So‘rov ma’lumotlari noto‘g‘ri.',
          details: { fields: payload.message.map(String) },
        };
      const message =
        isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : typeof payload === 'string'
            ? payload
            : exception.message;
      return { code, message };
    }

    // Not an HttpException at all — never surface its message to the client.
    return status >= 500
      ? { code: 'INTERNAL_ERROR', message: 'Serverda kutilmagan xatolik yuz berdi.' }
      : { code: CODE_BY_STATUS[status] ?? 'REQUEST_FAILED', message: 'So‘rov bajarilmadi.' };
  }
}
