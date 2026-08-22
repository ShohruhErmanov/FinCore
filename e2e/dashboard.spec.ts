import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Rahbariyat dashboardi', () => {
  test('[AC-14, AC-16] 110m jami xarajat va KPI filterli drill-down', async ({ page }) => {
    await login(page);
    await page.goto(`/dashboard?period=${fixtureIds.periodAug}&branch=all`);

    const primaryKpis = page.getByRole('region', { name: 'Asosiy ko‘rsatkichlar' });
    await expect(primaryKpis.getByText("110 mln so'm")).toBeVisible();
    await expect(primaryKpis.getByText('Budjet bajarilishi 88%')).toBeVisible();
    await expect(primaryKpis.getByText("15 mln so'm")).toBeVisible();

    await primaryKpis.getByRole('link', { name: /Jami xarajat/ }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/expenses' &&
        url.searchParams.get('period') === fixtureIds.periodAug &&
        url.searchParams.get('branch') === 'all'
      );
    });
  });
});
