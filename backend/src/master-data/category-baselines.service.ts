import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toMoneyUzs } from '@/common/serialization/financial';
import { ActorContextService, PrismaService } from '@/database';

/** One branch column of the settings grid. */
export interface BaselineBranchDto {
  branchId: string;
  code: string;
  name: string;
}

export interface BaselineRowDto {
  categoryId: string;
  code: string;
  name: string;
  expenseType: 'fixed' | 'variable';
  isActive: boolean;
  /** branchId → butun so'm string. Every active branch always has an entry. */
  amounts: Record<string, string>;
  /** Sum of this category's branch amounts — computed, never stored. */
  totalUzs: string;
}

export interface CategoryBaselineBoardDto {
  branches: BaselineBranchDto[];
  rows: BaselineRowDto[];
  totals: {
    /** branchId → column total. */
    byBranch: Record<string, string>;
    /** «Jami oylik reja (byudjet)» — the grand total of every cell. */
    grandTotalUzs: string;
  };
}

export interface BaselineLineInput {
  categoryId: string;
  branchId: string;
  amountUzs: string;
}

/**
 * The director's own baseline plan per (category × branch) — the
 * «Boshlang'ich Sayxun / Xalqlar do'stligi / jami» columns of the Excel
 * «Sozlamalar» sheet.
 *
 * Deliberately separate from fincore.budget_lines: that table stays the single
 * figure every report reads. This one is the director's reference grid, edited
 * in Settings, where both the per-row total and the column totals are computed
 * on read rather than stored.
 */
@Injectable()
export class CategoryBaselinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {}

  async board(): Promise<CategoryBaselineBoardDto> {
    const [branches, categories, cells] = await Promise.all([
      this.prisma.db.branches.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.db.expense_categories.findMany({
        select: { id: true, code: true, name: true, expense_type: true, is_active: true, sort_order: true },
        // Fixed block first, then variable — the same two-block layout the
        // Excel sheet uses (rows 4-15 vs 16-33).
        orderBy: [{ expense_type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.db.expense_category_baselines.findMany({
        select: { category_id: true, branch_id: true, amount_uzs: true },
      }),
    ]);

    const byCell = new Map(
      cells.map((cell) => [`${cell.category_id}:${cell.branch_id}`, cell.amount_uzs] as const),
    );
    const columnTotals = new Map<string, bigint>(branches.map((branch) => [branch.id, 0n]));
    let grandTotal = 0n;

    const rows: BaselineRowDto[] = categories.map((category) => {
      const amounts: Record<string, string> = {};
      let rowTotal = 0n;
      for (const branch of branches) {
        const amount = byCell.get(`${category.id}:${branch.id}`) ?? 0n;
        amounts[branch.id] = toMoneyUzs(amount)!;
        rowTotal += amount;
        columnTotals.set(branch.id, (columnTotals.get(branch.id) ?? 0n) + amount);
      }
      grandTotal += rowTotal;
      return {
        categoryId: category.id,
        code: category.code,
        name: category.name,
        expenseType: category.expense_type as 'fixed' | 'variable',
        isActive: category.is_active,
        amounts,
        totalUzs: toMoneyUzs(rowTotal)!,
      };
    });

    return {
      branches: branches.map((branch) => ({ branchId: branch.id, code: branch.code, name: branch.name })),
      rows,
      totals: {
        byBranch: Object.fromEntries(
          [...columnTotals].map(([branchId, total]) => [branchId, toMoneyUzs(total)!]),
        ),
        grandTotalUzs: toMoneyUzs(grandTotal)!,
      },
    };
  }

  /**
   * Replaces the cells the caller sent. A cell set to 0 is stored as 0 rather
   * than deleted, so «0 so'm rejalashtirilgan» stays distinguishable from
   * «hali kiritilmagan» in a later reading of the table.
   */
  async save(user: AuthenticatedUser, lines: BaselineLineInput[]): Promise<CategoryBaselineBoardDto> {
    if (lines.length === 0) return this.board();

    const [categories, branches] = await Promise.all([
      this.prisma.db.expense_categories.findMany({ select: { id: true } }),
      this.prisma.db.branches.findMany({ where: { is_active: true }, select: { id: true } }),
    ]);
    const knownCategories = new Set(categories.map((row) => row.id));
    const knownBranches = new Set(branches.map((row) => row.id));

    const seen = new Set<string>();
    for (const line of lines) {
      if (!knownCategories.has(line.categoryId) || !knownBranches.has(line.branchId))
        throw new ApiException(422, 'REFERENCE_INVALID', 'Kategoriya yoki filial topilmadi.');
      if (!/^\d+$/.test(line.amountUzs))
        throw new ApiException(
          422,
          'AMOUNT_INVALID',
          'Summa manfiy bo‘lmagan butun so‘mda bo‘lishi kerak.',
        );
      // The same cell twice in one payload would make the result order-dependent.
      const key = `${line.categoryId}:${line.branchId}`;
      if (seen.has(key))
        throw new ApiException(409, 'DUPLICATE_CELL', 'Bitta katak ikki marta yuborilgan.');
      seen.add(key);
    }

    await this.prisma
      .withActor(this.actor.mint(user.id), async (tx) => {
        for (const line of lines)
          await tx.$executeRaw`
            INSERT INTO fincore.expense_category_baselines (category_id, branch_id, amount_uzs, updated_by)
            VALUES (${line.categoryId}::uuid, ${line.branchId}::uuid, ${BigInt(line.amountUzs)}, ${user.id}::uuid)
            ON CONFLICT (category_id, branch_id) DO UPDATE
              SET amount_uzs = EXCLUDED.amount_uzs,
                  updated_by = EXCLUDED.updated_by,
                  updated_at = now()
          `;
      })
      .catch((error: unknown) => {
        throw this.translateWriteError(error);
      });

    return this.board();
  }

  private translateWriteError(error: unknown): unknown {
    if (error instanceof ApiException) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (/uzs_amount_nonnegative|violates check/i.test(message))
      return new ApiException(422, 'AMOUNT_INVALID', 'Summa manfiy bo‘lishi mumkin emas.');
    if (/foreign key|violates/i.test(message))
      return new ApiException(422, 'REFERENCE_INVALID', 'Kategoriya yoki filial topilmadi.');
    if (/actor context|signing key/i.test(message))
      return new ApiException(
        500,
        'ACTOR_CONTEXT_INVALID',
        'Server identifikatsiya konteksti noto‘g‘ri.',
      );
    return error;
  }
}
