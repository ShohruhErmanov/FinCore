import type { AuthenticatedUser, DailyRevenue, MoneyUzs, UUID } from '@/shared/types/domain';

export interface CashierRow {
  userId: UUID;
  fullName: string;
  branchId: UUID;
  branchName: string;
  isActive: boolean;
  fixedSalaryUzs: MoneyUzs;
  /** Filial oylik rejasidan shu kassirga to‘g‘ri keladigan ulush. */
  planUzs: MoneyUzs;
  actualUzs: MoneyUzs;
  /** Musbat — rejadan ko‘p, manfiy — kam. */
  varianceUzs: MoneyUzs;
  completionPct: number | null;
  /** Filialning umumiy tushumidagi ulushi. */
  branchSharePct: number | null;
  daysWithEntry: number;
  /** Oylik fix oylikning shu kassir yig‘gan tushumiga nisbati. */
  salaryToRevenuePct: number | null;
}

export interface CashierBranchGroup {
  branchId: UUID;
  branchName: string;
  planUzs: MoneyUzs;
  actualUzs: MoneyUzs;
  varianceUzs: MoneyUzs;
  completionPct: number | null;
  salaryTotalUzs: MoneyUzs;
  cashiers: CashierRow[];
}

export interface CashierReport {
  periodLabel: string;
  branchFilter: UUID | 'all';
  /** 'own' — kassir faqat o‘z natijasini ko‘radi, boshqalarning oyligi berilmaydi. */
  scope: 'all' | 'own';
  branches: CashierBranchGroup[];
  total: {
    planUzs: MoneyUzs;
    actualUzs: MoneyUzs;
    varianceUzs: MoneyUzs;
    completionPct: number | null;
    salaryTotalUzs: MoneyUzs;
    salaryToRevenuePct: number | null;
    activeCashierCount: number;
  };
}

function sum(values: MoneyUzs[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), 0n);
}

/** Ikki xona aniqlikdagi foiz; maxraj 0 bo‘lsa null. */
export function percentOf(value: MoneyUzs | bigint, base: MoneyUzs | bigint): number | null {
  const divisor = typeof base === 'bigint' ? base : BigInt(base);
  if (divisor === 0n) return null;
  const numerator = (typeof value === 'bigint' ? value : BigInt(value)) * 10_000n;
  const negative = numerator < 0n !== divisor < 0n;
  const abs = (input: bigint) => (input < 0n ? -input : input);
  const rounded = (abs(numerator) + abs(divisor) / 2n) / abs(divisor);
  return Number(negative ? -rounded : rounded) / 100;
}

/** Summani teng bo‘laklarga qoldiqsiz bo‘ladi. */
function splitEvenly(total: bigint, parts: number): bigint[] {
  if (parts <= 0) return [];
  const count = BigInt(parts);
  return Array.from(
    { length: parts },
    (_, index) => (total * BigInt(index + 1)) / count - (total * BigInt(index)) / count,
  );
}

export interface CashierReportInput {
  periodId: UUID;
  periodLabel: string;
  branchFilter: UUID | 'all';
  branches: Array<{ id: UUID; name: string; isActive: boolean }>;
  users: AuthenticatedUser[];
  revenues: DailyRevenue[];
  /** Filial → oylik tushum rejasi. */
  branchPlanUzs: Record<UUID, MoneyUzs | undefined>;
  /**
   * Berilsa, hisobot faqat shu kassirning qatorini qaytaradi.
   * Reja ulushi baribir filialning barcha faol kassirlariga qarab hisoblanadi.
   */
  viewerId?: UUID | undefined;
}

/**
 * Kassirlar kesimi: fix oylik, yig‘ilgan tushum, filial rejasidagi ulushga
 * nisbatan farq va foizlar. Kassir = `cashier` roli biriktirilgan xodim.
 */
export function buildCashierReport(input: CashierReportInput): CashierReport {
  const visibleBranches = input.branches.filter(
    (branch) => branch.isActive && (input.branchFilter === 'all' || branch.id === input.branchFilter),
  );

  const groups: CashierBranchGroup[] = visibleBranches.map((branch) => {
    const cashiers = input.users.filter((user) =>
      user.roles.some((role) => role.role === 'cashier' && role.branchId === branch.id),
    );
    const active = cashiers.filter((user) => user.status === 'active');
    // Reja faqat faol kassirlar orasida bo‘linadi — nofaol xodim reja olmaydi.
    const shares = splitEvenly(BigInt(input.branchPlanUzs[branch.id] ?? '0'), active.length);

    const branchRevenues = input.revenues.filter(
      (row) => row.periodId === input.periodId && row.branchId === branch.id,
    );
    const branchActual = sum(branchRevenues.map((row) => row.totalUzs));

    const rows: CashierRow[] = cashiers.map((user) => {
      const own = branchRevenues.filter((row) => row.enteredBy === user.id);
      const actual = sum(own.map((row) => row.totalUzs));
      const activeIndex = active.findIndex((item) => item.id === user.id);
      const plan = activeIndex >= 0 ? (shares[activeIndex] ?? 0n) : 0n;
      const salary = BigInt(user.fixedSalaryUzs ?? '0');
      return {
        userId: user.id,
        fullName: user.fullName,
        branchId: branch.id,
        branchName: branch.name,
        isActive: user.status === 'active',
        fixedSalaryUzs: salary.toString(),
        planUzs: plan.toString(),
        actualUzs: actual.toString(),
        varianceUzs: (actual - plan).toString(),
        completionPct: percentOf(actual, plan),
        branchSharePct: percentOf(actual, branchActual),
        daysWithEntry: own.length,
        salaryToRevenuePct: percentOf(salary, actual),
      };
    });

    const planTotal = sum(rows.map((row) => row.planUzs));
    return {
      branchId: branch.id,
      branchName: branch.name,
      planUzs: planTotal.toString(),
      actualUzs: branchActual.toString(),
      varianceUzs: (branchActual - planTotal).toString(),
      completionPct: percentOf(branchActual, planTotal),
      salaryTotalUzs: sum(
        rows.filter((row) => row.isActive).map((row) => row.fixedSalaryUzs),
      ).toString(),
      cashiers: rows.sort((a, b) => Number(BigInt(b.actualUzs) - BigInt(a.actualUzs))),
    };
  });

  // «Own» rejimda faqat o‘z qatori qoladi — boshqalarning oyligi chiqmaydi.
  const visible = input.viewerId
    ? groups
        .filter((group) => group.cashiers.some((row) => row.userId === input.viewerId))
        .map((group) => {
          const mine = group.cashiers.filter((row) => row.userId === input.viewerId);
          return {
            ...group,
            planUzs: sum(mine.map((row) => row.planUzs)).toString(),
            actualUzs: sum(mine.map((row) => row.actualUzs)).toString(),
            varianceUzs: sum(mine.map((row) => row.varianceUzs)).toString(),
            completionPct: percentOf(sum(mine.map((row) => row.actualUzs)), sum(mine.map((row) => row.planUzs))),
            salaryTotalUzs: sum(
              mine.filter((row) => row.isActive).map((row) => row.fixedSalaryUzs),
            ).toString(),
            cashiers: mine,
          };
        })
    : groups;

  const planUzs = sum(visible.map((group) => group.planUzs));
  const actualUzs = sum(visible.map((group) => group.actualUzs));
  const salaryTotalUzs = sum(visible.map((group) => group.salaryTotalUzs));

  return {
    periodLabel: input.periodLabel,
    branchFilter: input.branchFilter,
    scope: input.viewerId ? 'own' : 'all',
    branches: visible,
    total: {
      planUzs: planUzs.toString(),
      actualUzs: actualUzs.toString(),
      varianceUzs: (actualUzs - planUzs).toString(),
      completionPct: percentOf(actualUzs, planUzs),
      salaryTotalUzs: salaryTotalUzs.toString(),
      salaryToRevenuePct: percentOf(salaryTotalUzs, actualUzs),
      activeCashierCount: visible.reduce(
        (count, group) => count + group.cashiers.filter((row) => row.isActive).length,
        0,
      ),
    },
  };
}
