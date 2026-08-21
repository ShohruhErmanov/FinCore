import { expect, test } from '@playwright/test';
import { login } from './support/auth';

test.describe('Cashier mobile viewport', () => {
  test('[FE-MOBILE-01] 390px tushum formasida sahifa gorizontal chiqib ketmaydi', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto('/revenue/new');

    await expect(page.getByRole('heading', { name: 'Yangi tushum' })).toBeVisible();
    await expect(page.getByLabel('To‘lov sanasi va vaqti')).toBeVisible();
    await expect(page.getByLabel('Summa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menyuni ochish' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);

    await page.getByRole('button', { name: 'Menyuni ochish' }).click();
    await expect(page.getByRole('navigation', { name: 'Asosiy navigatsiya' })).toBeVisible();
  });
});
