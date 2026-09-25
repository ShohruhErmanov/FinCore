import { expect, test } from '@playwright/test';
import { demoAccounts, fixtureIds, login } from './support/auth';

test.describe('Oylik hisobot', () => {
  test('barcha filiallar: reja-fakt, filiallar va CSV saqlanadi', async ({ page }) => {
    await login(page, demoAccounts.director);
    await page.goto(`/reports/monthly?period=${fixtureIds.periodAug}&branch=all`);

    await expect(page.getByRole('region', { name: 'Oylik moliyaviy natija' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filiallar bo‘yicha reja-fakt' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Yillik reja va fakt trendi' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Kategoriyalar bo‘yicha batafsil hisobot' }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Yillik CSV yuklab olish' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('oylik-hisobot-');
  });

  test('mobil ekranda gorizontal sahifa overflow bo‘lmaydi', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, demoAccounts.director);
    await page.goto(`/reports/monthly?period=${fixtureIds.periodAug}&branch=all`);
    await expect(page.getByRole('region', { name: 'Oylik moliyaviy natija' })).toBeVisible();
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(width.page).toBeLessThanOrEqual(width.viewport);
  });
});
