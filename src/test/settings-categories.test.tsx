import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesPage } from '@/features/admin/settings-pages';
import { ApiError } from '@/shared/api/client';
import type { CategoryBaselineBoard, ExpenseCategory } from '@/shared/types/domain';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  categories: vi.fn(),
  categoryBaselines: vi.fn(),
  updateMaster: vi.fn(),
  saveCategoryBaselines: vi.fn(),
  createMaster: vi.fn(),
}));

vi.mock('@/features/auth/auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/shared/api/contracts', () => ({
  referenceApi: { categories: mocks.categories },
  adminApi: {
    categoryBaselines: mocks.categoryBaselines,
    updateMaster: mocks.updateMaster,
    saveCategoryBaselines: mocks.saveCategoryBaselines,
    createMaster: mocks.createMaster,
  },
}));

const categoryId = '60000000-0000-4000-8000-000000000001';
const branchId = '10000000-0000-4000-8000-000000000001';
let board: CategoryBaselineBoard;

function renderPage(canManage = true) {
  mocks.useAuth.mockReturnValue({ hasPermission: () => canManage });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings/categories']}>
        <CategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Xarajat kategoriyalari boshqaruvi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    board = {
      branches: [{ branchId, code: 'SAYXUN', name: 'Sayxun' }],
      rows: [
        {
          categoryId,
          code: 'RENT',
          name: 'Ijara',
          expenseType: 'fixed',
          isActive: true,
          amounts: { [branchId]: '7200000' },
          totalUzs: '7200000',
        },
      ],
      totals: { byBranch: { [branchId]: '7200000' }, grandTotalUzs: '7200000' },
    };
    mocks.categories.mockImplementation(async () =>
      board.rows.map(
        (row): ExpenseCategory => ({
          id: row.categoryId,
          code: row.code,
          name: row.name,
          expenseType: row.expenseType,
          isActive: row.isActive,
          aliases: [],
        }),
      ),
    );
    mocks.categoryBaselines.mockImplementation(async () => structuredClone(board));
    mocks.updateMaster.mockImplementation(
      async (
        _kind: string,
        id: string,
        body: { name?: string; expenseType?: 'fixed' | 'variable'; isActive?: boolean },
      ) => {
        const row = board.rows.find((item) => item.categoryId === id)!;
        Object.assign(row, body);
        return {
          id,
          code: row.code,
          name: row.name,
          expenseType: row.expenseType,
          isActive: row.isActive,
          aliases: [],
        };
      },
    );
  });

  it('nom va tur tahririni mavjud PATCH API orqali saqlaydi', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ijara kategoriyasini tahrirlash' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Kategoriyani tahrirlash' });
    await user.clear(within(dialog).getByRole('textbox', { name: /Kategoriya nomi/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Kategoriya nomi/ }),
      'Yangi ijara',
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: /Xarajat turi/ }),
      'variable',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(mocks.updateMaster).toHaveBeenCalledWith('categories', categoryId, {
        name: 'Yangi ijara',
        expenseType: 'variable',
      }),
    );
    expect(await screen.findByText('Yangi ijara')).toBeInTheDocument();
    expect(board.rows[0]?.expenseType).toBe('variable');
  });

  it('o‘chirish tasdiqini talab qiladi, tarixni saqlab nofaol qiladi va tiklaydi', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ijara kategoriyasini o‘chirish' }));
    let dialog = screen.getByRole('dialog', { name: 'Kategoriyani o‘chirish' });
    expect(dialog).toHaveTextContent('Tarixiy xarajatlar va budjet yozuvlari o‘chirilmaydi');
    await user.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }));
    expect(mocks.updateMaster).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ijara kategoriyasini o‘chirish' }));
    dialog = screen.getByRole('dialog', { name: 'Kategoriyani o‘chirish' });
    await user.click(within(dialog).getByRole('button', { name: 'O‘chirish' }));
    await waitFor(() =>
      expect(mocks.updateMaster).toHaveBeenCalledWith('categories', categoryId, {
        isActive: false,
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Nofaol kategoriyalar (1)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ijara kategoriyasini tahrirlash' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nofaol kategoriyalar (1)' }));
    expect(screen.getByText('Ijara')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Ijara kategoriyasini qayta faollashtirish' }),
    );
    await waitFor(() =>
      expect(mocks.updateMaster).toHaveBeenCalledWith('categories', categoryId, { isActive: true }),
    );
  });

  it('kategoriya amallari boshlang‘ich reja summasini saqlashni buzmaydi', async () => {
    const user = userEvent.setup();
    mocks.saveCategoryBaselines.mockImplementation(
      async (lines: Array<{ categoryId: string; branchId: string; amountUzs: string }>) => {
        board.rows[0]!.amounts[branchId] = lines[0]!.amountUzs;
        return structuredClone(board);
      },
    );
    renderPage();
    const amount = await screen.findByLabelText('Ijara — Sayxun');
    await user.clear(amount);
    await user.type(amount, '8300000');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(mocks.saveCategoryBaselines).toHaveBeenCalledWith([
        { categoryId, branchId, amountUzs: '8300000' },
      ]),
    );
  });

  it('tahrirlash xatosini ko‘rsatadi va kategoriyani o‘zgartirmaydi', async () => {
    const user = userEvent.setup();
    mocks.updateMaster.mockRejectedValueOnce(
      new ApiError(409, { code: 'UPDATE_REJECTED', message: 'Saqlash rad etildi' }),
    );
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Ijara kategoriyasini tahrirlash' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Kategoriyani tahrirlash' });
    await user.clear(within(dialog).getByRole('textbox', { name: /Kategoriya nomi/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Kategoriya nomi/ }),
      'Yangi ijara',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Saqlash' }));
    expect(await within(dialog).findByText('Saqlash rad etildi')).toBeInTheDocument();
    expect(board.rows[0]?.name).toBe('Ijara');
  });

  it('boshqarish ruxsatisiz tahrirlash va o‘chirishni ko‘rsatmaydi', async () => {
    renderPage(false);
    expect(
      await screen.findByRole('heading', { name: 'Xarajat kategoriyalari' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /kategoriyasini o‘chirish/ }),
    ).not.toBeInTheDocument();
    expect(mocks.categoryBaselines).not.toHaveBeenCalled();
  });
});
