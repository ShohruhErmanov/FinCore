import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Neumorphism sana tanlash', () => {
  test('ochilgan kalendar, tanlash va responsive joylashuv ishlaydi', async ({ page }) => {
    await login(page);
    await page.goto(`/revenue?period=${fixtureIds.periodAug}&branch=all`);

    const input = page.locator('#revenue-date-from');
    const shell = input.locator('..');
    await shell.click();

    const calendar = page.getByRole('dialog', { name: 'Sana tanlash' });
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Oldingi oy' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Keyingi oy' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: 'Bugun' })).toBeVisible();

    const viewport = page.viewportSize();
    const box = await calendar.boundingBox();
    expect(box).not.toBeNull();
    if (viewport && box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }

    const selectableDay = calendar.getByRole('gridcell').filter({ hasText: /^15$/ }).first();
    await selectableDay.click();
    await expect(calendar).not.toBeVisible();
    await expect(input).toHaveValue(/2026-\d{2}-15/);
  });

  test('klaviatura orqali keyingi kun tanlanadi', async ({ page }) => {
    await login(page);
    await page.goto(`/revenue?period=${fixtureIds.periodAug}&branch=all`);

    const input = page.locator('#revenue-date-from');
    const originalValue = await input.inputValue();
    await input.focus();
    await input.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Sana tanlash' })).toBeVisible();
    await input.press('ArrowRight');
    await input.press('Enter');

    await expect(input).not.toHaveValue(originalValue);
    await expect(page.getByRole('dialog', { name: 'Sana tanlash' })).not.toBeVisible();
  });
});
