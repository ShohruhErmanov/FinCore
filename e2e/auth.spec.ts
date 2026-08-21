import { expect, test } from '@playwright/test';
import { demoAccounts, login } from './support/auth';

test.describe('FINCORE auth va route permissionlari', () => {
  test('[FE-AUTH-01, FE-SEC-01] xato login, to‘g‘ri mock login va cookie-session UX', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Telefon raqam').fill(demoAccounts.director);
    await page.locator('#password').fill('bad123');
    await page.getByRole('button', { name: 'Kirish' }).click();

    await expect(page.getByRole('alert')).toContainText('Kirish amalga oshmadi');
    await expect(page).toHaveURL(/\/login$/);

    await page.locator('#password').fill('demo123');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await expect(page.getByRole('heading', { name: 'Moliyaviy dashboard' })).toBeVisible();

    const suspiciousStorageKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => /token|jwt|session|password/i.test(key)),
    );
    expect(suspiciousStorageKeys).toEqual([]);
  });

  test('[FE-AUTH-03] cashier direct audit routega kira olmaydi', async ({ page }) => {
    await login(page, demoAccounts.xalqlarCashier);
    await page.goto('/audit');

    await expect(page.getByRole('heading', { name: 'Ruxsat yo‘q' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  });
});
