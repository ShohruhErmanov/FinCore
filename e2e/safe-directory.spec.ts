import { expect, test } from '@playwright/test';
import { demoAccounts, login } from './support/auth';

test.describe('Xavfsiz user projection', () => {
  test('[FE-SEC-02] cashier directory javobida telefon va permissionlar ochilmaydi', async ({
    page,
  }) => {
    await login(page, demoAccounts.xalqlarCashier);

    const result = await page.evaluate(async () => {
      const directoryResponse = await fetch('/api/users/directory', { credentials: 'include' });
      const adminResponse = await fetch('/api/admin/users', { credentials: 'include' });
      return {
        directoryStatus: directoryResponse.status,
        directory: (await directoryResponse.json()) as Array<Record<string, unknown>>,
        adminStatus: adminResponse.status,
      };
    });

    expect(result.directoryStatus).toBe(200);
    expect(result.directory.length).toBeGreaterThan(0);
    for (const row of result.directory) {
      expect(Object.keys(row)).toEqual(
        expect.arrayContaining(['id', 'fullName', 'status', 'roles']),
      );
      expect(row).not.toHaveProperty('phone');
      expect(row).not.toHaveProperty('permissions');
      expect(row).not.toHaveProperty('writeBranchScopes');
      expect(row).not.toHaveProperty('passwordHash');
    }
    expect(result.adminStatus).toBe(403);
  });
});
