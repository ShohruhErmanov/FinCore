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
    await expect(expenseCard).toContainText(/\d[\d\s]* so‘m/);
    await expect(expenseCard).toContainText(/Bajarilish \d+([.,]\d+)?%/);

    await expenseCard.click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/dashboard/expenses' &&
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

    const revenueChart = page.getByRole('region', {
      name: 'Tushum reja va amalda diagrammasi',
    });
    await revenueChart.locator('.recharts-area-dots .recharts-dot').nth(22).hover({ force: true });
    await expect(revenueChart.getByText(/^Reja:/)).toBeVisible();
    await expect(revenueChart.getByText(/^Amalda:/)).toBeVisible();
  });

  test('yillik xarajat tarkibi tooltipi summani premium kartada ko‘rsatadi', async ({ page }) => {
    await login(page);
    await page.goto(`/dashboard?period=${fixtureIds.periodAug}&branch=all`);

    const compositionChart = page.getByLabel(
      'Yillik doimiy va o‘zgaruvchan xarajatlar diagrammasi',
    );
    const tooltip = compositionChart.locator('.neu-chart-tooltip');
    await expect(tooltip).toHaveCount(0);

    await compositionChart.locator('.recharts-sector').first().hover({ force: true });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Doimiy');
    await expect(tooltip).toContainText(/\d[\d\s]* so‘m/);
    await expect(tooltip).toContainText(/Jami xarajatning \d+([.,]\d+)?% qismi/);
  });
});
