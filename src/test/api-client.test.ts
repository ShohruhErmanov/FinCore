import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '@/shared/api/client';

function respond(body: string, init: { status?: number; contentType?: string }) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.contentType ? { 'content-type': init.contentType } : {},
  });
}

function mockFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('[FE-API-01] backend ulanmagan deployment', () => {
  it('JSON o‘rniga HTML kelsa xato beradi — bo‘sh javob deb qabul qilmaydi', async () => {
    mockFetch(respond('<!doctype html><html></html>', { contentType: 'text/html' }));

    await expect(apiRequest('/me')).rejects.toMatchObject({
      code: 'API_UNAVAILABLE',
      status: 502,
    });
  });

  it('405 (Method Not Allowed) da aniq sabab ko‘rsatadi', async () => {
    mockFetch(respond('<!doctype html>', { status: 405, contentType: 'text/html' }));

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'API_UNAVAILABLE',
    });
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toThrow(
      /VITE_ENABLE_MOCKS/,
    );
  });

  it('haqiqiy JSON xatoni o‘zgartirmaydi', async () => {
    mockFetch(
      respond(JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Parol noto‘g‘ri.' }), {
        status: 401,
        contentType: 'application/json',
      }),
    );

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  it('to‘g‘ri JSON javobni qaytaradi', async () => {
    mockFetch(
      respond(JSON.stringify({ id: 'u1', amountUzs: '5000' }), {
        contentType: 'application/json; charset=utf-8',
      }),
    );

    await expect(apiRequest('/me')).resolves.toEqual({ id: 'u1', amountUzs: '5000' });
  });

  it('204 javobda tanani o‘qimaydi', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('ApiError klassi sifatida uzatiladi', async () => {
    mockFetch(respond('<!doctype html>', { contentType: 'text/html' }));

    await expect(apiRequest('/me')).rejects.toBeInstanceOf(ApiError);
  });
});
