import { expect, test } from '@playwright/test';
import { fixtureIds, login } from './support/auth';

test.describe('Budjet frontend acceptance ssenariylari', () => {
  test('[AC-07, FE-E2E-MOCK] nol reja va reja mavjud emas semantikasi aralashmaydi', async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/budgets?period=${fixtureIds.periodAug}`);
    await expect(page.getByRole('heading', { name: 'Budjet', exact: true })).toBeVisible();

    const categorySelect = page.getByLabel('Budjet kategoriyasi');

    await categorySelect.selectOption({ label: 'Tozalash' });
    const zeroPlanGroup = page.getByRole('group', {
      name: 'Sayxun, Tozalash reja mavjudligi',
    });
    // Reja qatori BOR, summasi 0 — bu «Nol reja», «reja yo‘q» emas.
    await expect(zeroPlanGroup.getByRole('button', { name: 'Reja mavjud' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const zeroPlanCard = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Tozalash', exact: true }),
    });
    await expect(zeroPlanCard).toContainText('0 so‘m — haqiqiy nol reja');
    await expect(zeroPlanCard).toContainText('Nol reja');
    await expect(zeroPlanCard).not.toContainText('Reja mavjud emas');
    await expect(zeroPlanCard).not.toContainText(/Infinity|NaN/);

    // Reja qatori YO‘Q — foiz ham, farq ham hisoblanmaydi.
    await categorySelect.selectOption({ label: 'Qo‘riqlash' });
    const noPlanGroup = page.getByRole('group', {
      name: "Xalqlar do'stligi, Qo‘riqlash reja mavjudligi",
    });
    await expect(noPlanGroup.getByRole('button', { name: 'Reja yo‘q' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const noPlanCard = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Qo‘riqlash', exact: true }),
    });
    await expect(noPlanCard).toContainText('Reja kiritilmagan');
    await expect(noPlanCard).not.toContainText('Nol reja');
    await expect(noPlanCard).not.toContainText(/Infinity|NaN/);
  });
});
