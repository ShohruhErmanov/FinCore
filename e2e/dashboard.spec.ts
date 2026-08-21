import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Rahbariyat dashboardi', () => {
  test('[AC-14, AC-16] 300m/180m/60% va KPI filterli drill-down', async ({ page }) => {
    await login(page);
    await page.goto(`/dashboard?period=${fixtureIds.periodAug}&branch=all`);

    const primaryKpis = page.getByRole('region', { name: 'Asosiy ko‘rsatkichlar' });
    await expect(primaryKpis.getByText("300 mln so'm")).toBeVisible();
    await expect(primaryKpis.getByText("180 mln so'm")).toBeVisible();
    await expect(primaryKpis.getByText('Yig‘im darajasi 60%')).toBeVisible();
    await expect(primaryKpis.getByText("70 mln so'm")).toBeVisible();
    await expect(primaryKpis.getByText('Sof moliyaviy natija')).toBeVisible();

    await primaryKpis.getByRole('link', { name: /Sof tushgan pul/ }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/revenue/transactions' &&
        url.searchParams.get('period') === fixtureIds.periodAug &&
        url.searchParams.get('branch') === 'all'
      );
    });
  });
});
