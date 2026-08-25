import { Injectable } from '@nestjs/common';
import { ApiException, type AuthenticatedUser } from '@/common';
import { toMoneyUzs } from '@/common/serialization/financial';
import { PrismaService } from '@/database';
import { MONTHS_UZ, distributeDaily, percentageValue, toBigInt } from './report-math';

/** Mirrors CashierRow / CashierBranchGroup / CashierReport (src/features/reports/cashier-report.ts). */
export interface CashierRowDto {
  userId: string;
  fullName: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  fixedSalaryUzs: string;
  planUzs: string;
  actualUzs: string;
  varianceUzs: string;
  completionPct: number | null;
  branchSharePct: number | null;
  daysWithEntry: number;
  salaryToRevenuePct: number | null;
}

export interface CashierBranchGroupDto {
  branchId: string;
  branchName: string;
  planUzs: string;
  actualUzs: string;
  varianceUzs: string;
  completionPct: number | null;
  salaryTotalUzs: string;
  cashiers: CashierRowDto[];
}

export interface CashierReportDto {
  periodLabel: string;
  branchFilter: string;
  scope: 'all' | 'own';
  branches: CashierBranchGroupDto[];
  total: {
    planUzs: string;
    actualUzs: string;
    varianceUzs: string;
    completionPct: number | null;
    salaryTotalUzs: string;
    salaryToRevenuePct: number | null;
    activeCashierCount: number;
  };
}

interface CashierRosterRow {
  branch_id: string;
  user_id: string;
  full_name: string;
  is_active: boolean;
}

interface CashierMetricRow {
  branch_id: string;
  user_id: string;
  total_uzs: unknown;
  salary: string;
}

interface BranchPlanRow {
  branch_id: string;
  branch_name: string;
  planned_amount_uzs: unknown;
  actual_uzs: unknown;
}

function sum(values: string[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), 0n);
}

/**
 * FR-REV-13 cashier report. Revenue never leaves the sanctioned views: per
 * cashier it comes from v_cashier_report (which aggregates on
 * collector_user_id), per branch from v_revenue_plan_vs_actual. The only thing
 * this service adds is the fixed salary, which lives on fincore.users.
 */
@Injectable()
export class CashierReportService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    user: AuthenticatedUser,
    periodId: string,
    requestedBranch: string | undefined,
  ): Promise<CashierReportDto> {
    // reports.view_cashiers sees everyone; reports.view_own_performance sees
    // only their own row, so nobody else's salary leaks. The guard can only
    // AND, so the pair is checked here.
    const seesEveryone = user.permissions.includes('reports.view_cashiers');
    if (!seesEveryone && !user.permissions.includes('reports.view_own_performance'))
      throw ApiException.forbidden(undefined, {
        missingPermissions: ['reports.view_cashiers', 'reports.view_own_performance'],
      });

    const period = await this.prisma.db.accounting_periods.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true },
    });
    if (!period) throw new ApiException(404, 'PERIOD_NOT_FOUND', 'Hisob davri topilmadi.');

    const requested = requestedBranch || 'all';
    if (requested !== 'all' && !user.branchScopes.includes(requested))
      throw new ApiException(
        403,
        'BRANCH_SCOPE_DENIED',
        'Bu filial ma’lumotini ko‘rish huquqi yo‘q.',
      );
    // A reader with exactly one branch sees that branch, not a hollow "all".
    const branchFilter =
      requested === 'all' && user.branchScopes.length === 1
        ? (user.branchScopes[0] ?? 'all')
        : requested;
    const branchIds =
      branchFilter === 'all' ? user.branchScopes : user.branchScopes.filter((id) => id === branchFilter);

    const viewerId = seesEveryone ? undefined : user.id;
    const periodLabel = `${MONTHS_UZ[period.month - 1] ?? period.month} ${period.year}`;

    if (branchIds.length === 0)
      return this.assemble(periodLabel, branchFilter, viewerId, []);

    const viewerSqlId = viewerId ?? null;
    const [branchRows, rosterRows, metrics, days] = await Promise.all([
      this.prisma.db.$queryRaw<BranchPlanRow[]>`
        SELECT branch_id::text AS branch_id, branch_name, planned_amount_uzs, actual_uzs
        FROM fincore.v_revenue_plan_vs_actual
        WHERE period_id = ${periodId}::uuid AND branch_id = ANY(${branchIds}::uuid[])
        ORDER BY branch_name
      `,
      // The roster comes from the sanctioned zero-inclusive cashier view,
      // rather than independently repeating role-assignment business rules.
      this.prisma.db.$queryRaw<CashierRosterRow[]>`
        SELECT cr.branch_id::text        AS branch_id,
               cr.collector_user_id::text AS user_id,
               cr.collector_name          AS full_name,
               (u.id IS NOT NULL AND u.status = 'active') AS is_active
        FROM fincore.v_cashier_report cr
        LEFT JOIN fincore.users u ON u.id = cr.collector_user_id
        WHERE cr.period_id = ${periodId}::uuid
          AND cr.branch_id = ANY(${branchIds}::uuid[])
        ORDER BY cr.collector_name, cr.collector_user_id
      `,
      // Own-performance mode filters salary and actual rows in SQL, so another
      // employee's salary never crosses the database boundary.
      this.prisma.db.$queryRaw<CashierMetricRow[]>`
        SELECT cr.branch_id::text AS branch_id,
               cr.collector_user_id::text AS user_id,
               cr.total_uzs,
               COALESCE(u.fixed_salary_uzs, 0)::text AS salary
        FROM fincore.v_cashier_report cr
        LEFT JOIN fincore.users u ON u.id = cr.collector_user_id
        WHERE cr.period_id = ${periodId}::uuid
          AND cr.branch_id = ANY(${branchIds}::uuid[])
          AND (${viewerSqlId}::uuid IS NULL OR cr.collector_user_id = ${viewerSqlId}::uuid)
      `,
      // daysWithEntry counts DailyRevenue entries, i.e. distinct business dates
      // — not transactions, of which one day may hold up to three.
      this.prisma.db.$queryRaw<Array<{ branch_id: string; user_id: string; days: number }>>`
        SELECT branch_id::text AS branch_id,
               collector_user_id::text AS user_id,
               COUNT(DISTINCT payment_business_date)::int AS days
        FROM fincore.v_revenue_net_rows rt
        JOIN fincore.payment_methods pm ON pm.id = rt.payment_method_id
        WHERE rt.accounting_period_id = ${periodId}::uuid
          AND rt.branch_id = ANY(${branchIds}::uuid[])
          AND pm.code IN ('CASH', 'CARD', 'BANK_TRANSFER')
          AND (${viewerSqlId}::uuid IS NULL OR rt.collector_user_id = ${viewerSqlId}::uuid)
        GROUP BY rt.branch_id, rt.collector_user_id
      `,
    ]);

    const metricByCashier = new Map<string, { actual: bigint; salary: bigint }>(
      metrics.map((row) => [
        `${row.branch_id}:${row.user_id}`,
        { actual: toBigInt(row.total_uzs), salary: BigInt(row.salary) },
      ]),
    );
    const daysByCashier = new Map<string, number>(
      days.map((row) => [`${row.branch_id}:${row.user_id}`, row.days]),
    );

    const groups = branchRows.map((branch) => {
      const roster = rosterRows.filter((row) => row.branch_id === branch.branch_id);
      const cashiers = viewerId ? roster.filter((row) => row.user_id === viewerId) : roster;
      const active = roster.filter((row) => row.is_active);
      // The plan is split among ACTIVE cashiers only — an inactive employee
      // carries no target.
      const shares = distributeDaily(toBigInt(branch.planned_amount_uzs), active.length);
      const branchActual = toBigInt(branch.actual_uzs);

      const rows: CashierRowDto[] = cashiers.map((row) => {
        const key = `${branch.branch_id}:${row.user_id}`;
        const metric = metricByCashier.get(key);
        const actual = metric?.actual ?? 0n;
        const activeIndex = active.findIndex((item) => item.user_id === row.user_id);
        const plan = activeIndex >= 0 ? (shares[activeIndex] ?? 0n) : 0n;
        const salary = metric?.salary ?? 0n;
        return {
          userId: row.user_id,
          fullName: row.full_name,
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          isActive: row.is_active,
          fixedSalaryUzs: toMoneyUzs(salary)!,
          planUzs: toMoneyUzs(plan)!,
          actualUzs: toMoneyUzs(actual)!,
          varianceUzs: toMoneyUzs(actual - plan)!,
          completionPct: percentageValue(actual, plan),
          branchSharePct: percentageValue(actual, branchActual),
          daysWithEntry: daysByCashier.get(key) ?? 0,
          salaryToRevenuePct: percentageValue(salary, actual),
        };
      });

      const planTotal = sum(rows.map((row) => row.planUzs));
      return {
        branchId: branch.branch_id,
        branchName: branch.branch_name,
        planUzs: toMoneyUzs(planTotal)!,
        actualUzs: toMoneyUzs(branchActual)!,
        varianceUzs: toMoneyUzs(branchActual - planTotal)!,
        completionPct: percentageValue(branchActual, planTotal),
        salaryTotalUzs: toMoneyUzs(
          sum(rows.filter((row) => row.isActive).map((row) => row.fixedSalaryUzs)),
        )!,
        cashiers: rows.sort((a, b) => Number(BigInt(b.actualUzs) - BigInt(a.actualUzs))),
      };
    });

    return this.assemble(periodLabel, branchFilter, viewerId, groups);
  }

  /** Applies the own-performance narrowing and the report totals. */
  private assemble(
    periodLabel: string,
    branchFilter: string,
    viewerId: string | undefined,
    groups: CashierBranchGroupDto[],
  ): CashierReportDto {
    const visible = viewerId
      ? groups
          .filter((group) => group.cashiers.some((row) => row.userId === viewerId))
          .map((group) => {
            const mine = group.cashiers.filter((row) => row.userId === viewerId);
            const minePlan = sum(mine.map((row) => row.planUzs));
            const mineActual = sum(mine.map((row) => row.actualUzs));
            return {
              ...group,
              planUzs: toMoneyUzs(minePlan)!,
              actualUzs: toMoneyUzs(mineActual)!,
              varianceUzs: toMoneyUzs(sum(mine.map((row) => row.varianceUzs)))!,
              completionPct: percentageValue(mineActual, minePlan),
              salaryTotalUzs: toMoneyUzs(
                sum(mine.filter((row) => row.isActive).map((row) => row.fixedSalaryUzs)),
              )!,
              cashiers: mine,
            };
          })
      : groups;

    const planUzs = sum(visible.map((group) => group.planUzs));
    const actualUzs = sum(visible.map((group) => group.actualUzs));
    const salaryTotalUzs = sum(visible.map((group) => group.salaryTotalUzs));

    return {
      periodLabel,
      branchFilter,
      scope: viewerId ? 'own' : 'all',
      branches: visible,
      total: {
        planUzs: toMoneyUzs(planUzs)!,
        actualUzs: toMoneyUzs(actualUzs)!,
        varianceUzs: toMoneyUzs(actualUzs - planUzs)!,
        completionPct: percentageValue(actualUzs, planUzs),
        salaryTotalUzs: toMoneyUzs(salaryTotalUzs)!,
        salaryToRevenuePct: percentageValue(salaryTotalUzs, actualUzs),
        activeCashierCount: visible.reduce(
          (count, group) => count + group.cashiers.filter((row) => row.isActive).length,
          0,
        ),
      },
    };
  }
}
