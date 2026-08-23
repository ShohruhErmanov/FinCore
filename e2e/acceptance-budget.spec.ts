import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Budjet frontend acceptance ssenariylari', () => {
  test('[AC-07, FE-E2E-MOCK] nol reja va reja mavjud emas semantikasi aralashmaydi', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/budgets?period=${fixtureIds.periodAug}`);
    await expect(page.getByRole('heading', { name: 'Budjet', exact: true })).toBeVisible();

    const budgetTable = page.getByRole('table', { name: 'Avgust 2026 budjet matritsasi' });
    const zeroPlanRow = budgetTable
      .getByRole('row')
      .filter({ hasText: 'Tozalash' })
      .filter({ hasText: 'Sayxun' });
    // Reja qatori BOR, summasi 0 — bu «Nol reja», «reja yo‘q» emas.
    await expect(zeroPlanRow.getByRole('checkbox')).toBeChecked();
    await expect(zeroPlanRow).toContainText('0 so‘m — valid nol reja');
    await expect(zeroPlanRow).toContainText('Nol reja');
    await expect(zeroPlanRow).not.toContainText('Reja mavjud emas');
    await expect(zeroPlanRow).toContainText(/Bajarilish:\s*—/);
    await expect(zeroPlanRow).not.toContainText(/Infinity|NaN/);

    // Reja qatori YO‘Q — foiz ham, farq ham hisoblanmaydi.
    const noPlanRow = budgetTable
      .getByRole('row')
      .filter({ hasText: 'Qo‘riqlash' })
      .filter({ hasText: "Xalqlar do'stligi" });
    await expect(noPlanRow.getByRole('checkbox')).not.toBeChecked();
    await expect(noPlanRow).toContainText('Reja mavjud emas');
    await expect(noPlanRow).not.toContainText('Nol reja');
    await expect(noPlanRow).toContainText(/Bajarilish:\s*—/);
  });
});
