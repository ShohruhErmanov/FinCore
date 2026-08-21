import { expect, type Page } from '@playwright/test';

export const fixtureIds = {
  periodAug: '20000000-0000-0000-0000-000000000008',
  periodJul: '20000000-0000-0000-0000-000000000007',
  sayxun: '10000000-0000-0000-0000-000000000001',
  xalqlar: '10000000-0000-0000-0000-000000000002',
  finance: '30000000-0000-0000-0000-000000000002',
  xalqlarCashier: '30000000-0000-0000-0000-000000000003',
  cashierA: '30000000-0000-0000-0000-000000000004',
  cashierB: '30000000-0000-0000-0000-000000000005',
  cash: '40000000-0000-0000-0000-000000000001',
  rent: '60000000-0000-0000-0000-000000000001',
  adminDepartment: '50000000-0000-0000-0000-000000000002',
} as const;

export const demoAccounts = {
  director: '+998901112233',
  financeCashier: '+998907778899',
  xalqlarCashier: '+998909991122',
} as const;

export async function login(page: Page, phone = demoAccounts.director): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Tizimga kirish' })).toBeVisible();
  await page.getByLabel('Telefon raqam').fill(phone);
  await page.locator('#password').fill('demo123');
  await page.getByRole('button', { name: 'Kirish' }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Moliyaviy dashboard' })).toBeVisible();
}
