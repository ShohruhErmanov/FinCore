import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Rahbariyat dashboardi', () => {
  test('[AC-14, AC-16] server hisoblagan KPI va filterli drill-down', async ({ page }) => {
    await login(page);
    await page.goto(`/dashboard?period=${fixtureIds.periodAug}&branch=all`);

    const primaryKpis = page.getByRole('region', { name: 'Tushum ko‘rsatkichlari' });
    const expenseCard = primaryKpis.getByRole('link', { name: /Jami xarajat/ });

    // Qiymat serverdan keladi — bu yerda formati va drill-down muhim,
    // fixture arifmetikasi emas.
    await expect(expenseCard).toContainText(/\d[\d.,]* mln so'm/);
    await expect(expenseCard).toContainText(/Budjet bajarilishi \d+([.,]\d+)?%/);

    await expenseCard.click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/expenses' &&
        url.searchParams.get('period') === fixtureIds.periodAug &&
        url.searchParams.get('branch') === 'all'
      );
    });
  });

  test('[AC-16] kunlik/haftalik/oylik kesimi diagrammani almashtiradi', async ({ page }) => {
    await login(page);
    await page.goto(`/dashboard?period=${fixtureIds.periodAug}&branch=all`);

    await expect(page.getByText('2026 yil, oylar kesimi').first()).toBeVisible();
    await page.getByRole('button', { name: 'Kunlik' }).click();
    await expect(page.getByText('Avgust 2026, kunlar kesimi').first()).toBeVisible();
    await expect(page).toHaveURL(/granularity=daily/);
  });
});
