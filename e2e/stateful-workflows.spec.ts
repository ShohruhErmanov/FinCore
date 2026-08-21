import { expect, test, type Page } from '@playwright/test';
import { demoAccounts, fixtureIds, login } from './support/auth';

test.describe('FINCORE stateful browser workflowlari', () => {
  test('[FE-BUDGET-WF-01] submitted budjet approve, yangi draft revision va submit bo‘ladi', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/budgets/budget-v1');
    await expect(page.getByRole('heading', { name: 'Avgust 2026 budjeti' })).toBeVisible();
    await expect(page.getByText('Yuborilgan', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yangi reviziya' })).toBeDisabled();

    await page.getByRole('button', { name: 'Tasdiqlash' }).click();
    await expect(page.getByText('Tasdiqlangan', { exact: true })).toBeVisible();
    await expect(page.getByText('Tasdiqladi: Shohrux Ermanov')).toBeVisible();
    const revisionButton = page.getByRole('button', { name: 'Yangi reviziya' });
    await expect(revisionButton).toBeEnabled();
    await revisionButton.click();

    await expect(page.getByRole('heading', { name: 'Yangi budjet reviziyasi' })).toBeVisible();
    const reason = 'Avgust prognozini yangilash uchun yangi reviziya';
    await page.getByLabel('Reviziya sababi').fill(reason);
    await page.getByRole('button', { name: 'Draft reviziya yaratish' }).click();

    await expect(page).toHaveURL(/\/budgets\/budget-.+-r3-/);
    await expect(page.getByText(/Reviziya #3\./)).toBeVisible();
    await expect(page.getByText('Qoralama', { exact: true })).toBeVisible();
    const revisionId = new URL(page.url()).pathname.split('/').at(-1)!;
    const createdRevision = await getJson(page, `/api/budget-versions/${revisionId}`);
    expect(createdRevision).toMatchObject({ status: 200, body: { reason } });
    await expect(page.getByRole('button', { name: 'Draftni saqlash' })).toBeVisible();

    await page.getByRole('button', { name: 'Tasdiqqa yuborish' }).click();
    await expect(page.getByText('Yuborilgan', { exact: true })).toBeVisible();
    await expect(page.getByText('Yubordi: Shohrux Ermanov')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draftni saqlash' })).toHaveCount(0);
  });

  test('[AC-21, FE-REVENUE-WF-01] on-behalf UI create va reversal report/dashboarddan ayriladi', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/revenue/new');
    await expect(page.getByRole('heading', { name: 'Yangi tushum' })).toBeVisible();

    await page.locator('#revenue-branch').selectOption(fixtureIds.sayxun);
    await page.locator('#revenue-date').fill('2026-08-21T14:30');
    await page.locator('#revenue-amount').fill('500000');
    await page.locator('#revenue-method').selectOption(fixtureIds.cash);
    await page.locator('#revenue-collector').selectOption(fixtureIds.cashierA);
    await expect(page.locator('#on-behalf-reason')).toBeVisible();

    await page.getByRole('button', { name: 'Tushumni saqlash' }).click();
    await expect(page.getByText('Boshqa kassir nomidan kiritish sababini yozing.')).toBeVisible();

    const behalfReason = 'Aziza kassasi uchun direktor kiritdi';
    await page.locator('#on-behalf-reason').fill(behalfReason);
    await page.getByRole('button', { name: 'Tushumni saqlash' }).click();
    await expect(page).toHaveURL(/\/revenue\/transactions\/rev-mock-/);
    const detailUrl = page.url();

    await expect(page.getByRole('heading', { name: /Kvitansiya #/ })).toBeVisible();
    await expect(page.getByText(/500.?000 so'm/).first()).toBeVisible();
    await expect(page.getByText('Boshqa kassir nomidan', { exact: true })).toBeVisible();
    await expect(detailValue(page, 'Kassir')).toContainText('Aziza Rahimova');
    await expect(detailValue(page, 'Kiritgan user')).toContainText('Shohrux Ermanov');
    await expect(detailValue(page, 'Vakillik sababi')).toContainText(behalfReason);

    await clientNavigate(
      page,
      `/reports/revenue?period=${fixtureIds.periodAug}&branch=${fixtureIds.sayxun}`,
    );
    await expect(page.getByRole('heading', { name: 'Tushum hisoboti' })).toBeVisible();
    await expect(kpiByLabel(page, 'Haqiqiy tushum')).toContainText(/150.?500.?000 so'm/);
    await expect(kpiByLabel(page, 'Rejaga yetmagan summa')).toContainText(/9.?500.?000 so'm/);

    await clientNavigate(page, new URL(detailUrl).pathname);
    await expect(page.getByRole('heading', { name: /Kvitansiya #/ })).toBeVisible();
    await page.getByRole('button', { name: 'Bekor qilish' }).click();
    await expect(
      page.getByRole('heading', { name: 'Tushumni bekor qilishni tasdiqlang' }),
    ).toBeVisible();
    const reverseButton = page.getByRole('button', { name: 'Reversal yaratish' });
    await expect(reverseButton).toBeDisabled();
    const reversalReason = 'Noto‘g‘ri tushum sinov reversal';
    await page.locator('#revenue-reversal-reason').fill(reversalReason);
    await expect(reverseButton).toBeEnabled();
    await reverseButton.click();

    await expect(page.getByText('Bekor qilingan tushum', { exact: true })).toBeVisible();
    await expect(page.getByText(reversalReason).first()).toBeVisible();
    await expect(page.getByText('revenue.reversed', { exact: true })).toBeVisible();

    await clientNavigate(
      page,
      `/reports/revenue?period=${fixtureIds.periodAug}&branch=${fixtureIds.sayxun}&refresh=after-reversal`,
    );
    await expect(page.getByRole('heading', { name: 'Tushum hisoboti' })).toBeVisible();
    await expect(kpiByLabel(page, 'Haqiqiy tushum')).toContainText(/150.?000.?000 so'm/);
    await expect(kpiByLabel(page, 'Rejaga yetmagan summa')).toContainText(/10.?000.?000 so'm/);

    await clientNavigate(
      page,
      `/dashboard?period=${fixtureIds.periodAug}&branch=${fixtureIds.sayxun}`,
    );
    await expect(page.getByRole('heading', { name: 'Moliyaviy dashboard' })).toBeVisible();
    const dashboardKpis = page.getByRole('region', { name: 'Asosiy ko‘rsatkichlar' });
    await expect(dashboardKpis.getByText("150 mln so'm")).toBeVisible();
    await expect(dashboardKpis.getByText('Sof tushgan pul')).toBeVisible();
  });

  test('[FE-REVENUE-WF-02] oddiy kassir on-behalf permissionga ega emas', async ({ page }) => {
    await login(page, demoAccounts.xalqlarCashier);
    await page.goto('/revenue/new');
    const collector = page.locator('#revenue-collector');
    await expect(collector).toBeDisabled();
    await expect(collector).toHaveValue(fixtureIds.xalqlarCashier);
    await expect(page.locator('#on-behalf-reason')).toHaveCount(0);

    const key = uniqueKey('cashier-forged-on-behalf');
    const denied = await postJson(
      page,
      '/api/revenue-transactions',
      {
        paymentAt: '2026-08-21T15:00:00+05:00',
        branchId: fixtureIds.xalqlar,
        amountUzs: '500000',
        paymentMethodId: fixtureIds.cash,
        collectorUserId: fixtureIds.finance,
        onBehalfReason: 'Permission bo‘lmasa ham forged sabab',
        description: 'Forged on-behalf check',
        idempotencyKey: key,
      },
      key,
    );
    expect(denied).toMatchObject({ status: 403, body: { code: 'ON_BEHALF_DENIED' } });
  });

  test('[AC-08, AC-09, AC-22] blocked close readiness tuzatilib, close va reasonli reopen bo‘ladi', async ({
    page,
  }) => {
    await login(page);
    const periodPath = `/periods/${fixtureIds.periodAug}`;
    await page.goto(periodPath);
    await expect(page.getByText('Davrni hozir yopib bo‘lmaydi', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Davrni yopish' })).toHaveCount(0);

    const blockedClose = await postJson(page, `/api${periodPath}/close`, {
      note: 'Bloklangan holatda yopish urinishi',
    });
    expect(blockedClose).toMatchObject({
      status: 409,
      body: { code: 'PERIOD_NOT_READY' },
    });

    await clientNavigate(page, '/budgets/budget-v1');
    await expect(page.getByRole('heading', { name: 'Avgust 2026 budjeti' })).toBeVisible();
    await page.getByRole('button', { name: 'Tasdiqlash' }).click();
    await expect(page.getByText('Tasdiqlangan', { exact: true })).toBeVisible();

    await clientNavigate(page, '/data-quality/imports');
    await expect(page.getByRole('heading', { name: 'Importlar' })).toBeVisible();
    await page.getByRole('button', { name: 'Importni ishga tushirish' }).click();
    await expect(page.getByText('Import yakunlandi', { exact: true })).toBeVisible();
    await expect(kpiByLabel(page, 'Normalizatsiya')).toContainText('43');
    await expect(kpiByLabel(page, 'Explicit exception')).toContainText('1');

    await clientNavigate(page, '/data-quality');
    await expect(
      page.getByRole('heading', { name: 'Data quality va reconciliation' }),
    ).toBeVisible();
    const resolveButtons = page.getByRole('button', { name: 'Hal qilindi' });
    await expect(resolveButtons).toHaveCount(2);
    await resolveButtons.first().click();
    await expect(resolveButtons).toHaveCount(1);
    await resolveButtons.first().click();
    await expect(resolveButtons).toHaveCount(0);

    await clientNavigate(page, periodPath);
    await expect(page.getByRole('heading', { name: 'Avgust 2026' })).toBeVisible();
    await expect(page.getByText('Davrni hozir yopib bo‘lmaydi', { exact: true })).toHaveCount(0);
    const closeAction = page.getByRole('button', { name: 'Davrni yopish' });
    await expect(closeAction).toBeVisible();
    await closeAction.click();

    const closeReason = 'Avgust moliyaviy yakuni tasdiqlandi';
    const closeSubmit = page.getByRole('button', { name: 'Yopish', exact: true });
    await expect(closeSubmit).toBeDisabled();
    await page.locator('#period-action-reason').fill(closeReason);
    await expect(closeSubmit).toBeEnabled();
    await closeSubmit.click();

    await expect(page.getByText('Yopiq davr', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(closeReason)).toBeVisible();
    const reopenAction = page.getByRole('button', { name: 'Qayta ochish', exact: true });
    await expect(reopenAction).toBeVisible();
    await reopenAction.click();

    const reopenReason = 'Auditli tuzatish uchun qayta ochildi';
    const reopenSubmit = page.getByRole('button', { name: 'Qayta ochish', exact: true }).last();
    await expect(reopenSubmit).toBeDisabled();
    await page.locator('#period-action-reason').fill(reopenReason);
    await expect(reopenSubmit).toBeEnabled();
    await reopenSubmit.click();

    await expect(page.getByText('Ochiq', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(reopenReason)).toBeVisible();
    await expect(page.getByText('Davr qayta ochildi', { exact: true }).first()).toBeVisible();
  });

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

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

function uniqueKey(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function postJson(
  page: Page,
  path: string,
  body: Record<string, string>,
  idempotencyKey?: string,
): Promise<ApiResult> {
  return page.evaluate(
    async ({ path, body, idempotencyKey }) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
    { path, body, idempotencyKey },
  );
}

async function getJson(page: Page, path: string): Promise<ApiResult> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: 'include' });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }, path);
}

async function clientNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

function kpiByLabel(page: Page, label: string) {
  const exactLabel = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return page.locator('p').filter({ hasText: exactLabel }).locator('..').locator('..');
}

function detailValue(page: Page, label: string) {
  const exactLabel = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return page.locator('dt').filter({ hasText: exactLabel }).locator('..');
}
