import { expect, test } from '@playwright/test';

test.describe('Premium Neumorphism login', () => {
  test('kunduzgi va Deep Navy tungi rejimni saqlab qoladi', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Tungi rejimga o‘tish' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Kunduzgi rejimga o‘tish' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
        ),
      )
      .toBe('23 36 57');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('desktop va mobil layout funksional va overflow-siz', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1920, height: 900 });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Tizimga kirish' })).toBeVisible();
    await expect(page.getByLabel('Telefon raqam')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirish' })).toBeVisible();

    if (mobile) {
      await expect(page.getByLabel('FINCORE haqida')).toBeHidden();
    } else {
      await expect(page.getByLabel('FINCORE haqida')).toBeVisible();
      await expect(page.getByText('Scope nazorati')).toBeVisible();
      await expect(page.getByText('Jonli analitika')).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const hasVerticalOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    );
    expect(hasVerticalOverflow).toBe(false);

    if (process.env.CAPTURE_LOGIN_VISUALS === '1') {
      await page.screenshot({
        path: `test-results/login-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  });
});
