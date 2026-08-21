import { expect, test } from '@playwright/test';
import { login } from './support/auth';

test.describe('Data quality va reconciliation', () => {
  test('[AC-10, AC-22] 6 318 400 so‘m va 43 satr tafovut yashirilmaydi', async ({ page }) => {
    await login(page);
    await page.goto('/data-quality');

    await expect(
      page.getByRole('heading', { name: 'Data quality va reconciliation' }),
    ).toBeVisible();
    await expect(page.getByText(/6.?318.?400 so'm/).first()).toBeVisible();
    await expect(page.getByText(/43 ta satr|43 satr/).first()).toBeVisible();
    await expect(page.getByText('Matn formatidagi sana')).toBeVisible();
    await expect(page.getByText('15.08.2026')).toBeVisible();
  });
});
