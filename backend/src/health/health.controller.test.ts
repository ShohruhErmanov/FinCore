import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@/config';
import type { PrismaService } from '@/database';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('never exposes internal database diagnostics on the public endpoint', async () => {
    const prisma = {
      ping: async () => false,
      status: 'CONNECTION_FAILED',
      statusDetail: "Can't reach database server at internal-db:5432",
    } as unknown as PrismaService;
    const controller = new HealthController(prisma, { NODE_ENV: 'production' } as AppEnv);

    const response = await controller.check();

    expect(response.status).toBe('degraded');
    expect(response.database).toEqual({ status: 'CONNECTION_FAILED', detail: null });
    expect(JSON.stringify(response)).not.toContain('internal-db');
  });
});
