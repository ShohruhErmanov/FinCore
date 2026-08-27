import type {
  AccountingPeriod,
  AuthenticatedUser,
  Branch,
  BudgetPlan,
  DailyRevenue,
  Expense,
  ExpenseCategory,
  MasterItem,
  MoneyUzs,
} from '@/shared/types/domain';

export const ids = {
  sayxun: '10000000-0000-0000-0000-000000000001',
  xalqlar: '10000000-0000-0000-0000-000000000002',
  periodAug: '20000000-0000-0000-0000-000000000008',
  periodJul: '20000000-0000-0000-0000-000000000007',
  director: '30000000-0000-0000-0000-000000000001',
  finance: '30000000-0000-0000-0000-000000000002',
  cashierX: '30000000-0000-0000-0000-000000000003',
  cashierA: '30000000-0000-0000-0000-000000000004',
  cashierB: '30000000-0000-0000-0000-000000000005',
  cash: '40000000-0000-0000-0000-000000000001',
  bank: '40000000-0000-0000-0000-000000000002',
  card: '40000000-0000-0000-0000-000000000003',
  general: '50000000-0000-0000-0000-000000000001',
  admin: '50000000-0000-0000-0000-000000000002',
  marketing: '50000000-0000-0000-0000-000000000007',
} as const;

export const branches: Branch[] = [
  { id: ids.sayxun, code: 'SAYXUN', name: 'Sayxun', isActive: true },
  { id: ids.xalqlar, code: 'XALQLAR', name: "Xalqlar do'stligi", isActive: true },
];

const MONTH_LABELS = [
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

/**
 * A full calendar year, the way the live database now holds it. Iyul is the
 * one closed month, so the closed-period rules stay exercised in the mock.
 */
export const periods: AccountingPeriod[] = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  const closed = month === 7;
  return {
    id: `20000000-0000-0000-0000-${String(month).padStart(12, '0')}`,
    year: 2026,
    month,
    label: `${MONTH_LABELS[index]} 2026`,
    status: closed ? ('closed' as const) : ('open' as const),
    closedAt: closed ? '2026-08-03T09:12:00+05:00' : null,
    closedByName: closed ? 'Shohrux Ermanov' : null,
  };
}).sort((a, b) => b.month - a.month);

/**
 * Direktor — nazorat va rejalashtirish roli: kunlik xarajat/tushum kiritmaydi,
 * faqat oy boshida reja qo‘yadi va hamma narsani ko‘radi.
 */
const directorPermissions: AuthenticatedUser['permissions'] = [
  'dashboard.view',
  'expense.view_own_branch',
  'expense.view_all_branches',
  'budget.view',
  'budget.create_edit',
  'revenue.view_own_branch',
  'revenue.view_all_branches',
  'revenue_plan.manage',
  'import.run',
  'notification.manage',
  'reports.view',
  'reports.view_cashiers',
  'master_data.manage',
  'user.manage',
  'user.deactivate',
  'user.delete',
  'role.manage',
];

/** Moliya rahbari — kundalik operatsiyalarni kiritadi va rejani tayyorlaydi. */
const financeManagerPermissions: AuthenticatedUser['permissions'] = [
  'dashboard.view',
  'expense.view_own_branch',
  'expense.view_all_branches',
  'expense.create',
  'expense.edit',
  'budget.view',
  'budget.create_edit',
  'revenue.view_own_branch',
  'revenue.view_all_branches',
  'revenue.create',
  'revenue.edit',
  'revenue_plan.manage',
  'import.run',
  'notification.manage',
  'reports.view',
  'reports.view_cashiers',
  'master_data.manage',
];

export const users: AuthenticatedUser[] = [
  {
    id: ids.director,
    fullName: 'Shohrux Ermanov',
    phone: '+998901112233',
    status: 'active',
    roles: [
      { id: 'role-d', role: 'director', roleName: 'Direktor', branchId: null, branchName: null },
    ],
    permissions: directorPermissions,
    branchScopes: [ids.sayxun, ids.xalqlar],
    writeBranchScopes: [ids.sayxun, ids.xalqlar],
    fixedSalaryUzs: '15000000',
    lastLoginAt: '2026-08-20T09:10:00+05:00',
  },
  {
    id: ids.finance,
    fullName: 'Madina Karimova',
    phone: '+998907778899',
    status: 'active',
    roles: [
      {
        id: 'role-f',
        role: 'finance_manager',
        roleName: 'Moliya rahbari',
        branchId: null,
        branchName: null,
      },
      {
        id: 'role-fc',
        role: 'cashier',
        roleName: 'Kassir',
        branchId: ids.sayxun,
        branchName: 'Sayxun',
      },
    ],
    permissions: financeManagerPermissions,
    branchScopes: [ids.sayxun, ids.xalqlar],
    writeBranchScopes: [ids.sayxun],
    fixedSalaryUzs: '8000000',
    lastLoginAt: '2026-08-20T08:42:00+05:00',
  },
  {
    id: ids.cashierX,
    fullName: 'Dilnoza Qodirova',
    phone: '+998909991122',
    status: 'active',
    roles: [
      {
        id: 'role-cx',
        role: 'cashier',
        roleName: 'Kassir',
        branchId: ids.xalqlar,
        branchName: "Xalqlar do'stligi",
      },
    ],
    permissions: [
      'dashboard.view',
      'expense.view_own_branch',
      'expense.create',
      'revenue.view_own_branch',
      'revenue.create',
      'reports.view',
      'reports.view_own_performance',
    ],
    branchScopes: [ids.xalqlar],
    writeBranchScopes: [ids.xalqlar],
    fixedSalaryUzs: '4500000',
    lastLoginAt: '2026-08-19T17:25:00+05:00',
  },
  {
    id: ids.cashierA,
    fullName: 'Aziza Rahimova',
    phone: '+998935550011',
    status: 'active',
    roles: [
      {
        id: 'role-ca',
        role: 'cashier',
        roleName: 'Kassir',
        branchId: ids.sayxun,
        branchName: 'Sayxun',
      },
    ],
    permissions: [
      'dashboard.view',
      'expense.view_own_branch',
      'expense.create',
      'revenue.view_own_branch',
      'revenue.create',
      'reports.view',
      'reports.view_own_performance',
    ],
    branchScopes: [ids.sayxun],
    writeBranchScopes: [ids.sayxun],
    fixedSalaryUzs: '4500000',
    lastLoginAt: '2026-08-20T07:54:00+05:00',
  },
  {
    id: ids.cashierB,
    fullName: 'Komil Normurodov',
    phone: '+998935550022',
    status: 'inactive',
    roles: [
      {
        id: 'role-cb',
        role: 'cashier',
        roleName: 'Kassir (tarixiy)',
        branchId: ids.sayxun,
        branchName: 'Sayxun',
      },
    ],
    permissions: [],
    branchScopes: [],
    writeBranchScopes: [],
    fixedSalaryUzs: '4200000',
    lastLoginAt: '2026-08-12T18:12:00+05:00',
  },
];

const categoryNames: Array<[string, string, 'fixed' | 'variable']> = [
  ['RENT', 'Ijara', 'fixed'],
  ['STAFF_SALARY', 'Xodimlar oyligi', 'fixed'],
  ['TAX', 'Soliq va ijtimoiy to‘lovlar', 'fixed'],
  ['INTERNET', 'Internet va aloqa', 'fixed'],
  ['UTILITY_SUBSCRIPTION', 'Kommunal abonent to‘lovi', 'fixed'],
  ['SOFTWARE', 'Dasturiy ta’minot va litsenziya', 'fixed'],
  ['ACCOUNTING', 'Buxgalteriya', 'fixed'],
  ['SECURITY', 'Qo‘riqlash', 'fixed'],
  ['TERMINAL', 'Terminal, server, SMS', 'fixed'],
  ['CLEANING', 'Tozalash', 'fixed'],
  ['MENTOR_SALARY', 'Mentorlar oyligi', 'variable'],
  ['KPI', 'KPI va bonus', 'variable'],
  ['MARKETING', 'Marketing', 'variable'],
  ['PRINT', 'Poligrafiya', 'variable'],
  ['STATIONERY', 'Kanselyariya va o‘quv materiallari', 'variable'],
  ['ELECTRICITY', 'Elektr energiyasi', 'variable'],
  ['EQUIPMENT', 'Texnika xaridi', 'variable'],
  ['REPAIR', 'Texnika ta’miri', 'variable'],
  ['EVENT', 'Tadbir', 'variable'],
  ['HOSPITALITY', 'Mehmondorchilik', 'variable'],
  ['TRANSPORT', 'Transport', 'variable'],
  ['TRAINING', 'Malaka oshirish', 'variable'],
  ['TEAM_BUILDING', 'Team-building va HR', 'variable'],
  ['OTHER', 'Boshqa xarajatlar', 'variable'],
  ['GAMIFICATION', 'Gamifikatsiya', 'variable'],
];

export const categories: ExpenseCategory[] = categoryNames.map(
  ([code, name, expenseType], index) => ({
    id: `60000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    code,
    name,
    expenseType,
    isActive: code !== 'GAMIFICATION',
    aliases: code === 'TERMINAL' ? ['Terminal,server,sms', 'Terminal, server, sms'] : [],
  }),
);

export const paymentMethods: MasterItem[] = [
  { id: ids.cash, code: 'CASH', name: 'Naqd pul', isActive: true },
  { id: ids.bank, code: 'BANK', name: 'Bank o‘tkazmasi', isActive: true },
  { id: ids.card, code: 'CARD', name: 'Plastik karta (Uzcard/Humo)', isActive: true },
  {
    id: '40000000-0000-0000-0000-000000000004',
    code: 'CLICK_PAYME',
    name: 'Click/Payme',
    isActive: true,
  },
  {
    id: '40000000-0000-0000-0000-000000000005',
    code: 'CORPORATE_CARD',
    name: 'Korporativ karta',
    isActive: true,
  },
  { id: '40000000-0000-0000-0000-000000000006', code: 'OTHER', name: 'Boshqa', isActive: true },
];

export const departments: MasterItem[] = [
  { id: ids.admin, code: 'ADMIN', name: 'Ma’muriyat', isActive: true },
  {
    id: '50000000-0000-0000-0000-000000000003',
    code: 'EDUCATION',
    name: 'O‘quv bo‘limi',
    isActive: true,
  },
  { id: ids.marketing, code: 'MARKETING', name: 'Marketing', isActive: true },
  {
    id: '50000000-0000-0000-0000-000000000004',
    code: 'SALES',
    name: 'Sotuv (ROP)',
    isActive: true,
  },
  {
    id: '50000000-0000-0000-0000-000000000005',
    code: 'TECH',
    name: 'Texnik ta’minot',
    isActive: true,
  },
  { id: '50000000-0000-0000-0000-000000000006', code: 'HR', name: 'HR', isActive: true },
  { id: ids.general, code: 'GENERAL', name: 'Umumiy', isActive: true },
];

const augustExpenses: Expense[] = [
  [
    'exp-001',
    '2026-08-18',
    ids.sayxun,
    'Sayxun',
    0,
    'Avgust ijara to‘lovi',
    '28000000',
    ids.bank,
    'Bank o‘tkazmasi',
    ids.admin,
    'Ma’muriyat',
  ],
  [
    'exp-002',
    '2026-08-17',
    ids.sayxun,
    'Sayxun',
    12,
    'Instagram reklama kampaniyasi',
    '8500000',
    ids.card,
    'Plastik karta (Uzcard/Humo)',
    ids.marketing,
    'Marketing',
  ],
  [
    'exp-003',
    '2026-08-16',
    ids.xalqlar,
    "Xalqlar do'stligi",
    10,
    'Mentorlar oyligi',
    '18000000',
    ids.bank,
    'Bank o‘tkazmasi',
    ids.general,
    'Umumiy',
  ],
  [
    'exp-004',
    '2026-08-15',
    ids.sayxun,
    'Sayxun',
    1,
    'Ma’muriyat oyligi',
    '24000000',
    ids.bank,
    'Bank o‘tkazmasi',
    ids.admin,
    'Ma’muriyat',
  ],
  [
    'exp-005',
    '2026-08-14',
    ids.xalqlar,
    "Xalqlar do'stligi",
    14,
    'O‘quv materiallari',
    '3200000',
    ids.cash,
    'Naqd pul',
    ids.general,
    'Umumiy',
  ],
  [
    'exp-006',
    '2026-08-13',
    ids.sayxun,
    'Sayxun',
    8,
    'Server va SMS xizmati',
    '2400000',
    ids.card,
    'Plastik karta (Uzcard/Humo)',
    ids.general,
    'Umumiy',
  ],
  [
    'exp-007',
    '2026-08-12',
    ids.xalqlar,
    "Xalqlar do'stligi",
    15,
    'Elektr energiyasi',
    '5100000',
    ids.bank,
    'Bank o‘tkazmasi',
    ids.general,
    'Umumiy',
  ],
  [
    'exp-009',
    '2026-08-12',
    ids.xalqlar,
    "Xalqlar do'stligi",
    2,
    'Avgust soliq va ijtimoiy to‘lovlari',
    '19600000',
    ids.bank,
    'Bank o‘tkazmasi',
    ids.admin,
    'Ma’muriyat',
  ],
  [
    'exp-010',
    '2026-08-12',
    ids.sayxun,
    'Sayxun',
    13,
    'Budjetdan tashqari poligrafiya',
    '1200000',
    ids.cash,
    'Naqd pul',
    ids.marketing,
    'Marketing',
  ],
  [
    'exp-008',
    '2026-08-11',
    ids.sayxun,
    'Sayxun',
    24,
    'Gamifikatsiya sovrinlari',
    '1600000',
    ids.cash,
    'Naqd pul',
    ids.general,
    'Umumiy',
  ],
].map(
  (
    [
      id,
      date,
      branchId,
      branchName,
      categoryIndex,
      description,
      amount,
      paymentMethodId,
      paymentMethodName,
      departmentId,
      departmentName,
    ],
    index,
  ) => {
    const category = categories[Number(categoryIndex)]!;
    return {
      id: String(id),
      transactionDate: String(date),
      periodId: ids.periodAug,
      branchId: String(branchId),
      branchName: String(branchName),
      categoryId: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      expenseTypeSnapshot: category.expenseType,
      description: String(description),
      amountUzs: String(amount),
      paymentMethodId: String(paymentMethodId),
      paymentMethodName: String(paymentMethodName),
      departmentId: String(departmentId),
      departmentName: String(departmentName),
      responsibleUserId: ids.finance,
      responsibleUserName: 'Madina Karimova',
      enteredBy: index % 2 ? ids.cashierX : ids.finance,
      enteredByName: index % 2 ? 'Dilnoza Qodirova' : 'Madina Karimova',
      comment: null,
      sourceSheet: null,
      sourceRow: null,
      createdAt: `${date}T10:20:00+05:00`,
      updatedAt: `${date}T10:20:00+05:00`,
    } as Expense;
  },
);

/** Iyul davri uchun tarixiy nusxa — yopiq davr hisobotlari bo‘sh qolmasligi uchun. */
const julyExpenses: Expense[] = augustExpenses.map((row) => {
  const transactionDate = `2026-07-${row.transactionDate.slice(8, 10)}`;
  const amountUzs = (((BigInt(row.amountUzs) * 92n) / 100n / 1000n) * 1000n).toString();
  return {
    ...row,
    id: `${row.id}-jul`,
    transactionDate,
    periodId: ids.periodJul,
    amountUzs,
    createdAt: `${transactionDate}T10:20:00+05:00`,
    updatedAt: `${transactionDate}T10:20:00+05:00`,
  };
});

export const expenses: Expense[] = [...augustExpenses, ...julyExpenses];

function seedBudgetPlan(
  periodId: string,
  periodLabel: string,
  updatedAt: string,
  factorPercent: bigint,
): BudgetPlan {
  return {
    id: `budget-${periodId}`,
    periodId,
    periodLabel,
    updatedAt,
    updatedByName: 'Madina Karimova',
    lines: categories.slice(0, 10).flatMap((category, index) =>
      branches.map((branch) => {
        const hasPlan = !(category.code === 'SECURITY' && branch.id === ids.xalqlar);
        const base = BigInt((index + 1) * (branch.id === ids.sayxun ? 1_650_000 : 1_400_000));
        const plan =
          category.code === 'CLEANING'
            ? '0'
            : hasPlan
              ? ((base * factorPercent) / 100n).toString()
              : null;
        const actual = String((index + 1) * (branch.id === ids.sayxun ? 600000 : 400000));
        return {
          id: `bl-${periodId}-${category.code}-${branch.code}`,
          branchId: branch.id,
          branchName: branch.name,
          categoryId: category.id,
          categoryCodeSnapshot: category.code,
          categoryNameSnapshot: category.name,
          expenseTypeSnapshot: category.expenseType,
          plannedAmountUzs: plan,
          actualAmountUzs: actual,
          varianceUzs: plan === null ? null : String(BigInt(plan) - BigInt(actual)),
          hasPlan,
        };
      }),
    ),
  };
}

export const budgetPlans: BudgetPlan[] = [
  seedBudgetPlan(ids.periodAug, 'Avgust 2026', '2026-08-01T09:00:00+05:00', 100n),
  seedBudgetPlan(ids.periodJul, 'Iyul 2026', '2026-07-01T09:00:00+05:00', 94n),
];

/** Oylik tushum rejasi (filial × davr). Kunlik/haftalik reja shu summadan bo‘linadi. */
export const revenuePlanSeedUzs: Record<string, Record<string, MoneyUzs>> = {
  [ids.periodAug]: { [ids.sayxun]: '160000000', [ids.xalqlar]: '140000000' },
  [ids.periodJul]: { [ids.sayxun]: '150000000', [ids.xalqlar]: '130000000' },
};

function splitChannels(total: number): { cashUzs: string; cardUzs: string; transferUzs: string } {
  const cash = Math.floor((total * 45) / 100);
  const card = Math.floor((total * 35) / 100);
  return { cashUzs: String(cash), cardUzs: String(card), transferUzs: String(total - cash - card) };
}

function seedDailyRevenues(): DailyRevenue[] {
  const months = [
    { periodId: ids.periodJul, year: 2026, month: 7, lastDay: 31 },
    // Avgust — ochiq davr; demo “bugun” ~20-avgust, shuning uchun oy yarmi to‘ldirilgan.
    { periodId: ids.periodAug, year: 2026, month: 8, lastDay: 20 },
  ];
  const perBranch = [
    {
      branch: branches[0]!,
      base: 4_950_000,
      enteredBy: ids.cashierA,
      enteredByName: 'Aziza Rahimova',
    },
    {
      branch: branches[1]!,
      base: 4_300_000,
      enteredBy: ids.cashierX,
      enteredByName: 'Dilnoza Qodirova',
    },
  ];
  const rows: DailyRevenue[] = [];
  for (const { periodId, year, month, lastDay } of months) {
    for (let day = 1; day <= lastDay; day += 1) {
      const businessDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      for (const { branch, base, enteredBy, enteredByName } of perBranch) {
        const wobble = ((day * 7919 + month * 13) % 13) - 6;
        const total = base + wobble * 90_000;
        const at = `${businessDate}T19:30:00+05:00`;
        rows.push({
          id: `rev-${branch.code.toLowerCase()}-${businessDate}`,
          businessDate,
          periodId,
          branchId: branch.id,
          branchName: branch.name,
          ...splitChannels(total),
          totalUzs: String(total),
          comment: null,
          enteredBy,
          enteredByName,
          createdAt: at,
          updatedAt: at,
        });
      }
    }
  }
  return rows;
}

export const dailyRevenues: DailyRevenue[] = seedDailyRevenues();

/** Yanvar–Iyun 2026 tarixiy oylik agregatlari — oylik diagramma to‘liq ko‘rinishi uchun. */
export const historicalMonthly: Array<{
  month: number;
  expensePlanUzs: MoneyUzs;
  expenseActualUzs: MoneyUzs;
  expenseFixedUzs: MoneyUzs;
  revenuePlanUzs: MoneyUzs;
  revenueActualUzs: MoneyUzs;
}> = [1, 2, 3, 4, 5, 6].map((month, index) => {
  const expenseActualUzs = 101_000_000 + index * 3_400_000;
  return {
    month,
    expensePlanUzs: String(118_000_000 + index * 4_000_000),
    expenseActualUzs: String(expenseActualUzs),
    // Excel «Xulosa»da doimiy ulush ~65–70% atrofida bo‘ladi.
    expenseFixedUzs: String(Math.round((expenseActualUzs * 67) / 100)),
    revenuePlanUzs: String(255_000_000 + index * 6_000_000),
    revenueActualUzs: String(238_000_000 + index * 5_200_000),
  };
});
