import { describe, expect, it } from 'vitest';
import { isNavItemActive, navigation, routes } from '@/shared/config/routes';
import type { NavigationItem } from '@/shared/config/routes';

const items = navigation.flatMap((group) => group.items);
const byLabel = (label: string): NavigationItem => {
  const item = items.find((entry) => entry.label === label);
  if (!item) throw new Error(`Navigatsiyada "${label}" yo‘q`);
  return item;
};

/** Every entry that reads as highlighted for a pathname. */
const activeAt = (pathname: string): string[] =>
  items.filter((item) => isNavItemActive(item, pathname)).map((item) => item.label);

describe('sidebar highlighting', () => {
  it('lights one entry, not its parent too, on a nested route', () => {
    // /revenue is a prefix of /revenue/plans, so NavLink's own matching lit
    // "Kunlik tushum" as well. Only the closest entry should light up.
    expect(activeAt(routes.revenuePlans)).toEqual(['Tushum rejasi']);
  });

  it('still lights the parent on a child route that is not itself an entry', () => {
    // A single transaction has no navigation entry of its own, so the ledger
    // stays highlighted — this is what an exact-match flag would have broken.
    expect(activeAt('/revenue/44444444-0000-4000-8000-000000000001')).toEqual(['Kunlik tushum']);
  });

  it('lights the ledger on its own path', () => {
    expect(activeAt(routes.revenues)).toEqual(['Kunlik tushum']);
  });

  it('lights the investor list, not the payout queue, on an investor detail page', () => {
    expect(activeAt(routes.investorDetail('44444444-0000-4000-8000-000000000001'))).toEqual([
      'Investorlar',
    ]);
  });

  it('separates the investor pages that share the /investors prefix', () => {
    expect(activeAt(routes.myInvestment)).toEqual(['Mening ulushim']);
    expect(activeAt(routes.payoutRequests)).toEqual(['To‘lov so‘rovlari']);
    expect(activeAt(routes.investors)).toEqual(['Investorlar']);
  });

  it('keeps an exact entry dark on a child route', () => {
    // Dashboard is marked exact, and the expense analytics pages below it are
    // not navigation entries, so nothing should light up there.
    expect(activeAt(routes.expenseAnalytics)).toEqual([]);
    expect(activeAt(routes.dashboard)).toEqual(['Dashboard']);
  });

  it('lights nothing on a path no entry covers', () => {
    expect(activeAt('/login')).toEqual([]);
  });

  it('never lights two entries at once', () => {
    // The whole point: every reachable path maps to at most one highlighted
    // entry. Two entries sharing a path is a navigation bug, not a style one.
    const paths = [
      ...items.map((item) => item.to),
      routes.expenseAnalytics,
      routes.expensePlanAnalytics,
      '/revenue/some-id',
      routes.investorDetail('some-id'),
    ];

    for (const path of paths) {
      expect(activeAt(path).length, `${path}: ${activeAt(path).join(' + ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('gives every entry a distinct path', () => {
    // Two labels on one path cannot be told apart by any highlighting rule.
    const paths = items.map((item) => item.to);
    expect(new Set(paths).size, `takrorlangan: ${paths.join(', ')}`).toBe(paths.length);
  });
});

describe('navigation entries', () => {
  it('points the cashier report and the personal report at different pages', () => {
    expect(byLabel('Kassirlar').to).not.toBe(byLabel('Mening natijam').to);
  });
});

/**
 * Which report entries each role is shown.
 *
 * The permission sets mirror the live database after migrations 017 and 018.
 * A director reads every cashier's row, so a personal-performance entry would
 * be a second door to a report they already have; a cashier reads only their
 * own; a finance manager does both and gets both entries, which is why the two
 * needed separate paths.
 */
describe('report entries per role', () => {
  const reportEntries = (permissions: string[]): string[] =>
    items
      .filter((item) => permissions.includes(item.permission))
      .filter((item) => item.to.startsWith('/reports/'))
      .map((item) => item.label);

  it('gives the director the cashier report and no personal one', () => {
    const director = ['reports.view', 'reports.view_cashiers'];
    expect(reportEntries(director)).toContain('Kassirlar');
    expect(reportEntries(director)).not.toContain('Mening natijam');
  });

  it('gives a cashier only their own result', () => {
    const cashier = ['reports.view_own_performance'];
    expect(reportEntries(cashier)).toEqual(['Mening natijam']);
  });

  it('gives a finance manager both, on two different pages', () => {
    const financeManager = ['reports.view', 'reports.view_cashiers', 'reports.view_own_performance'];
    const entries = reportEntries(financeManager);
    expect(entries).toContain('Kassirlar');
    expect(entries).toContain('Mening natijam');

    // Both visible at once, so they must never light up together.
    expect(activeAt(routes.cashierReport)).toEqual(['Kassirlar']);
    expect(activeAt(routes.myPerformance)).toEqual(['Mening natijam']);
  });
});
