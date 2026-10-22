import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiException, type AuthenticatedUser } from '@/common';
import type { AppEnv } from '@/config';
import type { ActorContextService, PrismaService } from '@/database';
import { BackupsService, formatBytes, SAFE_BACKUP_FILENAME_REGEX } from './backups.service';

function createMockUser(role: 'director' | 'cashier' | 'finance_manager' | 'business_owner'): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Test User',
    phone: '+998901112233',
    status: 'active',
    roles: [
      {
        id: 'role-1',
        role,
        roleName: role,
        branchId: null,
        branchName: null,
      },
    ],
    permissions: role === 'director' ? ['user.manage'] : [],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '0',
    lastLoginAt: null,
  } as AuthenticatedUser;
}

describe('BackupsService', () => {
  const testBackupDir = resolve('backend/test-backups-dir');
  let service: BackupsService;
  let mockEnv: AppEnv;
  let mockPrisma: PrismaService;
  let mockActor: ActorContextService;

  beforeEach(() => {
    process.env.FINCORE_BACKUP_DIR = testBackupDir;
    mkdirSync(testBackupDir, { recursive: true });

    mockEnv = {
      DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/fincore?schema=fincore',
    } as unknown as AppEnv;

    mockPrisma = {
      withActor: vi.fn().mockImplementation((_token, work) => work({ $executeRaw: vi.fn() })),
    } as unknown as PrismaService;

    mockActor = {
      mint: vi.fn().mockReturnValue('mock-actor-token'),
    } as unknown as ActorContextService;

    service = new BackupsService(mockEnv, mockPrisma, mockActor);
  });

  afterEach(() => {
    delete process.env.FINCORE_BACKUP_DIR;
    if (existsSync(testBackupDir)) {
      rmSync(testBackupDir, { recursive: true, force: true });
    }
  });

  describe('formatBytes helper', () => {
    it('formats various byte sizes properly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
    });
  });

  describe('Filename validation', () => {
    it('accepts valid deterministic dump filenames', () => {
      expect(SAFE_BACKUP_FILENAME_REGEX.test('fincore-2026-10-22-12-49-38.dump')).toBe(true);
      expect(SAFE_BACKUP_FILENAME_REGEX.test('fincore-2025-01-01-00-00-00.dump')).toBe(true);
    });

    it('rejects path traversal or malicious filenames', () => {
      expect(SAFE_BACKUP_FILENAME_REGEX.test('../fincore-2026-10-22-12-49-38.dump')).toBe(false);
      expect(SAFE_BACKUP_FILENAME_REGEX.test('fincore.dump')).toBe(false);
      expect(SAFE_BACKUP_FILENAME_REGEX.test('shell.php')).toBe(false);
      expect(SAFE_BACKUP_FILENAME_REGEX.test('fincore-2026-10-22.dump')).toBe(false);
    });
  });

  describe('assertDirector authorization', () => {
    it('allows director role', () => {
      const director = createMockUser('director');
      expect(() => service.assertDirector(director)).not.toThrow();
    });

    it('rejects non-director roles with 403 Forbidden', () => {
      const cashier = createMockUser('cashier');
      expect(() => service.assertDirector(cashier)).toThrow(ApiException);
      expect(() => service.assertDirector(cashier)).toThrowError(/Faqat Direktor/i);

      const finance = createMockUser('finance_manager');
      expect(() => service.assertDirector(finance)).toThrow(ApiException);

      const owner = createMockUser('business_owner');
      expect(() => service.assertDirector(owner)).toThrow(ApiException);
    });
  });

  describe('listBackups', () => {
    it('lists only valid dumps and sorts them newest first', async () => {
      const director = createMockUser('director');

      writeFileSync(resolve(testBackupDir, 'fincore-2026-10-20-10-00-00.dump'), 'dummy-1');
      writeFileSync(resolve(testBackupDir, 'fincore-2026-10-22-12-00-00.dump'), 'dummy-2');
      writeFileSync(resolve(testBackupDir, 'random-file.txt'), 'not a dump');

      const list = await service.listBackups(director);

      expect(list.length).toBe(2);
      expect(list.map((item) => item.filename)).toContain('fincore-2026-10-20-10-00-00.dump');
      expect(list.map((item) => item.filename)).toContain('fincore-2026-10-22-12-00-00.dump');
      expect(list.map((item) => item.filename)).not.toContain('random-file.txt');
    });
  });

  describe('getBackupFile security', () => {
    it('rejects path traversal attempts with 400 or 403', async () => {
      const director = createMockUser('director');

      await expect(service.getBackupFile(director, '../../etc/passwd')).rejects.toThrow(ApiException);
    });

    it('rejects non-existent dump file with 404', async () => {
      const director = createMockUser('director');

      await expect(service.getBackupFile(director, 'fincore-2026-10-22-99-99-99.dump')).rejects.toThrow(
        ApiException,
      );
    });

    it('returns file info for valid existing backup and triggers audit log', async () => {
      const director = createMockUser('director');
      const filename = 'fincore-2026-10-22-12-00-00.dump';
      writeFileSync(resolve(testBackupDir, filename), 'test dump content');

      const result = await service.getBackupFile(director, filename);

      expect(result.filename).toBe(filename);
      expect(result.sizeBytes).toBe('test dump content'.length);
      expect(mockPrisma.withActor).toHaveBeenCalled();
    });
  });

  describe('deleteBackup', () => {
    it('deletes existing file and logs audit', async () => {
      const director = createMockUser('director');
      const filename = 'fincore-2026-10-22-12-00-00.dump';
      const filePath = resolve(testBackupDir, filename);
      writeFileSync(filePath, 'test dump content');

      expect(existsSync(filePath)).toBe(true);
      const res = await service.deleteBackup(director, filename);
      expect(res.success).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });
  });
});
