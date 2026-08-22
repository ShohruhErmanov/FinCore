import { expect, test, type Page } from '@playwright/test';
import { demoAccounts, fixtureIds, login } from './support/auth';

test.describe('Write scope, idempotency va hisob davri', () => {
  test('[FE-SCOPE-02, FE-MSW] finance+kassir read-all, write-only-Sayxun bo‘ladi', async ({
    page,
  }) => {
    await login(page, demoAccounts.financeCashier);

    const readBranchFilter = page.getByRole('banner').getByLabel('Filial');
    await expect(readBranchFilter.locator(`option[value="${fixtureIds.sayxun}"]`)).toHaveText(
      'Sayxun',
    );
    await expect(readBranchFilter.locator(`option[value="${fixtureIds.xalqlar}"]`)).toHaveText(
      "Xalqlar do'stligi",
    );

    await page.goto('/expenses/new');
    await expect(page.getByRole('heading', { name: 'Yangi xarajat' })).toBeVisible();
    await expect(page.locator('#expense-form-branch-readonly')).toHaveValue('Sayxun');
    await expect(page.locator('#expense-form-branch')).toHaveCount(0);

    const expenseBefore = await ledgerSummary(page, '/api/expenses');
    const expenseKey = uniqueKey('finance-forged-expense');
    const deniedExpense = await postApi(
      page,
      '/api/expenses',
      {
        transactionDate: '2026-08-20',
        branchId: fixtureIds.xalqlar,
        categoryId: fixtureIds.rent,
        description: 'Finance forged Xalqlar expense',
        amountUzs: '101',
        paymentMethodId: fixtureIds.cash,
        departmentId: fixtureIds.adminDepartment,
        responsibleUserId: fixtureIds.finance,
        idempotencyKey: expenseKey,
      },
      expenseKey,
    );
    expect(deniedExpense).toMatchObject({
      status: 403,
      body: { code: 'BRANCH_SCOPE_DENIED' },
    });
    await expect.poll(() => ledgerSummary(page, '/api/expenses')).toEqual(expenseBefore);
  });

  test('[NFR-PERF-05, FE-MSW] bir xil expense idempotency key faqat bitta yozuv yaratadi', async ({
    page,
  }) => {
    await login(page, demoAccounts.financeCashier);
    const before = await ledgerSummary(page, '/api/expenses');
    const amountUzs = '7654321';
    const idempotencyKey = uniqueKey('expense-dedupe');
    const payload = {
      transactionDate: '2026-08-21',
      branchId: fixtureIds.sayxun,
      categoryId: fixtureIds.rent,
      description: 'Playwright expense idempotency acceptance',
      amountUzs,
      paymentMethodId: fixtureIds.cash,
      departmentId: fixtureIds.adminDepartment,
      responsibleUserId: fixtureIds.finance,
      idempotencyKey,
    };

    const first = await postApi(page, '/api/expenses', payload, idempotencyKey);
    const repeated = await postApi(page, '/api/expenses', payload, idempotencyKey);

    expect(first.status).toBe(201);
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(first.body.id);

    const after = await ledgerSummary(page, '/api/expenses');
    expect(after.count).toBe(before.count + 1);
    expect(after.sumUzs).toBe((BigInt(before.sumUzs) + BigInt(amountUzs)).toString());
    await expect.poll(() => ledgerItemCount(page, '/api/expenses', first.body.id)).toBe(1);
  });

  test('[FE-DATE-01, FE-MSW] UI yopiq davrni bloklaydi va ochiq davrni sanadan aniqlaydi', async ({
    page,
  }) => {
    await login(page, demoAccounts.financeCashier);
    await page.goto('/expenses/new');
    await expect(page.getByRole('heading', { name: 'Yangi xarajat' })).toBeVisible();

    await page.locator('#transaction-date').fill('2026-07-15');
    await expect(page.getByText(/Bu sana Iyul 2026 yopiq davriga tegishli/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Xarajatni saqlash/ })).toBeDisabled();

    await page.locator('#transaction-date').fill('2026-08-21');
    await expect(page.getByText('Hisob davri: Avgust 2026 — ochiq')).toBeVisible();
    await expect(page.getByRole('button', { name: /Xarajatni saqlash/ })).toBeEnabled();
  });
});

interface ApiResult {
  status: number;
  body: Record<string, string>;
}

function uniqueKey(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function postApi(
  page: Page,
  path: string,
  body: Record<string, string>,
  headerKey: string,
): Promise<ApiResult> {
  return page.evaluate(
    async ({ path, body, headerKey }) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': headerKey,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, string>,
      };
    },
    { path, body, headerKey },
  );
}

async function ledgerSummary(
  page: Page,
  endpoint: '/api/expenses',
): Promise<{ count: number; sumUzs: string }> {
  return page.evaluate(async (endpoint) => {
    const response = await fetch(`${endpoint}?page=1&pageSize=100`, { credentials: 'include' });
    const payload = (await response.json()) as {
      items: Array<{ amountUzs: string }>;
      total: number;
    };
    return {
      count: payload.total,
      sumUzs: payload.items.reduce((sum, item) => sum + BigInt(item.amountUzs), 0n).toString(),
    };
  }, endpoint);
}

async function ledgerItemCount(
  page: Page,
  endpoint: '/api/expenses',
  id: string,
): Promise<number> {
  return page.evaluate(
    async ({ endpoint, id }) => {
      const response = await fetch(`${endpoint}?page=1&pageSize=100`, { credentials: 'include' });
      const payload = (await response.json()) as { items: Array<{ id: string }> };
      return payload.items.filter((item) => item.id === id).length;
    },
    { endpoint, id },
  );
}
