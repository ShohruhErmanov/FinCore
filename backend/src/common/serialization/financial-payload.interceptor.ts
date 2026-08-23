import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

const MONEY = /^-?\d+$/;
const OFFSET_DATE_TIME = /(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERCENT_KEY = /(percent|percentage|pct)$/i;

function inspect(value: unknown, path: string, problems: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`, problems));
    return;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const at = `${path}.${key}`;
    if (item !== null) {
      if (key.endsWith('Uzs') && (typeof item !== 'string' || !MONEY.test(item)))
        problems.push(`${at}: MoneyUzs integer-string emas`);
      if (key.endsWith('At') && (typeof item !== 'string' || !OFFSET_DATE_TIME.test(item) || Number.isNaN(Date.parse(item))))
        problems.push(`${at}: RFC3339 offset timestamp emas`);
      if ((key === 'transactionDate' || key === 'paymentBusinessDate') && (typeof item !== 'string' || !ISO_DATE.test(item)))
        problems.push(`${at}: ISO calendar date emas`);
      if (PERCENT_KEY.test(key) && (typeof item !== 'number' || !Number.isFinite(item)))
        problems.push(`${at}: finite percentage emas`);
    }
    inspect(item, at, problems);
  }
}

/**
 * Runs the frontend's own payload assertions against outgoing responses so a
 * contract break shows up in the server log instead of as a blank screen in the
 * browser. Development/test only — production keeps the hot path free.
 */
@Injectable()
export class FinancialPayloadInterceptor implements NestInterceptor {
  private readonly logger = new Logger('FinancialPayload');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown) => {
        const problems: string[] = [];
        inspect(payload, 'response', problems);
        if (problems.length > 0) {
          const route = context.switchToHttp().getRequest<{ method: string; url: string }>();
          this.logger.error(
            `${route.method} ${route.url} javobi frontend kontraktini buzadi:\n  ${problems.join('\n  ')}`,
          );
        }
        return payload;
      }),
    );
  }
}
