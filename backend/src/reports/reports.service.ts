import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@/common';
import { PrismaService } from '@/database';
import { MONTHS_SHORT_UZ, MONTHS_UZ, planActual, toBigInt, type PlanActual } from './report-math';

/**
 * Report numbers come from the sanctioned views in
 * docs/database/003_report_and_reconciliation_queries.sql. Nothing here
 * re-derives a formula; this service reshapes view rows into the DTOs the
 * frontend types already declare.
 */

interface HistoricalRef {
  id: string;
  code: string;
  name: string;
  snapshotName?: string;
}

export interface MonthlyReport {
  year: number;
  branchFilter: string;
  averagePolicy: { code: 'months_with_actual'; label: string; denominator: number };
  rows: Array<{
    category: HistoricalRef & { expenseTypeSnapshot: 'fixed' | 'variable' };
    months: Array<{ month: number; planActual: PlanActual; transactionCount: number }>;
    annual: PlanActual & { transactionCount: number };
  }>;
  totals: { fixed: PlanActual; variable: PlanActual; overall: PlanActual };
}

export interface BranchComparisonReport {
  year: number;
  selectedMonth: {
    month: number;
    label: string;
    rows: Array<{
      category: HistoricalRef & { expenseTypeSnapshot: 'fixed' | 'variable' };
      branches: Array<{ branch: HistoricalRef; expense: PlanActual }>;
      total: { branch: HistoricalRef; expense: PlanActual };
    }>;
    branches: Array<{ branch: HistoricalRef; expense: PlanActual }>;
    total: { branch: HistoricalRef; expense: PlanActual };
  };
  months: Array<{
    month: number;
    branches: Array<{ branch: HistoricalRef; expense: PlanActual }>;
    total: { branch: HistoricalRef; expense: PlanActual };
  }>;
  annual: {
    branches: Array<{ branch: HistoricalRef; expense: PlanActual }>;
    total: { branch: HistoricalRef; expense: PlanActual };
  };
}

interface MonthlyViewRow {
  year: number;
  branch_id: string;
  category_id: string;
  category_name: string;
  expense_type: 'fixed' | 'variable';
  month: number;
  actual_uzs: unknown;
  planned_amount_uzs: unknown;
}

interface BranchViewRow {
  year: number;
  month: number;
  branch_id: string;
  branch_name: string;
  actual_uzs: unknown;
  planned_amount_uzs: unknown;
}

interface TwoBranchMonthViewRow extends BranchViewRow {
  category_id: string;
  category_name: string;
  expense_type: 'fixed' | 'variable';
  has_plan: boolean;
}

const TOTAL_REF: HistoricalRef = {
  id: 'all',
  code: 'ALL',
  name: 'Markaz jami',
  snapshotName: 'Markaz jami',
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "all" collapses to the caller's single branch when that is all they may
   * read — the mock does the same, so a cashier never sees an "all branches"
   * label over data that is really just their own.
   */
  resolveBranchFilter(user: AuthenticatedUser, requested: string | undefined): string {
    const branch = requested ?? 'all';
    if (branch === 'all' && user.branchScopes.length === 1) return user.branchScopes[0]!;
    return branch;
  }

  /** Branch ids the caller may read, narrowed by an explicit branch filter. */
  scopeBranchIds(user: AuthenticatedUser, branchFilter: string): string[] {
    if (branchFilter === 'all') return user.branchScopes;
    return user.branchScopes.includes(branchFilter) ? [branchFilter] : [];
  }

  async monthly(
    user: AuthenticatedUser,
    year: number,
    branchFilter: string,
  ): Promise<MonthlyReport> {
    const branchIds = this.scopeBranchIds(user, branchFilter);
    const empty = planActual(null, 0n, false);
    if (branchIds.length === 0)
      return {
        year,
        branchFilter,
        averagePolicy: {
          code: 'months_with_actual',
          label: 'Fakt mavjud oylar bo‘yicha o‘rtacha',
          denominator: 0,
        },
        rows: [],
        totals: { fixed: empty, variable: empty, overall: empty },
      };

    const [rows, counts, categories] = await Promise.all([
      this.prisma.db.$queryRaw<MonthlyViewRow[]>`
        SELECT year, branch_id, category_id, category_name, expense_type, month,
               actual_uzs, planned_amount_uzs
        FROM fincore.v_monthly_expense_report
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
      `,
      this.prisma.db.$queryRaw<Array<{ category_id: string; month: number; n: bigint }>>`
        SELECT category_id,
               EXTRACT(MONTH FROM transaction_date)::int AS month,
               count(*)::bigint AS n
        FROM fincore.v_expense_net_rows
        WHERE EXTRACT(YEAR FROM transaction_date)::int = ${year}
          AND branch_id = ANY(${branchIds}::uuid[])
        GROUP BY category_id, EXTRACT(MONTH FROM transaction_date)
      `,
      this.prisma.db.expense_categories.findMany({
        select: { id: true, code: true, name: true, expense_type: true, sort_order: true },
      }),
    ]);

    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const countByCell = new Map(
      counts.map((row) => [`${row.category_id}:${row.month}`, Number(row.n)]),
    );

    // One row per category, aggregated across every branch in scope.
    const byCategory = new Map<string, Map<number, { planned: bigint | null; actual: bigint }>>();
    const categoryMeta = new Map<string, { name: string; type: 'fixed' | 'variable' }>();

    for (const row of rows) {
      const months = byCategory.get(row.category_id) ?? new Map();
      byCategory.set(row.category_id, months);
      categoryMeta.set(row.category_id, { name: row.category_name, type: row.expense_type });

      const cell = months.get(row.month) ?? { planned: null, actual: 0n };
      cell.actual += toBigInt(row.actual_uzs);
      if (row.planned_amount_uzs !== null && row.planned_amount_uzs !== undefined)
        cell.planned = (cell.planned ?? 0n) + toBigInt(row.planned_amount_uzs);
      months.set(row.month, cell);
    }

    const reportRows: MonthlyReport['rows'] = [...byCategory.entries()]
      .map(([categoryId, months]) => {
        const meta = categoryMeta.get(categoryId)!;
        const reference = categoryById.get(categoryId);
        const monthCells = Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          const cell = months.get(month) ?? { planned: null, actual: 0n };
          return {
            month,
            planActual: planActual(cell.planned, cell.actual),
            transactionCount: countByCell.get(`${categoryId}:${month}`) ?? 0,
          };
        });
        const annualPlanned = monthCells.reduce<bigint | null>(
          (total, cell) =>
            cell.planActual.plannedAmountUzs === null
              ? total
              : (total ?? 0n) + BigInt(cell.planActual.plannedAmountUzs),
          null,
        );
        const annualActual = monthCells.reduce(
          (total, cell) => total + BigInt(cell.planActual.actualAmountUzs),
          0n,
        );
        return {
          category: {
            id: categoryId,
            code: reference?.code ?? categoryId,
            name: reference?.name ?? meta.name,
            snapshotName: meta.name,
            expenseTypeSnapshot: meta.type,
          },
          months: monthCells,
          annual: {
            ...planActual(annualPlanned, annualActual),
            transactionCount: monthCells.reduce((total, cell) => total + cell.transactionCount, 0),
          },
          sortOrder: reference?.sort_order ?? 0,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.category.code.localeCompare(b.category.code))
      .map(({ sortOrder: _sortOrder, ...row }) => row);

    const aggregate = (type?: 'fixed' | 'variable'): PlanActual => {
      const selected = type
        ? reportRows.filter((row) => row.category.expenseTypeSnapshot === type)
        : reportRows;
      const planned = selected.reduce<bigint | null>(
        (total, row) =>
          row.annual.plannedAmountUzs === null
            ? total
            : (total ?? 0n) + BigInt(row.annual.plannedAmountUzs),
        null,
      );
      const actual = selected.reduce(
        (total, row) => total + BigInt(row.annual.actualAmountUzs),
        0n,
      );
      return planActual(planned, actual, planned !== null);
    };

    const monthsWithActual = new Set(
      reportRows.flatMap((row) =>
        row.months.filter((month) => month.transactionCount > 0).map((month) => month.month),
      ),
    ).size;

    return {
      year,
      branchFilter,
      averagePolicy: {
        code: 'months_with_actual',
        label: 'Fakt mavjud oylar bo‘yicha o‘rtacha',
        denominator: monthsWithActual,
      },
      rows: reportRows,
      totals: { fixed: aggregate('fixed'), variable: aggregate('variable'), overall: aggregate() },
    };
  }

  async branchComparison(
    user: AuthenticatedUser,
    year: number,
    selectedMonth = 1,
    branchFilter = 'all',
  ): Promise<BranchComparisonReport> {
    const branchIds = this.scopeBranchIds(user, branchFilter);
    if (branchIds.length === 0)
      return {
        year,
        selectedMonth: {
          month: selectedMonth,
          label: MONTHS_UZ[selectedMonth - 1] ?? String(selectedMonth),
          rows: [],
          branches: [],
          total: { branch: TOTAL_REF, expense: planActual(null, 0n, false) },
        },
        months: [],
        annual: {
          branches: [],
          total: { branch: TOTAL_REF, expense: planActual(null, 0n, false) },
        },
      };

    const [rows, monthRows, branches, categories] = await Promise.all([
      this.prisma.db.$queryRaw<BranchViewRow[]>`
        SELECT year, month, branch_id, branch_name, actual_uzs, planned_amount_uzs
        FROM fincore.v_branch_comparison
        WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
      `,
      this.prisma.db.$queryRaw<TwoBranchMonthViewRow[]>`
        SELECT year, month, branch_id, branch_name, category_id, category_name,
               expense_type, actual_uzs, planned_amount_uzs, has_plan
        FROM fincore.v_two_branch_month_matrix
        WHERE year = ${year} AND month = ${selectedMonth}
          AND branch_id = ANY(${branchIds}::uuid[])
      `,
      this.prisma.db.branches.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.db.expense_categories.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true, expense_type: true, sort_order: true },
        orderBy: [{ expense_type: 'asc' }, { sort_order: 'asc' }, { code: 'asc' }],
      }),
    ]);

    const cell = (branchId: string, month: number) => {
      const found = rows.filter((row) => row.branch_id === branchId && row.month === month);
      const planned = found.reduce<bigint | null>(
        (total, row) =>
          row.planned_amount_uzs === null || row.planned_amount_uzs === undefined
            ? total
            : (total ?? 0n) + toBigInt(row.planned_amount_uzs),
        null,
      );
      return {
        planned,
        actual: found.reduce((total, row) => total + toBigInt(row.actual_uzs), 0n),
      };
    };

    const summary = (
      branch: { id: string; code: string; name: string },
      planned: bigint | null,
      actual: bigint,
    ) => ({
      branch: { id: branch.id, code: branch.code, name: branch.name, snapshotName: branch.name },
      expense: planActual(planned, actual),
    });

    const monthCellByKey = new Map(
      monthRows.map((row) => [`${row.branch_id}:${row.category_id}`, row] as const),
    );
    const aggregateExpense = (items: Array<{ expense: PlanActual }>): PlanActual => {
      const hasPlan = items.some((item) => item.expense.hasPlan);
      const planned = hasPlan
        ? items.reduce((total, item) => total + BigInt(item.expense.plannedAmountUzs ?? '0'), 0n)
        : null;
      const actual = items.reduce(
        (total, item) => total + BigInt(item.expense.actualAmountUzs),
        0n,
      );
      return planActual(planned, actual, hasPlan);
    };
    const selectedMonthRows = categories.map((category) => {
      const perBranch = branches.map((branch) => {
        const row = monthCellByKey.get(`${branch.id}:${category.id}`);
        const hasPlan = row?.has_plan ?? false;
        return summary(
          branch,
          hasPlan ? toBigInt(row?.planned_amount_uzs) : null,
          toBigInt(row?.actual_uzs),
        );
      });
      return {
        category: {
          id: category.id,
          code: category.code,
          name: category.name,
          snapshotName:
            monthRows.find((row) => row.category_id === category.id)?.category_name ??
            category.name,
          expenseTypeSnapshot: category.expense_type,
        },
        branches: perBranch,
        total: { branch: TOTAL_REF, expense: aggregateExpense(perBranch) },
      };
    });
    const selectedMonthBranches = branches.map((branch) => ({
      branch: { id: branch.id, code: branch.code, name: branch.name, snapshotName: branch.name },
      expense: aggregateExpense(
        selectedMonthRows.flatMap((row) =>
          row.branches.filter((item) => item.branch.id === branch.id),
        ),
      ),
    }));
    const selectedMonthTotal = {
      branch: TOTAL_REF,
      expense: aggregateExpense(selectedMonthBranches),
    };

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const perBranch = branches.map((branch) => {
        const { planned, actual } = cell(branch.id, month);
        return summary(branch, planned, actual);
      });
      const totalPlanned = perBranch.reduce<bigint | null>(
        (total, item) =>
          item.expense.plannedAmountUzs === null
            ? total
            : (total ?? 0n) + BigInt(item.expense.plannedAmountUzs),
        null,
      );
      const totalActual = perBranch.reduce(
        (total, item) => total + BigInt(item.expense.actualAmountUzs),
        0n,
      );
      return {
        month,
        branches: perBranch,
        total: { branch: TOTAL_REF, expense: planActual(totalPlanned, totalActual) },
      };
    });

    const annualBranches = branches.map((branch) => {
      const planned = months.reduce<bigint | null>((total, entry) => {
        const item = entry.branches.find((candidate) => candidate.branch.id === branch.id);
        return item?.expense.plannedAmountUzs == null
          ? total
          : (total ?? 0n) + BigInt(item.expense.plannedAmountUzs);
      }, null);
      const actual = months.reduce((total, entry) => {
        const item = entry.branches.find((candidate) => candidate.branch.id === branch.id);
        return total + BigInt(item?.expense.actualAmountUzs ?? '0');
      }, 0n);
      return summary(branch, planned, actual);
    });

    const annualPlanned = annualBranches.reduce<bigint | null>(
      (total, item) =>
        item.expense.plannedAmountUzs === null
          ? total
          : (total ?? 0n) + BigInt(item.expense.plannedAmountUzs),
      null,
    );
    const annualActual = annualBranches.reduce(
      (total, item) => total + BigInt(item.expense.actualAmountUzs),
      0n,
    );

    return {
      year,
      selectedMonth: {
        month: selectedMonth,
        label: MONTHS_UZ[selectedMonth - 1] ?? String(selectedMonth),
        rows: selectedMonthRows,
        branches: selectedMonthBranches,
        total: selectedMonthTotal,
      },
      months,
      annual: {
        branches: annualBranches,
        total: { branch: TOTAL_REF, expense: planActual(annualPlanned, annualActual) },
      },
    };
  }

  /** Shared by the dashboard: per-month expense figures for one calendar year. */
  async annualMonths(year: number, branchIds: string[]) {
    if (branchIds.length === 0) return [];
    return this.prisma.db.$queryRaw<
      Array<{
        month: number;
        expense_type: 'fixed' | 'variable';
        actual_uzs: unknown;
        planned_amount_uzs: unknown;
      }>
    >`
      SELECT month, expense_type, sum(actual_uzs) AS actual_uzs,
             sum(planned_amount_uzs) AS planned_amount_uzs
      FROM fincore.v_monthly_expense_report
      WHERE year = ${year} AND branch_id = ANY(${branchIds}::uuid[])
      GROUP BY month, expense_type
    `;
  }

  monthLabel(month: number): string {
    return MONTHS_SHORT_UZ[month - 1] ?? String(month);
  }
}
