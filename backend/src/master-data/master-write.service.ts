import { Injectable } from '@nestjs/common';
import { ApiException, hasCompanyWideWrite, type AuthenticatedUser } from '@/common';
import { ActorContextService, PrismaService, type PrismaTransaction } from '@/database';
import type { MasterCreateDto, MasterUpdateDto } from '@/admin/dto/admin.dto';
import type { ExpenseCategoryDto, MasterItemDto } from './master-data.service';

/** The three resources the settings screens manage; anything else is a 404. */
export type MasterKind = 'categories' | 'departments' | 'payment-methods' | 'branches';

const KINDS: MasterKind[] = ['categories', 'departments', 'payment-methods', 'branches'];

@Injectable()
export class MasterWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async create(
    user: AuthenticatedUser,
    kind: string,
    input: MasterCreateDto,
  ): Promise<MasterItemDto | ExpenseCategoryDto> {
    const resource = this.requireKind(kind);
    // Codes are the stable business identifier, so they are normalised the way
    // the seed writes them and compared case-insensitively.
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();

    await this.assertCodeFree(resource, code);

    return this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        if (resource === 'categories') {
          const created = await tx.expense_categories.create({
            data: { code, name, expense_type: input.expenseType ?? 'variable' },
            select: { id: true, code: true, name: true, expense_type: true, is_active: true },
          });
          return {
            id: created.id,
            code: created.code,
            name: created.name,
            expenseType: created.expense_type,
            isActive: created.is_active,
            aliases: [],
          } satisfies ExpenseCategoryDto;
        }
        if (resource === 'departments') {
          const created = await tx.departments.create({
            data: { code, name },
            select: { id: true, code: true, name: true, is_active: true },
          });
          return this.toItem(created);
        }
        if (resource === 'payment-methods') {
          const created = await tx.payment_methods.create({
            data: { code, name },
            select: { id: true, code: true, name: true, is_active: true },
          });
          return this.toItem(created);
        }
        const created = await tx.branches.create({
          data: { code, name },
          select: { id: true, code: true, name: true, is_active: true },
        });
        await this.grantCreatorBranchScope(tx, user, created.id);
        return this.toItem(created);
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });
  }

  async update(
    user: AuthenticatedUser,
    kind: string,
    id: string,
    input: MasterUpdateDto,
  ): Promise<MasterItemDto | ExpenseCategoryDto> {
    const resource = this.requireKind(kind);
    // Code is intentionally immutable: expenses keep a code snapshot, and
    // rewriting it would silently detach historical rows from their category.
    const data: { name?: string; is_active?: boolean } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.isActive !== undefined) data.is_active = input.isActive;

    return this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        if (resource === 'categories') {
          const exists = await tx.expense_categories.count({ where: { id } });
          if (exists === 0) throw this.notFound();
          const updated = await tx.expense_categories.update({
            where: { id },
            data: {
              ...data,
              ...(input.expenseType !== undefined ? { expense_type: input.expenseType } : {}),
            },
            select: {
              id: true,
              code: true,
              name: true,
              expense_type: true,
              is_active: true,
              category_aliases: { select: { alias_text: true }, orderBy: { alias_text: 'asc' } },
            },
          });
          return {
            id: updated.id,
            code: updated.code,
            name: updated.name,
            expenseType: updated.expense_type,
            isActive: updated.is_active,
            aliases: updated.category_aliases.map((alias) => alias.alias_text),
          } satisfies ExpenseCategoryDto;
        }
        if (resource === 'departments') {
          const exists = await tx.departments.count({ where: { id } });
          if (exists === 0) throw this.notFound();
          return this.toItem(
            await tx.departments.update({
              where: { id },
              data,
              select: { id: true, code: true, name: true, is_active: true },
            }),
          );
        }
        if (resource === 'payment-methods') {
          const exists = await tx.payment_methods.count({ where: { id } });
          if (exists === 0) throw this.notFound();
          return this.toItem(
            await tx.payment_methods.update({
              where: { id },
              data,
              select: { id: true, code: true, name: true, is_active: true },
            }),
          );
        }
        const exists = await tx.branches.count({ where: { id } });
        if (exists === 0) throw this.notFound();
        return this.toItem(
          await tx.branches.update({
            where: { id },
            data,
            select: { id: true, code: true, name: true, is_active: true },
          }),
        );
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });
  }

  // -------------------------------------------------------------------------

  private requireKind(kind: string): MasterKind {
    if (!KINDS.includes(kind as MasterKind))
      throw new ApiException(404, 'MASTER_KIND_NOT_FOUND', 'Master data turi topilmadi.');
    return kind as MasterKind;
  }

  /**
   * Keeps the creator on the branch they just made. A branch nobody can post
   * to is a dead end, so the new branch is granted back on the same role that
   * authorised this write, in the creation transaction — the grant is rolled
   * back with the branch if anything downstream fails.
   *
   * Read scope needs no help: every all-branch role already reads the live
   * branch list, so only the enumerated write scope has a hole to fill. A
   * director assigned company-wide (branch_id NULL) writes by the same policy
   * and is skipped for the same reason.
   */
  private async grantCreatorBranchScope(
    tx: PrismaTransaction,
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    if (hasCompanyWideWrite(user)) return;

    // Granting back the permission that got the caller here — rather than
    // every role they hold — keeps this from quietly widening access: the
    // creator gains one branch, never a role they did not already have.
    const [grant] = await tx.user_roles.findMany({
      where: {
        user_id: user.id,
        is_active: true,
        revoked_at: null,
        role: {
          is_active: true,
          role_permissions: { some: { permission: { code: 'master_data.manage' } } },
        },
      },
      select: { role_id: true },
      distinct: ['role_id'],
      // Deterministic on a multi-role account, so a repeat run picks the same one.
      orderBy: { role: { code: 'asc' } },
    });
    // Permission reached the caller some other way (a direct grant, a future
    // service account); there is no role to widen, so nothing is written.
    if (!grant) return;

    await tx.user_roles.create({
      data: {
        user_id: user.id,
        role_id: grant.role_id,
        branch_id: branchId,
        granted_by: user.id,
      },
    });
  }

  private notFound(): ApiException {
    return new ApiException(404, 'MASTER_ITEM_NOT_FOUND', 'Master data elementi topilmadi.');
  }

  private async assertCodeFree(resource: MasterKind, code: string): Promise<void> {
    const taken =
      resource === 'categories'
        ? await this.prisma.db.expense_categories.count({ where: { code } })
        : resource === 'departments'
          ? await this.prisma.db.departments.count({ where: { code } })
          : resource === 'payment-methods'
            ? await this.prisma.db.payment_methods.count({ where: { code } })
            : await this.prisma.db.branches.count({ where: { code } });
    if (taken > 0)
      throw new ApiException(409, 'DUPLICATE_REFERENCE', 'Bu master-data kodi allaqachon mavjud.');
  }

  private toItem(row: {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
  }): MasterItemDto {
    return { id: row.id, code: row.code, name: row.name, isActive: row.is_active };
  }

  private translateWriteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/Unique constraint|duplicate key/i.test(message))
      return new ApiException(409, 'DUPLICATE_REFERENCE', 'Bu master-data kodi allaqachon mavjud.');
    if (/Record to update not found|No record was found/i.test(message)) return this.notFound();
    if (/actor context|signing key/i.test(message))
      return new ApiException(500, 'ACTOR_CONTEXT_INVALID', 'Server identifikatsiya konteksti noto‘g‘ri.');
    return error;
  }
}
