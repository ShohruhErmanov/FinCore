import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialPayloadInterceptor } from './financial-payload.interceptor';

const context = {
  switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/api/reports/monthly' }) }),
} as unknown as ExecutionContext;

describe('FinancialPayloadInterceptor', () => {
  let interceptor: FinancialPayloadInterceptor;
  let logged: string[];

  beforeEach(() => {
    interceptor = new FinancialPayloadInterceptor();
    logged = [];
    vi.spyOn(interceptor['logger'], 'error').mockImplementation((message) => {
      logged.push(String(message));
    });
  });

  /** Runs a payload through the interceptor and returns the problems it reported. */
  function check(payload: unknown): string {
    const handler: CallHandler = { handle: () => of(payload) };
    let received: unknown;
    interceptor.intercept(context, handler).subscribe((value) => {
      received = value;
    });
    // The payload must always pass through untouched — this is a tripwire, not a filter.
    expect(received).toBe(payload);
    return logged.join('\n');
  }

  it('stays silent on a compliant payload', () => {
    expect(
      check({
        totalUzs: '1732500',
        createdAt: '2026-08-20T09:15:00.000Z',
        transactionDate: '2026-08-20',
        collectionPercent: 93.75,
      }),
    ).toBe('');
  });

  it('catches money sent as a JS number', () => {
    expect(check({ totalUzs: 1732500 })).toContain('MoneyUzs');
  });

  it('catches money that has been locale-formatted', () => {
    // The exact regression that reached production twice on the frontend.
    expect(check({ totalUzs: '1 732 500' })).toContain('MoneyUzs');
    expect(check({ totalUzs: '1,732,500' })).toContain('MoneyUzs');
  });

  it('catches a timestamp without an offset', () => {
    expect(check({ createdAt: '2026-08-20 09:15:00' })).toContain('RFC3339');
  });

  it('catches a business date that is not an ISO calendar date', () => {
    expect(check({ transactionDate: '20.08.2026' })).toContain('ISO calendar date');
  });

  it('catches a percentage sent as a string', () => {
    expect(check({ collectionPercent: '93,75' })).toContain('percentage');
    expect(check({ marginPct: Number.NaN })).toContain('percentage');
  });

  it('accepts null for every constrained field', () => {
    expect(
      check({ totalUzs: null, createdAt: null, transactionDate: null, collectionPercent: null }),
    ).toBe('');
  });

  it('reports the path of a violation nested inside an array', () => {
    const problems = check({ rows: [{ totalUzs: '1' }, { totalUzs: 2 }] });
    expect(problems).toContain('response.rows[1].totalUzs');
  });

  it('reports every violation in one pass, not just the first', () => {
    const problems = check({ totalUzs: 1, createdAt: 'kecha' });
    expect(problems).toContain('totalUzs');
    expect(problems).toContain('createdAt');
  });

  it('names the route so the offending endpoint is obvious in the log', () => {
    expect(check({ totalUzs: 1 })).toContain('GET /api/reports/monthly');
  });
});
