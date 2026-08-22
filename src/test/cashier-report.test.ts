import { describe, expect, it } from 'vitest';
import {
  buildCashierReport,
  percentOf,
  type CashierReportInput,
} from '@/features/reports/cashier-report';
import type { AuthenticatedUser, DailyRevenue } from '@/shared/types/domain';

function cashier(
  id: string,
  fullName: string,
  branchId: string,
  salary: string,
  status: AuthenticatedUser['status'] = 'active',
): AuthenticatedUser {
  return {
    id,
    fullName,
    phone: '+998900000000',
    status,
    roles: [{ id: `r-${id}`, role: 'cashier', roleName: 'Kassir', branchId, branchName: branchId }],
    permissions: [],
    branchScopes: [branchId],
    writeBranchScopes: [branchId],
    fixedSalaryUzs: salary,
    lastLoginAt: null,
  };
}

function revenue(id: string, branchId: string, enteredBy: string, totalUzs: string): DailyRevenue {
  return {
    id,
    businessDate: '2026-08-10',
    periodId: 'p-aug',
    branchId,
    branchName: branchId,
    cashUzs: totalUzs,
    cardUzs: '0',
    transferUzs: '0',
    totalUzs,
    comment: null,
    enteredBy,
    enteredByName: enteredBy,
    createdAt: '2026-08-10T19:00:00+05:00',
    updatedAt: '2026-08-10T19:00:00+05:00',
  };
}

const base: CashierReportInput = {
  periodId: 'p-aug',
  periodLabel: 'Avgust 2026',
  branchFilter: 'all',
  branches: [
    { id: 'b1', name: 'Sayxun', isActive: true },
    { id: 'b2', name: "Xalqlar do'stligi", isActive: true },
  ],
  users: [
    cashier('u1', 'Aziza', 'b1', '4500000'),
    cashier('u2', 'Madina', 'b1', '8000000'),
    cashier('u3', 'Dilnoza', 'b2', '4500000'),
  ],
  revenues: [
    revenue('r1', 'b1', 'u1', '60000000'),
    revenue('r2', 'b1', 'u2', '20000000'),
    revenue('r3', 'b2', 'u3', '90000000'),
  ],
  branchPlanUzs: { b1: '160000000', b2: '140000000' },
};

describe('[FE-CASHIER-01] foiz hisobi', () => {
  it('maxraj 0 bo‘lsa null qaytaradi, nolga bo‘lmaydi', () => {
    expect(percentOf('5000', '0')).toBeNull();
    expect(percentOf('0', '0')).toBeNull();
  });

  it('foizni ikki xona aniqlikda yaxlitlaydi', () => {
    expect(percentOf('60000000', '80000000')).toBe(75);
    expect(percentOf('99090000', '160000000')).toBe(61.93);
  });
});

describe('[FE-CASHIER-02] kassirlar kesimi', () => {
  const report = buildCashierReport(base);
  const sayxun = report.branches.find((group) => group.branchName === 'Sayxun')!;

  it('filial rejasini faol kassirlar orasida qoldiqsiz bo‘ladi', () => {
    const plans = sayxun.cashiers.map((row) => BigInt(row.planUzs));
    expect(plans.reduce((total, value) => total + value, 0n)).toBe(160_000_000n);
    expect(plans.every((value) => value === 80_000_000n)).toBe(true);
  });

  it('har kassirning yig‘gan tushumi, farqi va foizini hisoblaydi', () => {
    const aziza = sayxun.cashiers.find((row) => row.fullName === 'Aziza')!;
    expect(aziza.actualUzs).toBe('60000000');
    expect(aziza.varianceUzs).toBe('-20000000');
    expect(aziza.completionPct).toBe(75);
    expect(aziza.branchSharePct).toBe(75);
    expect(aziza.fixedSalaryUzs).toBe('4500000');
    expect(aziza.salaryToRevenuePct).toBe(7.5);
  });

  it('rejadan ko‘p yig‘ilsa farq musbat bo‘ladi', () => {
    const dilnoza = report.branches
      .flatMap((group) => group.cashiers)
      .find((row) => row.fullName === 'Dilnoza')!;
    expect(dilnoza.varianceUzs).toBe('-50000000');

    const overplan = buildCashierReport({ ...base, branchPlanUzs: { b1: '160000000', b2: '80000000' } });
    const better = overplan.branches
      .flatMap((group) => group.cashiers)
      .find((row) => row.fullName === 'Dilnoza')!;
    expect(better.varianceUzs).toBe('10000000');
    expect(better.completionPct).toBe(112.5);
  });

  it('kassirlarni yig‘gan tushumi bo‘yicha kamayish tartibida beradi', () => {
    expect(sayxun.cashiers.map((row) => row.fullName)).toEqual(['Aziza', 'Madina']);
  });

  it('nofaol kassirga reja bermaydi, lekin tarixiy tushumi yo‘qolmaydi', () => {
    const withInactive = buildCashierReport({
      ...base,
      users: [...base.users, cashier('u4', 'Komil', 'b1', '4200000', 'inactive')],
      revenues: [...base.revenues, revenue('r4', 'b1', 'u4', '10000000')],
    });
    const komil = withInactive.branches
      .flatMap((group) => group.cashiers)
      .find((row) => row.fullName === 'Komil')!;
    expect(komil.planUzs).toBe('0');
    expect(komil.actualUzs).toBe('10000000');
    expect(komil.isActive).toBe(false);
    // Reja hamon faqat 2 ta faol kassir orasida bo‘linadi.
    const active = withInactive.branches
      .find((group) => group.branchName === 'Sayxun')!
      .cashiers.filter((row) => row.isActive);
    expect(active.every((row) => row.planUzs === '80000000')).toBe(true);
  });

  it('filial va umumiy yakunni to‘g‘ri yig‘adi', () => {
    expect(sayxun.actualUzs).toBe('80000000');
    expect(sayxun.completionPct).toBe(50);
    expect(sayxun.salaryTotalUzs).toBe('12500000');
    expect(report.total.actualUzs).toBe('170000000');
    expect(report.total.planUzs).toBe('300000000');
    expect(report.total.salaryTotalUzs).toBe('17000000');
    expect(report.total.activeCashierCount).toBe(3);
    expect(report.total.salaryToRevenuePct).toBe(10);
  });

  it('kassir o‘zini ko‘rganda faqat o‘z qatorini oladi', () => {
    const own = buildCashierReport({ ...base, viewerId: 'u1' });

    expect(own.scope).toBe('own');
    expect(own.branches).toHaveLength(1);
    expect(own.branches[0]?.cashiers.map((row) => row.fullName)).toEqual(['Aziza']);
    // Reja ulushi baribir filialning 2 ta faol kassiriga qarab hisoblanadi.
    expect(own.branches[0]?.cashiers[0]?.planUzs).toBe('80000000');
    expect(own.total.actualUzs).toBe('60000000');
    expect(own.total.planUzs).toBe('80000000');
    expect(own.total.completionPct).toBe(75);
  });

  it('«own» rejimda boshqa kassirning oyligi jamiga qo‘shilmaydi', () => {
    const own = buildCashierReport({ ...base, viewerId: 'u1' });

    // Faqat Azizaning oyligi — Madinaning 8 000 000 i chiqmaydi.
    expect(own.total.salaryTotalUzs).toBe('4500000');
    expect(own.branches[0]?.salaryTotalUzs).toBe('4500000');
    expect(own.total.activeCashierCount).toBe(1);
    // Javobda umuman boshqa xodimning nomi yoki oylik maydoni bo‘lmasin.
    const salaries = own.branches.flatMap((group) =>
      group.cashiers.map((row) => row.fixedSalaryUzs),
    );
    expect(salaries).toEqual(['4500000']);
    expect(JSON.stringify(own)).not.toContain('Madina');
  });

  it('to‘liq rejimda scope «all» bo‘ladi', () => {
    expect(buildCashierReport(base).scope).toBe('all');
  });

  it('filial filtri bo‘yicha faqat bitta markazni qaytaradi', () => {
    const filtered = buildCashierReport({ ...base, branchFilter: 'b2' });
    expect(filtered.branches).toHaveLength(1);
    expect(filtered.branches[0]?.branchName).toBe("Xalqlar do'stligi");
  });
});
