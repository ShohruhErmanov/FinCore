import { expect, test, type Page } from '@playwright/test';
import { demoAccounts, fixtureIds, login } from './support/auth';

const paymentMethodIds = {
  cash: '40000000-0000-0000-0000-000000000001',
} as const;

test.describe('Budjet va tushum frontend acceptance ssenariylari', () => {
  test('[AC-07, FE-E2E-MOCK] nol reja va reja mavjud emas semantikasi aralashmaydi', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/budgets/budget-v1');
    await expect(page.getByRole('heading', { name: 'Avgust 2026 budjeti' })).toBeVisible();

    const budgetTable = page.getByRole('table', { name: 'Avgust 2026 budjet matritsasi' });
    const zeroPlanRow = budgetTable
      .getByRole('row')
      .filter({ hasText: 'Tozalash' })
      .filter({ hasText: 'Sayxun' });
    await expect(zeroPlanRow).toContainText(/0.?so'm/);
    await expect(zeroPlanRow).toContainText('0 so‘m — valid nol reja');
    await expect(zeroPlanRow).toContainText('Rejadan tashqari / Unplanned');
    await expect(zeroPlanRow).toContainText(/Bajarilish:\s*—/);
    await expect(zeroPlanRow).not.toContainText(/Infinity|NaN/);

    const noPlanRow = budgetTable
      .getByRole('row')
      .filter({ hasText: 'Qo‘riqlash' })
      .filter({ hasText: "Xalqlar do'stligi" });
    await expect(noPlanRow).toContainText('Mavjud emas');
    await expect(noPlanRow).toContainText('Reja mavjud emas');
    await expect(noPlanRow).toContainText(/Bajarilish:\s*—/);
  });

  test('[AC-15, FE-E2E-MOCK] Sayxun 160m reja, 150m fakt, 10m gap va 93.75%', async ({ page }) => {
    await login(page);
    await page.goto(`/reports/revenue?period=${fixtureIds.periodAug}&branch=${fixtureIds.sayxun}`);
    await expect(page.getByRole('heading', { name: 'Tushum hisoboti' })).toBeVisible();

    const planKpi = kpiByLabel(page, 'Tasdiqlangan reja');
    const actualKpi = kpiByLabel(page, 'Haqiqiy tushum');
    const gapKpi = kpiByLabel(page, 'Rejaga yetmagan summa');
    const collectionKpi = kpiByLabel(page, 'Yig‘ilish foizi');
    await expect(planKpi).toContainText(/160.?000.?000 so'm/);
    await expect(actualKpi).toContainText(/150.?000.?000 so'm/);
    await expect(gapKpi).toContainText(/10.?000.?000 so'm/);
    await expect(collectionKpi).toContainText(/93[,.]75%/);

    const sayxunProgress = page
      .getByRole('img', { name: /Sayxun: rejaning 93[,.]75 foizi yig‘ilgan/ })
      .locator('..');
    await expect(sayxunProgress).toContainText(/160.?000.?000 so'm/);
    await expect(sayxunProgress).toContainText(/150.?000.?000 so'm/);
    await expect(sayxunProgress).toContainText(/93[,.]75%/);
  });

  test('[AC-17, FE-E2E-MOCK] Sayxun kanallari 60m/50m/40m va 40/33.33/26.67%', async ({ page }) => {
    await login(page);
    await page.goto(`/reports/revenue?period=${fixtureIds.periodAug}&branch=${fixtureIds.sayxun}`);

    const channels = page.getByRole('table', {
      name: 'Tushumning to‘lov kanallari bo‘yicha taqsimoti',
    });
    const cash = channels.getByRole('row').filter({ hasText: 'Naqd pul' });
    const card = channels.getByRole('row').filter({ hasText: 'Plastik karta' });
    const bank = channels.getByRole('row').filter({ hasText: 'Bank o‘tkazmasi' });

    await expect(cash).toContainText(/60.?000.?000 so'm/);
    await expect(cash).toContainText('40%');
    await expect(card).toContainText(/50.?000.?000 so'm/);
    await expect(card).toContainText(/33[,.]33%/);
    await expect(bank).toContainText(/40.?000.?000 so'm/);
    await expect(bank).toContainText(/26[,.]67%/);

    await cash.getByRole('link', { name: /Drill-down/ }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === '/revenue/transactions' &&
        url.searchParams.get('period') === fixtureIds.periodAug &&
        url.searchParams.get('branch') === fixtureIds.sayxun &&
        url.searchParams.get('paymentMethod') === paymentMethodIds.cash &&
        url.searchParams.get('status') === 'posted'
      );
    });
  });

  test('[AC-19, FE-MSW] Xalqlar kassiri Sayxun forged POST qila olmaydi', async ({ page }) => {
    await login(page, demoAccounts.xalqlarCashier);
    await page.goto('/revenue/new');
    await expect(page.getByRole('heading', { name: 'Yangi tushum' })).toBeVisible();

    const branchSelect = page.locator('#revenue-branch');
    await expect(branchSelect).toBeDisabled();
    await expect(branchSelect.locator('option')).toHaveCount(1);
    await expect(branchSelect.locator('option')).toHaveText("Xalqlar do'stligi");
    await expect(branchSelect.locator(`option[value="${fixtureIds.sayxun}"]`)).toHaveCount(0);

    const before = await currentCashierLedger(page);
    const denied = await page.evaluate(
      async ({ branchId, methodId }) => {
        const response = await fetch('/api/revenue-transactions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentAt: '2026-08-20T12:00:00+05:00',
            branchId,
            amountUzs: '1',
            paymentMethodId: methodId,
            description: 'Forged cross-branch Playwright check',
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const body = (await response.json()) as { code?: string };
        return { status: response.status, code: body.code };
      },
      { branchId: fixtureIds.sayxun, methodId: paymentMethodIds.cash },
    );
    const after = await currentCashierLedger(page);

    expect(denied).toEqual({ status: 403, code: 'BRANCH_SCOPE_DENIED' });
    expect(after).toEqual(before);
    await expect(page).toHaveURL(/\/revenue\/new$/);
  });
});

function kpiByLabel(page: Page, label: string) {
  const exactLabel = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return page.locator('p').filter({ hasText: exactLabel }).locator('..').locator('..');
}

async function currentCashierLedger(page: Page): Promise<{ count: number; sumUzs: string }> {
  return page.evaluate(async () => {
    const response = await fetch('/api/revenue-transactions?page=1&pageSize=1000', {
      credentials: 'include',
    });
    const payload = (await response.json()) as {
      items: Array<{ amountUzs: string }>;
      total: number;
    };
    return {
      count: payload.total,
      sumUzs: payload.items.reduce((sum, item) => sum + BigInt(item.amountUzs), 0n).toString(),
    };
  });
}
