import { Injectable, Logger } from '@nestjs/common';
import { ApiException, type AuthenticatedUser, type RoleAssignment, type UserStatus } from '@/common';
import { toIsoDateTime, toMoneyUzs } from '@/common/serialization/financial';
import { PrismaService } from '@/database';
import { burnPasswordTiming, verifyPassword } from './password';

/** Phone numbers are entered with spaces, dashes and parentheses; storage may not have them. */
function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

const ACTIVE_ASSIGNMENT = { is_active: true, revoked_at: null } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifies credentials and returns the session projection. Every failure path
   * raises the same 401 family so the response never reveals which users exist.
   */
  async authenticate(login: string, password: string): Promise<AuthenticatedUser> {
    const identifier = login.trim();
    const phone = normalizePhone(identifier);
    const candidate = await this.prisma.db.users.findFirst({
      where: {
        OR: [{ phone: identifier }, { phone }, { email: identifier.toLowerCase() }],
      },
      select: { id: true, password_hash: true, status: true },
    });

    if (!candidate) {
      await burnPasswordTiming(password);
      throw ApiException.invalidCredentials();
    }
    if (!(await verifyPassword(password, candidate.password_hash)))
      throw ApiException.invalidCredentials();
    if (candidate.status !== 'active') throw ApiException.accountDisabled();

    await this.prisma.db.users.update({
      where: { id: candidate.id },
      data: { last_login_at: new Date() },
    });
    // Identify by opaque id only — never log the phone, email or password.
    this.logger.log(`Login muvaffaqiyatli: user ${candidate.id}`);

    return this.getAuthenticatedUser(candidate.id);
  }

  /**
   * Rebuilt on every request rather than cached in the cookie, so revoking a
   * role or disabling an account takes effect immediately.
   *
   * `requireActive` defaults to true because the session path must reject a
   * disabled account. The admin user list passes false: its whole purpose is to
   * show inactive and blocked people alongside active ones.
   */
  async getAuthenticatedUser(userId: string, requireActive = true): Promise<AuthenticatedUser> {
    const user = await this.prisma.db.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        full_name: true,
        phone: true,
        status: true,
        fixed_salary_uzs: true,
        last_login_at: true,
        user_roles: {
          where: ACTIVE_ASSIGNMENT,
          select: {
            id: true,
            branch_id: true,
            branch: { select: { name: true } },
            role: {
              select: {
                code: true,
                name: true,
                is_active: true,
                allows_all_branch_scope: true,
                role_permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) throw ApiException.unauthenticated();
    if (requireActive && user.status !== 'active') throw ApiException.accountDisabled();

    const assignments = user.user_roles.filter((item) => item.role.is_active);

    const roles: RoleAssignment[] = assignments.map((item) => ({
      id: item.id,
      role: item.role.code,
      roleName: item.role.name,
      branchId: item.branch_id,
      branchName: item.branch?.name ?? null,
    }));

    const permissions = [
      ...new Set(
        assignments.flatMap((item) => item.role.role_permissions.map((rp) => rp.permission.code)),
      ),
    ].sort();

    // Derivation follows the seed's own rule (002_seed_reference.sql, "Roles"):
    // a role granted with branch_id = NULL carries company-wide READ scope,
    // while write access only ever comes from a branch-scoped assignment.
    const scopedBranchIds = assignments
      .map((item) => item.branch_id)
      .filter((id): id is string => id !== null);
    const hasAllBranchRead = assignments.some((item) => item.role.allows_all_branch_scope);

    const readableBranchIds = hasAllBranchRead
      ? (
          await this.prisma.db.branches.findMany({
            where: { is_active: true },
            select: { id: true },
            orderBy: { code: 'asc' },
          })
        ).map((branch) => branch.id)
      : [];

    const branchScopes = [...new Set([...readableBranchIds, ...scopedBranchIds])];
    const writeBranchScopes = [...new Set(scopedBranchIds)];

    return {
      id: user.id,
      fullName: user.full_name,
      phone: user.phone ?? '',
      status: user.status as UserStatus,
      roles,
      permissions,
      branchScopes,
      writeBranchScopes,
      // PHASE 19 / DECISION 2 closed GAP-01: this is the real stored figure
      // from fincore.users.fixed_salary_uzs, no longer a placeholder.
      fixedSalaryUzs: toMoneyUzs(user.fixed_salary_uzs)!,
      lastLoginAt: toIsoDateTime(user.last_login_at),
    };
  }
}
