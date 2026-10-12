import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetPage } from '@/features/budgets/BudgetPages';
import { authApi, budgetApi, referenceApi, reportApi } from '@/shared/api/contracts';
import type { AuthenticatedUser, BudgetHistory, BudgetPlan } from '@/shared/types/domain';
import { summarizeBudget } from '@/features/budgets/budget-summary';
import { formatMoney as formatMoneyUzs, tashkentBusinessDate } from '@/shared/lib/format';

const formatMoney = (value: string) => formatMoneyUzs(value).replace(/\u00a0/g, ' ');

vi.mock('@/shared/api/contracts', () => ({
  authApi: { me: vi.fn() },
  budgetApi: { get: vi.fn(), history: vi.fn(), saveLines: vi.fn() },
  referenceApi: { periods: vi.fn() },
  reportApi: { monthly: vi.fn() },
}));

const PERIOD = '20000000-0000-4000-8000-000000000008';
const JANUARY_PERIOD = '20000000-0000-4000-8000-000000000001';
const SAYXUN = '10000000-0000-4000-8000-000000000001';
const XALQLAR = '10000000-0000-4000-8000-000000000002';
const RENT = '60000000-0000-4000-8000-000000000001';

const me = {
  id: '30000000-0000-4000-8000-000000000001',
  fullName: 'Direktor',
  phone: '+998900000000',
  status: 'active',
  roles: [],
  permissions: ['budget.view', 'budget.create_edit'],
  branchScopes: [SAYXUN, XALQLAR],
  writeBranchScopes: [SAYXUN, XALQLAR],
  fixedSalaryUzs: '0',
  lastLoginAt: null,
} satisfies AuthenticatedUser;

const plan: BudgetPlan = {
  id: '21000000-0000-4000-8000-000000000008',
  periodId: PERIOD,
  periodLabel: 'Avgust 2026',
  updatedAt: '2026-08-01T09:00:00+05:00',
  updatedByName: 'Direktor',
  lines: [
    {
      id: 'line-sayxun',
      branchId: SAYXUN,
      branchName: 'Sayxun',
      categoryId: RENT,
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara (bino arendasi)',
      expenseTypeSnapshot: 'fixed',
      plannedAmountUzs: '7200000',
      actualAmountUzs: '7000000',
      varianceUzs: '200000',
      hasPlan: true,
      reason: 'Ijara shartnomasi',
    },
    {
      id: 'line-xalqlar',
      branchId: XALQLAR,
      branchName: 'Xalqlar do‘stligi',
      categoryId: RENT,
      categoryCodeSnapshot: 'RENT',
      categoryNameSnapshot: 'Ijara (bino arendasi)',
      expenseTypeSnapshot: 'fixed',
      plannedAmountUzs: '20000000',
      actualAmountUzs: '16680000',
      varianceUzs: '3320000',
      hasPlan: true,
      reason: 'Ijara shartnomasi',
    },
  ],
};

const history: BudgetHistory = {
  year: 2026,
  branches: [
    { id: SAYXUN, code: 'SAYXUN', name: 'Sayxun', isActive: true },
    { id: XALQLAR, code: 'XALQLAR', name: 'Xalqlar do‘stligi', isActive: true },
  ],
  periods: [
    {
      periodId: JANUARY_PERIOD,
      year: 2026,
      month: 1,
      periodLabel: 'Yanvar 2026',
      periodStatus: 'open',
      budgetVersionId: null,
      revisionNo: null,
      versionStatus: null,
      versionReason: null,
      updatedAt: null,
      updatedByName: '',
      rows: [],
      totalsByBranch: [],
      totalPlannedAmountUzs: null,
    },
    {
      periodId: PERIOD,
      year: 2026,
      month: 8,
      periodLabel: 'Avgust 2026',
      periodStatus: 'open',
      budgetVersionId: plan.id,
      revisionNo: 2,
      versionStatus: 'approved',
      versionReason: 'Tasdiqlangan avgust budjeti',
      updatedAt: plan.updatedAt,
      updatedByName: 'Direktor',
      rows: [
        {
          categoryId: RENT,
          categoryCodeSnapshot: 'RENT',
          categoryNameSnapshot: 'Ijara (bino arendasi)',
          expenseTypeSnapshot: 'fixed',
          branches: [
            {
              branchId: SAYXUN,
              branchName: 'Sayxun',
              plannedAmountUzs: '7200000',
              hasPlan: true,
              reason: 'Ijara shartnomasi',
            },
            {
              branchId: XALQLAR,
              branchName: 'Xalqlar do‘stligi',
              plannedAmountUzs: '20000000',
              hasPlan: true,
              reason: 'Ijara shartnomasi',
            },
          ],
          totalPlannedAmountUzs: '27200000',
          reason: 'Ijara shartnomasi',
        },
      ],
      totalsByBranch: [
        {
          branchId: SAYXUN,
          branchName: 'Sayxun',
          plannedAmountUzs: '7200000',
          hasPlan: true,
          reason: null,
        },
        {
          branchId: XALQLAR,
          branchName: 'Xalqlar do‘stligi',
          plannedAmountUzs: '20000000',
          hasPlan: true,
          reason: null,
        },
      ],
      totalPlannedAmountUzs: '27200000',
    },
  ],
};

function renderPage(branch = 'all') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/budgets?period=${PERIOD}&branch=${branch}`]}>
        <Link to={`/budgets?period=${JANUARY_PERIOD}&branch=all`}>Navbar: Yanvar</Link>
        <Link to={`/budgets?period=${PERIOD}&branch=${SAYXUN}`}>Navbar: Sayxun</Link>
        <BudgetPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Budjet sahifasi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(me);
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: JANUARY_PERIOD,
        year: 2026,
        month: 1,
        label: 'Yanvar 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
      {
        id: PERIOD,
        year: 2026,
        month: 8,
        label: 'Avgust 2026',
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);
    vi.mocked(budgetApi.get).mockResolvedValue(plan);
    vi.mocked(budgetApi.history).mockResolvedValue(history);
    vi.mocked(budgetApi.saveLines).mockResolvedValue(plan);
  });

  it('kelajak davri ro‘yxatda birinchi bo‘lsa ham joriy Toshkent oyini tanlaydi', async () => {
    const businessDate = tashkentBusinessDate();
    const currentYear = Number(businessDate.slice(0, 4));
    const currentMonth = Number(businessDate.slice(5, 7));
    const currentPeriodId = '20000000-0000-4000-8000-000000000010';
    const futurePeriodId = '20000000-0000-4000-8000-000000000011';

    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: futurePeriodId,
        year: currentYear + 1,
        month: 12,
        label: `Dekabr ${currentYear + 1}`,
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
      {
        id: currentPeriodId,
        year: currentYear,
        month: currentMonth,
        label: `${currentMonth} / ${currentYear}`,
        status: 'open',
        closedAt: null,
        closedByName: null,
      },
    ]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/budgets?branch=all']}>
          <BudgetPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(budgetApi.get).toHaveBeenCalledWith(currentPeriodId, expect.anything()),
    );
    expect(budgetApi.get).not.toHaveBeenCalledWith(futurePeriodId, expect.anything());
  });

  it('Budjet tarixi sectionini render qilmaydi va navbar davri ishlashda davom etadi', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('region', { name: 'Budjet holati' })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Budjet va amaldagi xarajat' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Budjet dinamikasi' })).toBeInTheDocument();
    expect(screen.queryByText('Budjet tarixi')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Tanlangan oyning amaldagi versiyasi va saqlangan reja tafsilotlari.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Tanlangan oyni CSV yuklab olish/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tarix yili')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /budjet tarixi/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Budjet rejasini tahrirlash' })).toBeInTheDocument();
    expect(screen.queryByText('Filial × kategoriya matritsasi')).not.toBeInTheDocument();

    expect(screen.queryByText('Hisob davri')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Navbar: Yanvar' }));

    await waitFor(() =>
      expect(budgetApi.get).toHaveBeenCalledWith(JANUARY_PERIOD, expect.anything()),
    );
    expect(screen.queryByText('Budjet tarixi')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /budjet tarixi/i })).not.toBeInTheDocument();
  });

  it('izoh/sababni budjet summasi bilan birga backendga yuboradi', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('region', { name: 'Budjet rejasini tahrirlash' });
    await user.click(screen.getAllByRole('button', { name: 'Izohni tahrirlash' })[0]!);
    const reason = screen.getByLabelText('Sayxun, Ijara (bino arendasi) izoh yoki sabab');
    await user.clear(reason);
    await user.type(reason, 'Yangilangan ijara sababi');
    await user.click(screen.getByRole('button', { name: /Saqlash/i }));

    expect(budgetApi.saveLines).toHaveBeenCalledWith(
      PERIOD,
      expect.arrayContaining([
        expect.objectContaining({
          branchId: SAYXUN,
          categoryId: RENT,
          plannedAmountUzs: '7200000',
          reason: 'Yangilangan ijara sababi',
        }),
      ]),
    );
  });

  it('kategoriya kartasi filiallarni birlashtiradi va summani formatlaydi', async () => {
    const user = userEvent.setup();
    renderPage();
    const editor = await screen.findByRole('region', { name: 'Budjet rejasini tahrirlash' });
    const card = within(editor)
      .getByRole('heading', { name: 'Ijara (bino arendasi)' })
      .closest('article');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Sayxun')).toBeInTheDocument();
    expect(within(card!).getByText('Xalqlar do‘stligi')).toBeInTheDocument();
    expect(within(card!).getByText(formatMoney('27200000'))).toBeInTheDocument();
    const amount = within(card!).getByLabelText('Sayxun, Ijara (bino arendasi) reja summasi');
    expect(amount).toHaveValue('7 200 000');
    await user.clear(amount);
    await user.type(amount, '8000000');
    expect(amount).toHaveValue('8 000 000');
    expect(within(card!).getByText(formatMoney('28000000'))).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Budjetni saqlash' })).toHaveTextContent(
      '1 ta o‘zgarish mavjud',
    );
  });

  it('reja yo‘q/mavjud tanlovi va bekor qilish saqlash payloadini buzmaydi', async () => {
    const user = userEvent.setup();
    renderPage();
    const group = await screen.findByRole('group', {
      name: 'Sayxun, Ijara (bino arendasi) reja mavjudligi',
    });
    await user.click(within(group).getByRole('button', { name: 'Reja yo‘q' }));
    expect(
      screen.queryByLabelText('Sayxun, Ijara (bino arendasi) reja summasi'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(within(group).getByRole('button', { name: 'Reja mavjud' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: 'Reja yo‘q' }));
    await user.click(screen.getByRole('button', { name: /^Saqlash$/i }));
    expect(budgetApi.saveLines).toHaveBeenCalledWith(
      PERIOD,
      expect.arrayContaining([
        expect.objectContaining({ branchId: SAYXUN, plannedAmountUzs: null, reason: null }),
        expect.objectContaining({ branchId: XALQLAR, plannedAmountUzs: '20000000' }),
      ]),
    );
  });

  it('selectdan tanlangan kategoriyaning o‘zigina kiritish uchun ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    vi.mocked(budgetApi.get).mockResolvedValue({
      ...plan,
      lines: [
        ...plan.lines,
        {
          ...plan.lines[0]!,
          id: 'marketing',
          categoryId: 'marketing',
          categoryNameSnapshot: 'Marketing',
          expenseTypeSnapshot: 'variable',
        },
      ],
    });
    renderPage();
    const editor = await screen.findByRole('region', { name: 'Budjet rejasini tahrirlash' });
    const categorySelect = within(editor).getByRole('combobox', { name: 'Budjet kategoriyasi' });

    expect(categorySelect).toHaveValue(RENT);
    expect(
      within(editor).getByRole('heading', { name: 'Ijara (bino arendasi)' }),
    ).toBeInTheDocument();
    expect(within(editor).queryByRole('heading', { name: 'Marketing' })).not.toBeInTheDocument();

    await user.selectOptions(categorySelect, 'marketing');
    expect(within(editor).getByRole('heading', { name: 'Marketing' })).toBeInTheDocument();
    expect(
      within(editor).queryByRole('heading', { name: 'Ijara (bino arendasi)' }),
    ).not.toBeInTheDocument();

    await user.selectOptions(categorySelect, RENT);
    expect(
      within(editor).getByRole('heading', { name: 'Ijara (bino arendasi)' }),
    ).toBeInTheDocument();
    expect(within(editor).queryByRole('heading', { name: 'Marketing' })).not.toBeInTheDocument();
  });

  it('juda katta summa rad etiladi, Enter keyingi filial summasiga o‘tadi', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = await screen.findByLabelText('Sayxun, Ijara (bino arendasi) reja summasi');
    const second = screen.getByLabelText('Xalqlar do‘stligi, Ijara (bino arendasi) reja summasi');
    await user.clear(first);
    await user.type(first, '9223372036854775808');
    expect(screen.getByRole('alert')).toHaveTextContent('Summa ruxsat etilgan chegaradan oshdi.');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    await user.keyboard('{Enter}');
    expect(second).toHaveFocus();
  });

  it('saqlash xatosida kiritilgan reja saqlanib qoladi va qayta urinish mumkin', async () => {
    const user = userEvent.setup();
    vi.mocked(budgetApi.saveLines)
      .mockRejectedValueOnce(new Error('internal error'))
      .mockResolvedValue(plan);
    renderPage();
    const amount = await screen.findByLabelText('Sayxun, Ijara (bino arendasi) reja summasi');
    await user.clear(amount);
    await user.type(amount, '8000000');
    await user.click(screen.getByRole('button', { name: /^Saqlash$/i }));
    expect(
      await screen.findByText(
        'Budjetni saqlab bo‘lmadi. Kiritilgan qiymatlar saqlanib turibdi; ruxsat va davr holatini tekshirib, qayta urinib ko‘ring.',
      ),
    ).toBeInTheDocument();
    expect(amount).toHaveValue('8 000 000');
    await user.click(screen.getByRole('button', { name: /^Saqlash$/i }));
    await waitFor(() => expect(budgetApi.saveLines).toHaveBeenCalledTimes(2));
  });

  it('saqlangan budjet KPIlari va filial filtri barcha overview bo‘limlarida bir xil', async () => {
    const user = userEvent.setup();
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Budjet holati' });
    expect(within(hero).getByText(formatMoney('27200000'))).toBeInTheDocument();
    expect(within(hero).getByText(formatMoney('23680000'))).toBeInTheDocument();
    expect(within(hero).getByText(formatMoney('3520000'))).toBeInTheDocument();
    expect(within(hero).getByText('87,05%')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Navbar: Sayxun' }));
    expect(within(hero).getByText(formatMoney('7200000'))).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'Xalqlar do‘stligi budjeti' }),
    ).not.toBeInTheDocument();
    const trend = screen.getByRole('region', { name: 'Budjet dinamikasi' });
    expect(within(trend).getByText(formatMoney('7200000'))).toBeInTheDocument();
    expect(within(trend).queryByText(formatMoney('27200000'))).not.toBeInTheDocument();
  });

  it('doimiy va o‘zgaruvchan budjetni filiallar bo‘yicha ajratib, ulushini ko‘rsatadi', async () => {
    const user = userEvent.setup();
    vi.mocked(budgetApi.get).mockResolvedValue({
      ...plan,
      lines: [
        ...plan.lines,
        {
          ...plan.lines[0]!,
          id: 'variable-sayxun',
          categoryId: 'variable-category',
          categoryNameSnapshot: 'Marketing',
          expenseTypeSnapshot: 'variable',
          plannedAmountUzs: '3000000',
          actualAmountUzs: '1000000',
          varianceUzs: '2000000',
        },
        {
          ...plan.lines[1]!,
          id: 'variable-xalqlar',
          categoryId: 'variable-category',
          categoryNameSnapshot: 'Marketing',
          expenseTypeSnapshot: 'variable',
          plannedAmountUzs: '7000000',
          actualAmountUzs: '2000000',
          varianceUzs: '5000000',
        },
      ],
    });
    renderPage();

    const fixed = await screen.findByRole('region', { name: 'Doimiy xarajatlar' });
    const fixedSayxun = within(fixed).getByRole('article', {
      name: 'Doimiy xarajatlar — Sayxun',
    });
    const fixedXalqlar = within(fixed).getByRole('article', {
      name: 'Doimiy xarajatlar — Xalqlar do‘stligi',
    });
    expect(fixedSayxun).toHaveTextContent(formatMoney('7200000'));
    expect(fixedSayxun).toHaveTextContent('26,47%');
    expect(fixedXalqlar).toHaveTextContent(formatMoney('20000000'));
    expect(fixedXalqlar).toHaveTextContent('73,53%');

    const variable = screen.getByRole('region', { name: 'O‘zgaruvchan xarajatlar' });
    expect(
      within(variable).getByRole('article', { name: 'O‘zgaruvchan xarajatlar — Sayxun' }),
    ).toHaveTextContent('30%');
    expect(
      within(variable).getByRole('article', {
        name: 'O‘zgaruvchan xarajatlar — Xalqlar do‘stligi',
      }),
    ).toHaveTextContent('70%');

    await user.click(screen.getByRole('link', { name: 'Navbar: Sayxun' }));
    expect(
      within(fixed).queryByRole('article', { name: 'Doimiy xarajatlar — Xalqlar do‘stligi' }),
    ).not.toBeInTheDocument();
    expect(fixedSayxun).toHaveTextContent('100%');
  });

  it('tahrirdagi summa hero qiymatini saqlashdan oldin o‘zgartirmaydi va boshqa filial rejasi yo‘qolmaydi', async () => {
    const user = userEvent.setup();
    renderPage(SAYXUN);
    const amount = await screen.findByLabelText('Sayxun, Ijara (bino arendasi) reja summasi');
    await user.clear(amount);
    await user.type(amount, '8000000');
    expect(screen.getByText(/Saqlanmagan o‘zgarishlar bor/)).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Budjet holati' });
    expect(within(hero).getByText(formatMoney('7200000'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Saqlash/i }));
    expect(budgetApi.saveLines).toHaveBeenCalledWith(
      PERIOD,
      expect.arrayContaining([
        expect.objectContaining({ branchId: SAYXUN, plannedAmountUzs: '8000000' }),
        expect.objectContaining({ branchId: XALQLAR, plannedAmountUzs: '20000000' }),
      ]),
    );
  });

  it('API xatosi texnik tafsilotlarni oshkor qilmaydi va qayta urinish ishlaydi', async () => {
    vi.mocked(budgetApi.get)
      .mockRejectedValueOnce(new Error('private SQL details'))
      .mockResolvedValue(plan);
    renderPage();
    expect(await screen.findByText('Budjet ma’lumotlarini yuklab bo‘lmadi.')).toBeInTheDocument();
    expect(screen.queryByText('private SQL details')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Qayta/i }));
    expect(await screen.findByRole('region', { name: 'Budjet holati' })).toBeInTheDocument();
  });

  it('yuklanishda soxta KPI chiqmaydi', async () => {
    vi.mocked(budgetApi.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByRole('status', { name: 'Budjet yuklanmoqda' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Budjet holati' })).not.toBeInTheDocument();
  });

  it('rejasiz xarajatni ogohlantiradi, reja yo‘qligini nol bilan almashtirmaydi', async () => {
    vi.mocked(budgetApi.get).mockResolvedValue({
      ...plan,
      lines: [{ ...plan.lines[0]!, hasPlan: false, plannedAmountUzs: null, varianceUzs: null }],
    });
    renderPage();
    const hero = await screen.findByRole('region', { name: 'Budjet holati' });
    expect(within(hero).getByText(/Budjet ma’lumotlari mavjud emas/)).toBeInTheDocument();
    expect(screen.getByText(/Budjet rejasi hali kiritilmagan/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Budjet ogohlantirishlari' })).toHaveTextContent(
      'reja kiritilmagan',
    );
    expect(
      screen.queryByText(/Ko‘rsatilgan qatorlarda rejadan oshish aniqlanmadi/),
    ).not.toBeInTheDocument();
  });

  it('tahrir huquqi yo‘q foydalanuvchi uchun saqlash ochilmaydi', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ ...me, permissions: ['budget.view'] });
    renderPage();
    await screen.findByRole('region', { name: 'Budjet holati' });
    expect(screen.queryByRole('button', { name: /Saqlash/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('yirik summalar, nol reja va rejadan oshish aniq hisoblanadi', () => {
    const rows = [
      {
        ...plan.lines[0]!,
        plannedAmountUzs: '9007199254740993',
        actualAmountUzs: '9007199254740992',
      },
      { ...plan.lines[1]!, plannedAmountUzs: '0', actualAmountUzs: '2' },
    ];
    expect(summarizeBudget(rows)).toMatchObject({
      budget: 9007199254740993n,
      actual: 9007199254740994n,
      remaining: -1n,
    });
    expect(summarizeBudget([rows[1]!])).toMatchObject({
      budget: 0n,
      percent: null,
      remaining: -2n,
    });
    expect(summarizeBudget([])).toMatchObject({ budget: null, percent: null, remaining: null });
  });

  it('yopilgan oy tahrir huquqi bo‘lsa ham faqat ko‘rsatiladi', async () => {
    vi.mocked(referenceApi.periods).mockResolvedValue([
      {
        id: PERIOD,
        year: 2026,
        month: 8,
        label: 'Avgust 2026',
        status: 'closed',
        closedAt: plan.updatedAt,
        closedByName: 'Direktor',
      },
    ]);
    renderPage();
    await screen.findByRole('region', { name: 'Budjet holati' });
    expect(
      screen.getByText('Yopilgan davr budjeti tahrirlanmaydi, faqat ko‘rish mumkin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Saqlash/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('fakt trendi mavjud oylik API va filial query kontekstidan olinadi', async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      ...me,
      permissions: [...me.permissions, 'reports.view'],
    });
    vi.mocked(reportApi.monthly).mockImplementation(async ({ year, branch }) => {
      // All branches exceed the 27.2m budget, while Sayxun remains below its
      // own 7.2m budget. This covers both variance labels in one branch-flow.
      const actual = branch === 'all' ? '30000000' : '7000000';
      const total = {
        hasPlan: false,
        plannedAmountUzs: null,
        actualAmountUzs: actual,
        varianceUzs: null,
        completionPercent: null,
        status: 'no_plan' as const,
      };
      return {
        year: Number(year),
        branchFilter: branch,
        averagePolicy: { code: 'months_with_actual', label: 'Fakt mavjud oylar', denominator: 1 },
        totals: { overall: total, fixed: total, variable: { ...total, actualAmountUzs: '0' } },
        rows: [
          {
            category: { id: RENT, name: 'Ijara', code: 'RENT', expenseTypeSnapshot: 'fixed' },
            months: Array.from({ length: 12 }, (_, index) => ({
              month: index + 1,
              planActual: { ...total, actualAmountUzs: index === 7 ? actual : '0' },
              transactionCount: index === 7 ? 1 : 0,
            })),
            annual: { ...total, transactionCount: 1 },
          },
        ],
      };
    });
    renderPage();
    const trend = await screen.findByRole('region', { name: 'Budjet dinamikasi' });
    expect(await within(trend).findByText(formatMoney('30000000'))).toBeInTheDocument();
    expect(within(trend).getByText(`${formatMoney('2800000')} oshdi`)).toBeInTheDocument();
    expect(reportApi.monthly).toHaveBeenCalledWith(
      { year: 2026, branch: 'all' },
      expect.any(AbortSignal),
    );
    await userEvent.click(screen.getByRole('link', { name: 'Navbar: Sayxun' }));
    expect(await within(trend).findByText(formatMoney('7000000'))).toBeInTheDocument();
    expect(within(trend).getByText(`${formatMoney('200000')} qoldi`)).toBeInTheDocument();
    expect(within(trend).queryByText(formatMoney('30000000'))).not.toBeInTheDocument();
    expect(reportApi.monthly).toHaveBeenLastCalledWith(
      { year: 2026, branch: SAYXUN },
      expect.any(AbortSignal),
    );
  });

  it('Budjet dinamikasi yilning barcha 12 oyini ixcham ko‘rsatadi', async () => {
    renderPage();
    const trend = await screen.findByRole('region', { name: 'Budjet dinamikasi' });
    const months = within(within(trend).getByRole('list', { name: 'Oylar' })).getAllByRole(
      'listitem',
    );

    expect(months).toHaveLength(12);
    // Months after the selected one are listed too; the old view stopped at it.
    expect(within(months[11]!).getByText('Dekabr')).toBeInTheDocument();
    expect(months[7]).toHaveAttribute('aria-current', 'true');
    expect(within(months[7]!).getByText(formatMoney('27200000'))).toBeInTheDocument();
    // A month with no budget shows a dash, not a long sentence on every row.
    expect(within(months[0]!).getByText('—')).toBeInTheDocument();
    expect(within(trend).queryByText('Reja mavjud emas')).not.toBeInTheDocument();
  });
});
