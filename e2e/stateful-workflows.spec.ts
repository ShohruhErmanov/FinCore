import { expect, test } from '@playwright/test';
import { demoAccounts, login } from './support/auth';

test.describe('FINCORE stateful browser workflowlari', () => {
  test('[FE-ADMIN-01, FE-AUTH-04] admin userni blocked qiladi va keyingi login rad etiladi', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Foydalanuvchilar' })).toBeVisible();

    const userRow = page
      .getByRole('table', { name: 'Foydalanuvchilar, rollar va filial scope’lari' })
      .getByRole('row')
      .filter({ hasText: 'Dilnoza Qodirova' });
    const statusSelect = userRow.getByLabel('Dilnoza Qodirova holati');
    await expect(statusSelect).toHaveValue('active');
    await statusSelect.selectOption('blocked');
    await expect(statusSelect).toHaveValue('blocked');
    await expect(userRow).toContainText('Bloklangan');

    await page.getByRole('button', { name: /Shohrux Ermanov/ }).click();
    await page.getByRole('button', { name: 'Chiqish' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Telefon raqam').fill(demoAccounts.xalqlarCashier);
    await page.locator('#password').fill('demo123');
    await page.getByRole('button', { name: 'Kirish' }).click();
    await expect(page.getByRole('alert')).toContainText('Kirish amalga oshmadi');
    await expect(page).toHaveURL(/\/login$/);
  });
});
