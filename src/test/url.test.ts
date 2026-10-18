import { describe, expect, it, vi } from 'vitest';
import { drilldownUrl, toSearchParams, updateSearchParam } from '@/shared/lib/url';

describe('URL helpers', () => {
  it('serializes only meaningful query values', () => {
    expect(toSearchParams({ year: 2026, active: false, branch: '', page: null }).toString()).toBe(
      'year=2026&active=false',
    );
  });

  it('builds drilldown links without a trailing question mark', () => {
    expect(drilldownUrl('/dashboard', {})).toBe('/dashboard');
    expect(drilldownUrl('/journal', { branch: 'branch-1' })).toBe('/journal?branch=branch-1');
  });

  it('resets pagination when a filter changes', () => {
    const setter = vi.fn();

    updateSearchParam(new URLSearchParams('page=4&branch=all'), setter, 'branch', 'branch-1');

    const [next, options] = setter.mock.calls[0] as [URLSearchParams, { replace: boolean }];
    expect(next.toString()).toBe('branch=branch-1');
    expect(options).toEqual({ replace: true });
  });

  it('keeps pagination when the page itself changes', () => {
    const setter = vi.fn();

    updateSearchParam(new URLSearchParams('branch=all&page=1'), setter, 'page', '2');

    expect((setter.mock.calls[0]?.[0] as URLSearchParams).toString()).toBe('branch=all&page=2');
  });
});
