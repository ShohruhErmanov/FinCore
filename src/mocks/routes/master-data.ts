import { http, HttpResponse } from 'msw';
import { branches } from '../fixtures';
import { API, db } from '../state';
import { grantCreatorBranchScope, hasPermission, ok, problem, requireUser } from '../support/http';
import { baselineCells, buildBaselineBoard } from '../data/budget';
import { isNonNegativeMoney } from '../support/money';

export const masterDataHandlers = [
  // Scope filtrsiz: Sozlamalar ro'yxatning o'zini boshqaradi.
  http.get(`${API}/master/branches`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Sozlamalarni boshqarish huquqi yo‘q.');
    return ok(branches);
  }),
  // --- Director baseline plan grid (Excel «Sozlamalar» D/E/F ustunlari) ----
  http.get(`${API}/master/category-baselines`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Sozlamalarni boshqarish huquqi yo‘q.');
    return ok(buildBaselineBoard());
  }),
  http.put(`${API}/master/category-baselines`, async ({ request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Sozlamalarni boshqarish huquqi yo‘q.');
    const body = (await request.json()) as {
      lines?: Array<{ categoryId: string; branchId: string; amountUzs: string }>;
    };
    const seen = new Set<string>();
    for (const line of body.lines ?? []) {
      if (!isNonNegativeMoney(line.amountUzs))
        return problem(422, 'AMOUNT_INVALID', 'Summa manfiy bo‘lmagan butun so‘m bo‘lsin.');
      const key = `${line.categoryId}:${line.branchId}`;
      if (seen.has(key))
        return problem(409, 'DUPLICATE_CELL', 'Bitta katak ikki marta yuborilgan.');
      seen.add(key);
      baselineCells[key] = line.amountUzs;
    }
    return ok(buildBaselineBoard());
  }),
  http.post(`${API}/master/:kind`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Master data boshqaruvi uchun ruxsat yo‘q.');
    const body = (await request.json()) as {
      code?: string;
      name?: string;
      expenseType?: 'fixed' | 'variable';
    };
    if (!body.code?.trim() || !body.name?.trim())
      return problem(422, 'VALIDATION_ERROR', 'Kod va nom majburiy.');
    const normalizedCode = body.code.trim().toUpperCase();
    const targetRows =
      params.kind === 'categories'
        ? db.categoryRows
        : params.kind === 'departments'
          ? db.departmentRows
          : params.kind === 'payment-methods'
            ? db.paymentMethodRows
            : params.kind === 'branches'
              ? branches
              : null;
    if (!targetRows) return problem(404, 'MASTER_KIND_NOT_FOUND', 'Master data turi topilmadi.');
    if (targetRows.some((item) => item.code.toUpperCase() === normalizedCode))
      return problem(409, 'DUPLICATE_REFERENCE', 'Bu master-data kodi allaqachon mavjud.');
    const base = {
      id: `master-${Date.now()}`,
      code: normalizedCode,
      name: body.name.trim(),
      isActive: true,
    };
    if (params.kind === 'categories') {
      const created = { ...base, expenseType: body.expenseType ?? 'variable', aliases: [] };
      db.categoryRows = [...db.categoryRows, created];
      return ok(created, 201);
    }
    if (params.kind === 'departments') {
      db.departmentRows = [...db.departmentRows, base];
      return ok(base, 201);
    }
    if (params.kind === 'payment-methods') {
      db.paymentMethodRows = [...db.paymentMethodRows, base];
      return ok(base, 201);
    }
    if (params.kind === 'branches') {
      // The fixture array is shared by reference, so it is mutated in place.
      branches.push(base);
      grantCreatorBranchScope(user, base.id);
      return ok(base, 201);
    }
    return problem(404, 'MASTER_KIND_NOT_FOUND', 'Master data turi topilmadi.');
  }),
  http.patch(`${API}/master/:kind/:id`, async ({ params, request }) => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'master_data.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Master data boshqaruvi uchun ruxsat yo‘q.');
    const body = (await request.json()) as {
      isActive?: boolean;
      name?: string;
      expenseType?: 'fixed' | 'variable';
    };
    const rows =
      params.kind === 'categories'
        ? db.categoryRows
        : params.kind === 'departments'
          ? db.departmentRows
          : params.kind === 'payment-methods'
            ? db.paymentMethodRows
            : params.kind === 'branches'
              ? branches
              : null;
    const item = rows?.find((row) => row.id === params.id);
    if (!item) return problem(404, 'MASTER_ITEM_NOT_FOUND', 'Master data elementi topilmadi.');
    if (typeof body.isActive === 'boolean') item.isActive = body.isActive;
    if (body.name?.trim()) item.name = body.name.trim();
    if (params.kind === 'categories' && body.expenseType && 'expenseType' in item)
      item.expenseType = body.expenseType;
    return ok(item);
  }),
];
