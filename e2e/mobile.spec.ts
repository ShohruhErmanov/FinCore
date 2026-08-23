import { expect, test } from '@playwright/test';
import { demoAccounts, login } from './support/auth';

test.describe('Cashier mobile viewport', () => {
  test('[FE-MOBILE-01] 390px xarajat formasida sahifa gorizontal chiqib ketmaydi', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Direktor xarajat kiritmaydi — forma kassir/moliya roli uchun.
    await login(page, demoAccounts.financeCashier);
    await page.goto('/expenses/new');

    await expect(page.getByRole('heading', { name: 'Yangi xarajat' })).toBeVisible();
    await expect(page.getByLabel('Xarajat sanasi')).toBeVisible();
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
