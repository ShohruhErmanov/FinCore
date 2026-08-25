import { Injectable } from '@nestjs/common';
import { AuthService, hashPassword, SessionService } from '@/auth';
import { ApiException, type AuthenticatedUser } from '@/common';
import { ActorContextService, PrismaService, type PrismaTransaction } from '@/database';
import type { UserAccessDto, UserCreateDto, UserSalaryDto, UserStatusDto } from './dto/admin.dto';

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
const MAX_UZS = 9_223_372_036_854_775_807n;

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
    private readonly sessions: SessionService,
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

    // Checked server-side too: the browser can be bypassed, and a mismatch here
    // would silently give the new account a password nobody knows.
    if (input.password !== input.confirmPassword)
      throw new ApiException(422, 'PASSWORD_MISMATCH', 'Parol va tasdiqlash mos emas.');

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
    // Same helper the login path verifies against, so a freshly created account
    // can sign in immediately with phone + password.
    const password_hash = await hashPassword(input.password);

    const created = await this.prisma
      .withActor(this.actor.mint(actor.id), async (tx) => {
        const user = await tx.users.create({
          data: {
            full_name: input.fullName.trim(),
            phone,
            email: null,
            password_hash,
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
    const targetIsDirector = target.roles.some(
      (role) => role.code === 'director' && role.is_active,
    );
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
        if (targetIsDirector && !roleCodes.includes('director') && target.status === 'active')
          await this.assertNotLastActiveDirector(tx, userId);

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
    if (actor.id === userId && input.status !== 'active')
      throw new ApiException(
        409,
        'SELF_DEACTIVATION_DENIED',
        'Foydalanuvchi o‘z hisobini nofaol yoki bloklangan holatga o‘tkaza olmaydi.',
      );
    const targetIsDirector = target.roles.some(
      (role) => role.code === 'director' && role.is_active,
    );
    if (targetIsDirector && !this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor statusini faqat direktor boshqarishi mumkin.',
      );
    await this.prisma
      .withActor(this.actor.mint(actor.id), async (tx) => {
        if (targetIsDirector && target.status === 'active' && input.status !== 'active')
          await this.assertNotLastActiveDirector(tx, userId);

        return tx.users.update({ where: { id: userId }, data: { status: input.status } });
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.auth.getAuthenticatedUser(userId, false);
  }

  async deleteUser(actor: AuthenticatedUser, userId: string): Promise<void> {
    if (actor.id === userId)
      throw new ApiException(
        409,
        'SELF_DELETE_DENIED',
        'Foydalanuvchi o‘z hisobini butunlay o‘chira olmaydi.',
      );
    // Dedicated permission remains the controller guard; this role invariant
    // is defense-in-depth against a stale/manual non-Director permission grant.
    if (!this.hasRole(actor, 'director'))
      throw new ApiException(
        403,
        'PERMISSION_DENIED',
        'Foydalanuvchini faqat Direktor butunlay o‘chirishi mumkin.',
      );

    await this.prisma
      .withActor(this.actor.mint(actor.id), async (tx) => {
        // Keep target state, Director lifecycle decision and DELETE in one
        // serialized transaction. The row lock also prevents status/is_system
        // from changing between authorization and physical deletion.
        await this.lockDirectorLifecycle(tx);
        const targets = await tx.$queryRaw<
          Array<{ status: string; is_system: boolean; is_director: boolean }>
        >`
          SELECT
            u.status::text AS status,
            u.is_system,
            EXISTS (
              SELECT 1
              FROM fincore.user_roles ur
              JOIN fincore.roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id
                AND ur.is_active
                AND ur.revoked_at IS NULL
                AND r.code = 'director'
                AND r.is_active
            ) AS is_director
          FROM fincore.users u
          WHERE u.id = ${userId}::uuid
          FOR UPDATE OF u
        `;
        const target = targets[0];
        if (!target)
          throw new ApiException(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
        if (target.is_system)
          throw new ApiException(
            409,
            'SYSTEM_USER_DELETE_DENIED',
            'Rezerv tizim aktori servis audit identifikatori bo‘lgani uchun o‘chirib bo‘lmaydi.',
          );
        if (target.is_director && target.status === 'active')
          await this.assertNotLastActiveDirector(tx, userId, true);

        // PHASE 36 migration 009 keeps every historical actor UUID in the
        // durable user_identities table. Only user_roles is disposable and its
        // FK cascades from this account row; no financial/history row cascades.
        await tx.users.delete({ where: { id: userId } });
      })
      .catch((error: unknown) => {
        throw this.translateDeleteError(error);
      });

    // Sessions are process-local, not database dependants. Revoke them only
    // after the database transaction has committed successfully.
    this.sessions.destroyAllForUser(userId);
  }

  /**
   * PHASE 19 / DECISION 2: fixed salary lives on fincore.users, one current
   * value per user. The column is a uzs_amount_nonnegative domain, so a
   * negative figure is refused by the database as well as by the DTO.
   */
  async updateSalary(
    actor: AuthenticatedUser,
    userId: string,
    input: UserSalaryDto,
  ): Promise<AuthenticatedUser> {
    await this.requireUser(userId);
    if (!/^\d+$/.test(input.fixedSalaryUzs) || BigInt(input.fixedSalaryUzs) > MAX_UZS)
      throw new ApiException(
        422,
        'AMOUNT_INVALID',
        'Oylik manfiy bo‘lmagan va BIGINT chegarasidagi butun so‘m bo‘lishi kerak.',
      );
    const fixedSalaryUzs = BigInt(input.fixedSalaryUzs);

    await this.prisma
      .withActor(this.actor.mint(actor.id), (tx) =>
        tx.users.update({
          where: { id: userId },
          data: { fixed_salary_uzs: fixedSalaryUzs },
        }),
      )
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    // requireActive=false: an admin may set the salary of a blocked employee.
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
        is_system: true,
        user_roles: {
          where: ACTIVE,
          select: { role: { select: { code: true, is_active: true } } },
        },
      },
    });
    if (!user) throw new ApiException(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    return { ...user, roles: user.user_roles.map((assignment) => assignment.role) };
  }

  private async assertNotLastActiveDirector(
    tx: PrismaTransaction,
    userId: string,
    lifecycleLockHeld = false,
  ): Promise<void> {
    // Serialize every operation that can remove an active Director. Keeping the
    // lock, replacement count and mutation in one transaction prevents two
    // concurrent requests from both observing a replacement and leaving none.
    if (!lifecycleLockHeld) await this.lockDirectorLifecycle(tx);
    const others = await tx.users.count({
      where: {
        id: { not: userId },
        status: 'active',
        user_roles: { some: { ...ACTIVE, role: { code: 'director', is_active: true } } },
      },
    });
    if (others === 0)
      throw new ApiException(
        409,
        'LAST_DIRECTOR_REQUIRED',
        'Oxirgi faol direktor bloklanmaydi yoki nofaol qilinmaydi.',
      );
  }

  private async lockDirectorLifecycle(tx: PrismaTransaction): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended('admin:active-director-lifecycle', 0)
      )
    `;
  }

  private userDeleteNotAllowed(dependencyCategories: string[]): ApiException {
    return new ApiException(
      409,
      'USER_DELETE_NOT_ALLOWED',
      'Foydalanuvchi o‘chirilmadi: boshqarilmagan tashqi kalit xavfsizlik cheklovi mavjud.',
      { dependencyCategories },
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
    if (/bigint.*range|out of range/i.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Oylik ruxsat etilgan chegaradan oshdi.');
    return error;
  }

  private translateDeleteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'P2025' || /record.*not found|no record was found for a delete/i.test(message))
      return new ApiException(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    if (code === 'P2003' || code === '23503' || /foreign key constraint/i.test(message))
      return this.userDeleteNotAllowed(['protected_history']);
    return this.translateWriteError(error);
  }
}
