import { Injectable } from '@nestjs/common';
import { toIsoDateTime } from '@/common/serialization/financial';
import { PrismaService } from '@/database';

/**
 * Read-only reference data. Shapes mirror the frontend types in
 * src/shared/types/domain.ts exactly — Branch, AccountingPeriod,
 * ExpenseCategory and MasterItem — so no client-side mapping is needed.
 */

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface MasterItemDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ExpenseCategoryDto extends MasterItemDto {
  expenseType: 'fixed' | 'variable';
  aliases: string[];
}

export interface AccountingPeriodDto {
  id: string;
  year: number;
  month: number;
  label: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  closedByName: string | null;
}

/** Label format is set by the frontend fixture: "Avgust 2026". */
const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

function periodLabel(year: number, month: number): string {
  return `${MONTHS_UZ[month - 1] ?? String(month)} ${year}`;
}

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Only the branches the caller may read. Mirrors the mock backend, which
   * filters the list rather than returning every branch to every user.
   */
  /** Every branch, scope ignored — the Settings master-data screen manages the list itself. */
  async allBranches(): Promise<BranchDto[]> {
    const rows = await this.prisma.db.branches.findMany({
      select: { id: true, code: true, name: true, is_active: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active }));
  }

  async branches(branchScopes: string[]): Promise<BranchDto[]> {
    if (branchScopes.length === 0) return [];
    const rows = await this.prisma.db.branches.findMany({
      where: { id: { in: branchScopes } },
      select: { id: true, code: true, name: true, is_active: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    }));
  }

  async departments(): Promise<MasterItemDto[]> {
    const rows = await this.prisma.db.departments.findMany({
      select: { id: true, code: true, name: true, is_active: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    }));
  }

  async paymentMethods(): Promise<MasterItemDto[]> {
    const rows = await this.prisma.db.payment_methods.findMany({
      select: { id: true, code: true, name: true, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    }));
  }

  async expenseCategories(): Promise<ExpenseCategoryDto[]> {
    const rows = await this.prisma.db.expense_categories.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        expense_type: true,
        is_active: true,
        category_aliases: { select: { alias_text: true }, orderBy: { alias_text: 'asc' } },
      },
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      expenseType: row.expense_type,
      isActive: row.is_active,
      aliases: row.category_aliases.map((alias) => alias.alias_text),
    }));
  }

  async periods(): Promise<AccountingPeriodDto[]> {
    const rows = await this.prisma.db.accounting_periods.findMany({
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        closed_at: true,
        closed_by: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    // Resolved separately: accounting_periods.closed_by has no Prisma relation
    // to users, and adding one would mean touching the auth models.
    const closerIds = [...new Set(rows.map((row) => row.closed_by).filter((id): id is string => id !== null))];
    const closers = new Map(
      closerIds.length === 0
        ? []
        : (
            await this.prisma.db.users.findMany({
              where: { id: { in: closerIds } },
              select: { id: true, full_name: true },
            })
          ).map((user) => [user.id, user.full_name] as const),
    );

    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      month: row.month,
      label: periodLabel(row.year, row.month),
      status: row.status,
      closedAt: toIsoDateTime(row.closed_at),
      closedByName: row.closed_by ? (closers.get(row.closed_by) ?? null) : null,
    }));
  }
}
