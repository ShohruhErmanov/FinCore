import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toIsoDateTime } from '@/common/serialization/financial';
import { PrismaService } from '@/database';

interface AuditRow {
  id: bigint;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  result: 'success' | 'failure' | 'denied';
  branch_name: string | null;
  occurred_at: Date;
}

export interface AuditLogDto {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  result: 'success' | 'failure' | 'denied';
  branchName: string | null;
  occurredAt: string;
}

export interface AuditLogPageDto {
  data: AuditLogDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, pageSize: number, action?: string): Promise<AuditLogPageDto> {
    const needle = action?.trim() || null;
    const where = needle ? Prisma.sql`WHERE al.action ILIKE ${`%${needle}%`}` : Prisma.empty;
    const offset = (page - 1) * pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.db.$queryRaw<AuditRow[]>(Prisma.sql`
        SELECT
          al.id,
          fincore.fn_user_identity_name(al.actor_user_id) AS actor_name,
          al.action,
          al.entity_type,
          al.entity_id,
          al.result::text AS result,
          b.name AS branch_name,
          al.occurred_at
        FROM fincore.audit_logs al
        LEFT JOIN fincore.branches b ON b.id = al.branch_id
        ${where}
        ORDER BY al.occurred_at DESC, al.id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS total
        FROM fincore.audit_logs al
        ${where}
      `),
    ]);

    const total = Number(totals[0]?.total ?? 0n);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        actorName: row.actor_name,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        result: row.result,
        branchName: row.branch_name,
        occurredAt: toIsoDateTime(row.occurred_at)!,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
