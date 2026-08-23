import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { ActorContextService, PrismaService } from '@/database';

/** Record<RoleCode, PermissionCode[]> — src/shared/types/domain.ts:75. */
export type RolePermissionMatrix = Record<string, string[]>;

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async matrix(): Promise<RolePermissionMatrix> {
    const roles = await this.prisma.db.roles.findMany({
      where: { is_active: true },
      select: {
        code: true,
        role_permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { code: 'asc' },
    });
    return Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.role_permissions.map((link) => link.permission.code).sort(),
      ]),
    );
  }

  /**
   * Replaces one role's permission set. Only a sitting director may do this —
   * otherwise a role holder could grant themselves any capability.
   */
  async replacePermissions(
    actor: AuthenticatedUser,
    roleCode: string,
    permissionCodes: string[],
  ): Promise<{ role: string; permissions: string[] }> {
    if (!actor.roles.some((assignment) => assignment.role === 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Rol ruxsatlarini faqat amaldagi direktor o‘zgartirishi mumkin.',
      );

    const role = await this.prisma.db.roles.findUnique({
      where: { code: roleCode },
      select: { id: true, code: true },
    });
    if (!role) throw new ApiException(404, 'ROLE_NOT_FOUND', 'Rol topilmadi.');

    const wanted = [...new Set(permissionCodes)];
    const permissions = await this.prisma.db.permissions.findMany({
      where: { code: { in: wanted } },
      select: { id: true, code: true },
    });
    // A code with no row cannot be stored (role_permissions carries an FK), so
    // it is rejected rather than silently dropped.
    const unknown = wanted.filter((code) => !permissions.some((row) => row.code === code));
    if (unknown.length > 0)
      throw new ApiException(422, 'PERMISSION_UNKNOWN', 'Noma’lum ruxsat kodi.', {
        unknownPermissions: unknown,
      });

    await this.prisma.withActor(this.actor.mint(actor.id), async (tx) => {
      await tx.role_permissions.deleteMany({ where: { role_id: role.id } });
      if (permissions.length > 0)
        await tx.role_permissions.createMany({
          data: permissions.map((permission) => ({
            role_id: role.id,
            permission_id: permission.id,
          })),
        });
    });

    return { role: role.code, permissions: wanted.sort() };
  }
}
