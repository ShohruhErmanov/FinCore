import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiException } from '../errors/api-exception';

interface Captured {
  status: number;
  body: unknown;
}

function makeHost(): { host: ArgumentsHost; captured: Captured } {
  const captured: Captured = { status: 0, body: null };
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/auth/login' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // The filter logs deliberately; keep the test output readable.
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('passes a deliberate ApiException through unchanged — even at 5xx', () => {
    const { host, captured } = makeHost();
    filter.catch(new ApiException(503, 'DATABASE_UNAVAILABLE', 'Baza ulanmagan.'), host);
    expect(captured.status).toBe(503);
    expect(captured.body).toEqual({ code: 'DATABASE_UNAVAILABLE', message: 'Baza ulanmagan.' });
  });

  it('keeps details when they are present', () => {
    const { host, captured } = makeHost();
    filter.catch(ApiException.forbidden(undefined, { missingPermissions: ['expense.create'] }), host);
    expect(captured.status).toBe(403);
    expect(captured.body).toMatchObject({
      code: 'FORBIDDEN',
      details: { missingPermissions: ['expense.create'] },
    });
  });

  it('masks an unexpected error so internals never reach the client', () => {
    const { host, captured } = makeHost();
    filter.catch(new Error('column "fixed_salary_uzs" does not exist'), host);
    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Serverda kutilmagan xatolik yuz berdi.',
    });
    expect(JSON.stringify(captured.body)).not.toContain('fixed_salary_uzs');
  });

  it('masks an unlabelled 5xx HttpException too', () => {
    const { host, captured } = makeHost();
    filter.catch(new HttpException('Upstream exploded at 10.0.0.4', 502), host);
    expect(captured.status).toBe(502);
    expect(captured.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Serverda kutilmagan xatolik yuz berdi.',
    });
  });

  it('turns ValidationPipe output into details.fields', () => {
    const { host, captured } = makeHost();
    filter.catch(new BadRequestException(['login must be a string', 'password should not be empty']), host);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'So‘rov ma’lumotlari noto‘g‘ri.',
      details: { fields: ['login must be a string', 'password should not be empty'] },
    });
  });

  it('gives 429 a message a user can act on', () => {
    const { host, captured } = makeHost();
    filter.catch(new HttpException('ThrottlerException: Too Many Requests', 429), host);
    expect(captured.body).toEqual({
      code: 'RATE_LIMITED',
      message: 'Juda ko‘p urinish. Bir oz kutib, qayta urinib ko‘ring.',
    });
  });

  it('maps a 404 to the contract shape rather than an HTML page', () => {
    const { host, captured } = makeHost();
    filter.catch(new NotFoundException('Cannot GET /api/yoq'), host);
    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({ code: 'NOT_FOUND', message: 'Cannot GET /api/yoq' });
  });

  it('always emits an object carrying code and message', () => {
    for (const thrown of [new Error('x'), new BadRequestException(), 'plain string', null]) {
      const { host, captured } = makeHost();
      filter.catch(thrown, host);
      expect(captured.body).toHaveProperty('code');
      expect(captured.body).toHaveProperty('message');
    }
  });
});
