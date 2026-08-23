import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common';
import { APP_ENV, type AppEnv } from '@/config';
import { PrismaService, type DatabaseStatus } from '@/database';

interface HealthResponse {
  status: 'ok' | 'degraded';
  environment: string;
  uptimeSeconds: number;
  database: { status: DatabaseStatus; detail: string | null };
  checkedAt: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * Reports database reachability without ever failing the request itself —
   * a monitor needs to distinguish "API down" from "API up, database down".
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness va database ulanish holati' })
  async check(): Promise<HealthResponse> {
    const reachable = await this.prisma.ping();
    const status = this.prisma.status;
    return {
      status: status === 'CONNECTED' && reachable ? 'ok' : 'degraded',
      environment: this.env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      database: { status, detail: this.prisma.statusDetail },
      checkedAt: new Date().toISOString(),
    };
  }
}
