import { Injectable } from '@nestjs/common';
import { AuthService } from '@/auth';
import { ApiException, type AuthenticatedUser } from '@/common';
import { ActorContextService, PrismaService } from '@/database';
import type { UserAccessDto, UserCreateDto, UserStatusDto } from './dto/admin.dto';

/** Mirrors the frontend UserDirectoryItem (src/shared/types/domain.ts:77). */
export interface UserDirectoryItemDto {
  id: string;
  fullName: string;
  status: 'active' | 'inactive' | 'blocked';
  roles: Array<{
    id: string;
    role: string;
    roleName: string;
    branchId: string | null;
    branchName: string | null;
  }>;
}

const ACTIVE = { is_active: true, revoked_at: null } as const;

/** Same normalisation AuthService uses, so a duplicate is caught in any format. */
function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Everyone may read the directory, but only the names they have a reason to
   * see: a company-wide reader sees all, a branch-scoped user sees themselves
   * plus colleagues assigned to a branch they can read. Mirrors the mock.
   */
  async directory(user: AuthenticatedUser): Promise<UserDirectoryItemDto[]> {
    const branchCount = await this.prisma.db.branches.count({ where: { is_active: true } });
    const hasCenterRead = user.branchScopes.length >= branchCount && branchCount > 0;

    const rows = await this.prisma.db.users.findMany({
      where: hasCenterRead
        ? {}
        : {
            OR: [
              { id: user.id },
              { user_roles: { some: { ...ACTIVE, branch_id: { in: user.branchScopes } } } },
            ],
          },
      select: this.directorySelect(),
      orderBy: { full_name: 'asc' },
    });
    return rows.map((row) => this.toDirectoryItem(row));
  }

  /** Full projections for the admin screen — same shape as GET /api/me. */
  async list(): Promise<AuthenticatedUser[]> {
    const ids = await this.prisma.db.users.findMany({
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    return Promise.all(ids.map((row) => this.auth.getAuthenticatedUser(row.id, false)));
  }

  async create(actor: AuthenticatedUser, input: UserCreateDto): Promise<AuthenticatedUser> {
    if (input.role === 'director' && !this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );

    const phone = normalizePhone(input.phone.trim());
    const digits = phone.replace(/\D/g, '');
    // Compared digits-only so "+998 90 …" and "+99890…" collide, which the
    // approved schema's plain UNIQUE(phone) index cannot express on its own.
    const stored = await this.prisma.db.users.findMany({
      where: { phone: { not: null } },
      select: { phone: true },
    });
    if (stored.some((row) => (row.phone ?? '').replace(/\D/g, '') === digits))
      throw new ApiException(409, 'DUPLICATE_REFERENCE', 'Bu telefon raqam allaqachon mavjud.');

    // A cashier is meaningless without a branch; other roles may carry one as a
    // secondary cashier scope (the "Madina" pattern from the requirements).
    const scopeBranchId = input.role === 'cashier' ? input.branchId : input.cashierBranchId;
    const branch = scopeBranchId
      ? await this.prisma.db.branches.findFirst({
          where: { id: scopeBranchId, is_active: true },
          select: { id: true },
        })
      : null;
    if (input.role === 'cashier' && !branch)
      throw new ApiException(422, 'BRANCH_REQUIRED', 'Kassir uchun filial scope majburiy.');
    if (scopeBranchId && !branch)
      throw new ApiException(422, 'BRANCH_INVALID', 'Kassir filial scope’i topilmadi.');

    const grants: Array<{ role: string; branchId: string | null }> = [
      { role: input.role, branchId: input.role === 'cashier' ? branch!.id : null },
    ];
    if (input.role === 'finance_manager' && branch)
      grants.push({ role: 'cashier', branchId: branch.id });

    const roleIds = await this.resolveRoleIds(grants.map((grant) => grant.role));

    const created = await this.prisma
      .withActor(this.actor.mint(actor.id), async (tx) => {
        const user = await tx.users.create({
          data: {
            full_name: input.fullName.trim(),
            phone,
            email: null,
            // The frontend never collects a password, and the contract has no
            // endpoint to set one, so the account ships unusable — exactly the
            // convention 002_seed_reference.sql uses for its system account.
            // A password is issued separately via `npm run bootstrap:users`.
            password_hash: '!disabled!',
            status: 'active',
            is_system: false,
          },
          select: { id: true },
        });
        for (const grant of grants)
          await tx.user_roles.create({
            data: {
              user_id: user.id,
              role_id: roleIds.get(grant.role)!,
              branch_id: grant.branchId,
              granted_by: actor.id,
            },
            select: { id: true },
          });
        return user.id;
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.auth.getAuthenticatedUser(created, false);
  }

  async updateAccess(
    actor: AuthenticatedUser,
    userId: string,
    input: UserAccessDto,
  ): Promise<AuthenticatedUser> {
    const target = await this.requireUser(userId);
    const targetIsDirector = target.roles.some((role) => role.code === 'director');
    if (targetIsDirector && !this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor accessini faqat direktor boshqarishi mumkin.',
      );

    const roleCodes = input.roles.map((assignment) => assignment.role);
    if (roleCodes.length === 0)
      throw new ApiException(422, 'ROLE_REQUIRED', 'Kamida bitta rol biriktirilishi kerak.');
    if (new Set(roleCodes).size !== roleCodes.length)
      throw new ApiException(409, 'DUPLICATE_ROLE', 'Bitta rol takroran biriktirilmaydi.');
    if (roleCodes.includes('director') && roleCodes.length > 1)
      throw new ApiException(422, 'ROLE_COMBINATION_INVALID', 'Direktor roli alohida access modeli.');
    if (roleCodes.includes('director') && !this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );

    // Removing the last active director would lock the whole organisation out
    // of user and role administration.
    if (targetIsDirector && !roleCodes.includes('director') && target.status === 'active')
      await this.assertNotLastActiveDirector(userId);

    for (const assignment of input.roles) {
      if (assignment.role === 'cashier' && !assignment.branchId)
        throw new ApiException(422, 'BRANCH_REQUIRED', 'Kassir uchun filial scope majburiy.');
      if (assignment.branchId) {
        const branch = await this.prisma.db.branches.count({
          where: { id: assignment.branchId, is_active: true },
        });
        if (branch === 0)
          throw new ApiException(422, 'BRANCH_INVALID', 'Filial topilmadi yoki faol emas.');
      }
    }

    const roleIds = await this.resolveRoleIds(roleCodes);

    await this.prisma
      .withActor(this.actor.mint(actor.id), async (tx) => {
        // Grants are revoked, never deleted: user_roles is an audit trail.
        await tx.user_roles.updateMany({
          where: { user_id: userId, ...ACTIVE },
          data: { is_active: false, revoked_at: new Date(), revoked_by: actor.id },
        });
        for (const assignment of input.roles)
          await tx.user_roles.create({
            data: {
              user_id: userId,
              role_id: roleIds.get(assignment.role)!,
              branch_id: assignment.role === 'cashier' ? (assignment.branchId ?? null) : null,
              granted_by: actor.id,
            },
            select: { id: true },
          });
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.auth.getAuthenticatedUser(userId, false);
  }

  async updateStatus(
    actor: AuthenticatedUser,
    userId: string,
    input: UserStatusDto,
  ): Promise<AuthenticatedUser> {
    const target = await this.requireUser(userId);
    const targetIsDirector = target.roles.some((role) => role.code === 'director');
    if (targetIsDirector && !this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor statusini faqat direktor boshqarishi mumkin.',
      );
    if (targetIsDirector && target.status === 'active' && input.status !== 'active')
      await this.assertNotLastActiveDirector(userId);

    await this.prisma
      .withActor(this.actor.mint(actor.id), (tx) =>
        tx.users.update({ where: { id: userId }, data: { status: input.status } }),
      )
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.auth.getAuthenticatedUser(userId, false);
  }

  // -------------------------------------------------------------------------

  private directorySelect() {
    return {
      id: true,
      full_name: true,
      status: true,
      user_roles: {
        where: ACTIVE,
        select: {
          id: true,
          branch_id: true,
          branch: { select: { name: true } },
          role: { select: { code: true, name: true, is_active: true } },
        },
      },
    } as const;
  }

  private toDirectoryItem(row: {
    id: string;
    full_name: string;
    status: string;
    user_roles: Array<{
      id: string;
      branch_id: string | null;
      branch: { name: string } | null;
      role: { code: string; name: string; is_active: boolean };
    }>;
  }): UserDirectoryItemDto {
    return {
      id: row.id,
      fullName: row.full_name,
      status: row.status as 'active' | 'inactive' | 'blocked',
      roles: row.user_roles
        .filter((assignment) => assignment.role.is_active)
        .map((assignment) => ({
          id: assignment.id,
          role: assignment.role.code,
          roleName: assignment.role.name,
          branchId: assignment.branch_id,
          branchName: assignment.branch?.name ?? null,
        })),
    };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.db.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        user_roles: { where: ACTIVE, select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new ApiException(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    return { ...user, roles: user.user_roles.map((assignment) => assignment.role) };
  }

  private async assertNotLastActiveDirector(userId: string): Promise<void> {
    const others = await this.prisma.db.users.count({
      where: {
        id: { not: userId },
        status: 'active',
        user_roles: { some: { ...ACTIVE, role: { code: 'director' } } },
      },
    });
    if (others === 0)
      throw new ApiException(
        409,
        'LAST_DIRECTOR_REQUIRED',
        'Oxirgi faol direktor bloklanmaydi yoki nofaol qilinmaydi.',
      );
  }

  private hasRole(user: AuthenticatedUser, code: string): boolean {
    return user.roles.some((assignment) => assignment.role === code);
  }

  private async resolveRoleIds(codes: string[]): Promise<Map<string, string>> {
    const roles = await this.prisma.db.roles.findMany({
      where: { code: { in: [...new Set(codes)] }, is_active: true },
      select: { id: true, code: true },
    });
    const map = new Map(roles.map((role) => [role.code, role.id] as const));
    for (const code of codes)
      if (!map.has(code)) throw new ApiException(404, 'ROLE_NOT_FOUND', `'${code}' roli topilmadi.`);
    return map;
  }

  private translateWriteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/may not be granted with an all-branch/i.test(message))
      return new ApiException(422, 'BRANCH_REQUIRED', 'Bu rol uchun filial scope majburiy.');
    if (/Unique constraint|duplicate key/i.test(message))
      return new ApiException(409, 'DUPLICATE_REFERENCE', 'Bu qiymat allaqachon mavjud.');
    if (/actor context|signing key/i.test(message))
      return new ApiException(500, 'ACTOR_CONTEXT_INVALID', 'Server identifikatsiya konteksti noto‘g‘ri.');
    return error;
  }
}
