import { z } from 'zod';
import { environment } from '@/shared/config/env';
import type { ApiErrorBody } from '@/shared/types/domain';
import { toSearchParams } from '@/shared/lib/url';

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

const moneyValueSchema = z.string().regex(/^-?\d+$/);
const offsetDateTimeSchema = z
  .string()
  .refine(
    (value) =>
      /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  );
const isoDateSchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3])
  );
});

function assertFinancialPayload(value: unknown, path = 'response'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFinancialPayload(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const currentIsDataQualityRow = 'issueType' in value;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (key.endsWith('Uzs') && item !== null && !moneyValueSchema.safeParse(item).success)
      throw new Error(`${itemPath}: MoneyUzs integer-string emas`);
    if (/(?:At)$/.test(key) && item !== null && !offsetDateTimeSchema.safeParse(item).success)
      throw new Error(`${itemPath}: RFC3339 offset timestamp emas`);
    if (
      (key === 'paymentBusinessDate' || (key === 'transactionDate' && !currentIsDataQualityRow)) &&
      item !== null &&
      !isoDateSchema.safeParse(item).success
    )
      throw new Error(`${itemPath}: ISO calendar date emas`);
    if (
      /(percent|percentage|pct)$/i.test(key) &&
      item !== null &&
      (typeof item !== 'number' || !Number.isFinite(item))
    )
      throw new Error(`${itemPath}: finite percentage emas`);
    assertFinancialPayload(item, itemPath);
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, ...request } = options;
  const idempotencyKey =
    body && typeof body === 'object' && 'idempotencyKey' in body
      ? String(body.idempotencyKey)
      : undefined;
  const params = query ? toSearchParams(query) : new URLSearchParams();
  const queryString = params.toString();
  const init: RequestInit = {
    ...request,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(
    `${environment.apiBaseUrl}${path}${queryString ? `?${queryString}` : ''}`,
    init,
  );
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const errorBody: ApiErrorBody = parsed.success
      ? {
          code: parsed.data.code,
          message: parsed.data.message,
          ...(parsed.data.details ? { details: parsed.data.details } : {}),
        }
      : { code: 'UNKNOWN_ERROR', message: 'Kutilmagan server xatosi.' };
    throw new ApiError(response.status, errorBody);
  }
  try {
    assertFinancialPayload(payload);
  } catch (error) {
    throw new ApiError(502, {
      code: 'INVALID_API_RESPONSE',
      message: 'Server javobi moliyaviy kontraktga mos emas.',
      details: { path: error instanceof Error ? error.message.split(':')[0] : 'response' },
    });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>(path, {
      method: 'GET',
      ...(query ? { query } : {}),
      ...(signal ? { signal } : {}),
    }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
};

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') return 'So‘rov bekor qilindi.';
  if (error instanceof TypeError)
    return 'Tarmoq bilan bog‘lanib bo‘lmadi. Internet yoki server holatini tekshiring.';
  return 'Kutilmagan xato yuz berdi.';
}
