import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { AuthenticatedUser } from '@/common';
import { BackupsController } from './backups.controller';
import type { BackupsService } from './backups.service';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: vi.fn().mockImplementation(() => Readable.from(['mock dump content'])),
  };
});

const mockUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  fullName: 'Direktor',
  phone: '+998901112233',
  status: 'active',
  roles: [{ id: 'r1', role: 'director', roleName: 'Direktor', branchId: null, branchName: null }],
  permissions: ['user.manage'],
  branchScopes: [],
  writeBranchScopes: [],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
} as AuthenticatedUser;

describe('BackupsController', () => {
  it('delegates create to backupsService.createBackup', async () => {
    const mockService = {
      createBackup: vi.fn().mockResolvedValue({
        filename: 'fincore-2026-10-22-12-00-00.dump',
        sizeBytes: 1024,
        sizeFormatted: '1 KB',
        createdAt: '2026-10-22T12:00:00.000Z',
        schema: 'fincore',
        format: 'custom',
        durationMs: 500,
      }),
    } as unknown as BackupsService;

    const controller = new BackupsController(mockService);
    const result = await controller.createBackup(mockUser);

    expect(result.filename).toBe('fincore-2026-10-22-12-00-00.dump');
    expect(mockService.createBackup).toHaveBeenCalledWith(mockUser);
  });

  it('delegates list to backupsService.listBackups', async () => {
    const mockService = {
      listBackups: vi.fn().mockResolvedValue([
        {
          filename: 'fincore-2026-10-22-12-00-00.dump',
          sizeBytes: 1024,
          sizeFormatted: '1 KB',
          createdAt: '2026-10-22T12:00:00.000Z',
        },
      ]),
    } as unknown as BackupsService;

    const controller = new BackupsController(mockService);
    const result = await controller.listBackups(mockUser);

    expect(result.length).toBe(1);
    expect(mockService.listBackups).toHaveBeenCalledWith(mockUser);
  });

  it('sets attachment headers and returns StreamableFile on download', async () => {
    const mockService = {
      getBackupFile: vi.fn().mockResolvedValue({
        filename: 'fincore-2026-10-22-12-00-00.dump',
        filePath: 'mock/path/fincore-2026-10-22-12-00-00.dump',
        sizeBytes: 16,
      }),
    } as unknown as BackupsService;

    const setHeaders: Record<string, string> = {};
    const mockRes = {
      set: vi.fn((headers: Record<string, string>) => {
        Object.assign(setHeaders, headers);
      }),
    } as unknown as Response;

    const controller = new BackupsController(mockService);
    const fileStream = await controller.downloadBackup(
      'fincore-2026-10-22-12-00-00.dump',
      mockUser,
      mockRes,
    );

    expect(fileStream).toBeInstanceOf(StreamableFile);
    expect(setHeaders['Content-Type']).toBe('application/octet-stream');
    expect(setHeaders['Content-Disposition']).toContain('attachment; filename="fincore-2026-10-22-12-00-00.dump"');
    expect(setHeaders['Content-Length']).toBe('16');
  });

  it('delegates delete to backupsService.deleteBackup', async () => {
    const mockService = {
      deleteBackup: vi.fn().mockResolvedValue({
        success: true,
        message: 'O‘chirildi',
      }),
    } as unknown as BackupsService;

    const controller = new BackupsController(mockService);
    const res = await controller.deleteBackup('fincore-2026-10-22-12-00-00.dump', mockUser);

    expect(res.success).toBe(true);
    expect(mockService.deleteBackup).toHaveBeenCalledWith(mockUser, 'fincore-2026-10-22-12-00-00.dump');
  });
});
