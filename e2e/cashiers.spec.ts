import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Kassirlar hisoboti', () => {
  test('[AC-18, FE-HIST-01] 70/80/30m va nofaol tarixiy kassir saqlanadi', async ({ page }) => {
    await login(page);
    await page.goto(`/reports/cashiers?period=${fixtureIds.periodAug}&branch=all`);
    await expect(page.getByRole('heading', { name: 'Kassirlar hisoboti' })).toBeVisible();

    const aziza = page.getByRole('row').filter({ hasText: 'Aziza Rahimova' });
    const komil = page.getByRole('row').filter({ hasText: 'Komil Normurodov' });
    const dilnoza = page.getByRole('row').filter({ hasText: 'Dilnoza Qodirova' });

    await expect(aziza).toContainText(/70.?000.?000 so'm/);
    await expect(komil).toContainText(/80.?000.?000 so'm/);
    await expect(komil).toContainText('Nofaol · tarixiy yozuv');
    await expect(dilnoza).toContainText(/30.?000.?000 so'm/);

    await komil.getByRole('link', { name: /Tranzaksiyalar/ }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/revenue/transactions' &&
        url.searchParams.get('period') === fixtureIds.periodAug &&
        url.searchParams.get('branch') === fixtureIds.sayxun &&
        url.searchParams.get('collector') === fixtureIds.cashierB &&
        url.searchParams.get('status') === 'posted'
      );
    });
  });
});
