import { http, HttpResponse } from 'msw';
import type { AuthenticatedUser, UserAccessUpdateInput } from '@/shared/types/domain';
import { branches } from '../fixtures';
import { API, db, rolePermissionRows } from '../state';
import { hasPermission, hasRole, ok, problem, requireUser } from '../support/http';
import { isNonNegativeMoney } from '../support/money';
import { investorEntitlementRows, investorProfiles } from '../data/investors';

export const adminHandlers = [
  http.get(`${API}/admin/users`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    if (!hasPermission(user, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchilarni ko‘rish huquqi yo‘q.');
    return ok(db.userRows);
  }),
  http.patch(`${API}/users/:id/salary`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Oylikni o‘zgartirish huquqi yo‘q.');
    const item = db.userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    const body = (await request.json()) as { fixedSalaryUzs?: string };
    if (!isNonNegativeMoney(body.fixedSalaryUzs))
      return problem(422, 'AMOUNT_INVALID', 'Oylik manfiy bo‘lmagan butun so‘m bo‘lishi kerak.');
    item.fixedSalaryUzs = body.fixedSalaryUzs;
    if (db.signedInUser?.id === item.id) db.signedInUser = structuredClone(item);
    return ok(item);
  }),
  http.post(`${API}/users`, async ({ request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchi yaratish huquqi yo‘q.');
    const body = (await request.json()) as {
      fullName?: string;
      phone?: string;
      role?: AuthenticatedUser['roles'][number]['role'];
      branchId?: string | null;
      cashierBranchId?: string | null;
      ownershipPercent?: number;
      entitledAmountUzs?: string;
      password?: string;
      confirmPassword?: string;
    };
    if (!body.fullName?.trim() || !body.phone?.trim() || !body.role)
      return problem(422, 'VALIDATION_ERROR', 'Ism, telefon va rol majburiy.');
    if ((body.password ?? '').length < 12)
      return problem(422, 'VALIDATION_ERROR', 'Parol kamida 12 belgidan iborat bo\u2018lsin.');
    if (body.password !== body.confirmPassword)
      return problem(422, 'PASSWORD_MISMATCH', 'Parol va tasdiqlash mos emas.');
    if (body.role === 'investor') {
      const percent = body.ownershipPercent;
      if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100)
        return problem(
          422,
          'OWNERSHIP_PERCENT_INVALID',
          'Ulush 0 va 100 foiz orasida bo\u2018lishi kerak.',
        );
    }
    if (body.role === 'director' && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );
    if (
      db.userRows.some((item) => item.phone.replace(/\D/g, '') === body.phone!.replace(/\D/g, ''))
    )
      return problem(409, 'DUPLICATE_REFERENCE', 'Bu telefon raqam allaqachon mavjud.');
    const cashierScopeId = body.role === 'cashier' ? body.branchId : body.cashierBranchId;
    const branch = cashierScopeId
      ? branches.find((item) => item.id === cashierScopeId && item.isActive)
      : null;
    if (body.role === 'cashier' && !branch)
      return problem(422, 'BRANCH_REQUIRED', 'Kassir uchun filial scope majburiy.');
    if (cashierScopeId && !branch)
      return problem(422, 'BRANCH_INVALID', 'Kassir filial scope’i topilmadi.');
    const assignedRoles: AuthenticatedUser['roles'] = [
      {
        id: `role-${Date.now()}`,
        role: body.role,
        roleName:
          body.role === 'cashier'
            ? 'Kassir'
            : body.role === 'director'
              ? 'Direktor'
              : body.role === 'investor'
                ? 'Investor'
                : 'Moliya rahbari',
        branchId: body.role === 'cashier' ? (branch?.id ?? null) : null,
        branchName: body.role === 'cashier' ? (branch?.name ?? null) : null,
      },
    ];
    if (body.role === 'finance_manager' && branch)
      assignedRoles.push({
        id: `role-cashier-${Date.now()}`,
        role: 'cashier',
        roleName: 'Kassir',
        branchId: branch.id,
        branchName: branch.name,
      });
    const created: AuthenticatedUser = {
      id: `user-${Date.now()}`,
      fullName: body.fullName.trim(),
      phone: body.phone.trim(),
      status: 'active',
      roles: assignedRoles,
      permissions: [
        ...new Set(assignedRoles.flatMap((assignment) => rolePermissionRows[assignment.role])),
      ],
      branchScopes:
        body.role === 'investor'
          ? []
          : body.role === 'cashier' && branch
            ? [branch.id]
            : branches.map((item) => item.id),
      writeBranchScopes:
        body.role === 'director' ? branches.map((item) => item.id) : branch ? [branch.id] : [],
      fixedSalaryUzs: '0',
      lastLoginAt: null,
    };
    db.userRows = [...db.userRows, created];
    if (body.role === 'investor') {
      const investorId = `investor-${Date.now()}`;
      investorProfiles.push({
        id: investorId,
        userId: created.id,
        fullName: created.fullName,
        phone: created.phone,
        ownershipPercent: body.ownershipPercent ?? 0,
        branch: body.branchId ? (branches.find((item) => item.id === body.branchId) ?? null) : null,
        isActive: true,
      });
      if (body.entitledAmountUzs)
        investorEntitlementRows[investorId] = {
          [`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`]:
            body.entitledAmountUzs,
        };
    }
    return ok(created, 201);
  }),
  // Mirrors AdminUsersService.updatePassword. The mock keeps no passwords
  // (login accepts the shared demo one), so it only validates and answers 204.
  http.put(`${API}/users/:id/password`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchi parolini boshqarish huquqi yo‘q.');
    const item = db.userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    const self = item.id === actor.id;
    if (!self && hasRole(item, 'director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor parolini faqat direktor o‘zgartirishi mumkin.',
      );
    const body = (await request.json()) as {
      password?: string;
      confirmPassword?: string;
      currentPassword?: string;
    };
    if ((body.password ?? '').length < 12)
      return problem(400, 'VALIDATION_ERROR', 'Parol kamida 12 belgidan iborat bo‘lishi kerak');
    if (body.password !== body.confirmPassword)
      return problem(422, 'PASSWORD_MISMATCH', 'Parol va tasdiqlash mos emas.');
    if (self && !body.currentPassword)
      return problem(
        422,
        'CURRENT_PASSWORD_REQUIRED',
        'O‘z parolingizni o‘zgartirish uchun joriy parolni kiriting.',
      );
    if (self && body.currentPassword !== 'demo123')
      return problem(422, 'CURRENT_PASSWORD_INVALID', 'Joriy parol noto‘g‘ri.');
    return new HttpResponse(null, { status: 204 });
  }),
  http.put(`${API}/users/:id/access`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchi accessini boshqarish huquqi yo‘q.');
    const item = db.userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    if (hasRole(item, 'director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor accessini faqat direktor boshqarishi mumkin.',
      );
    const body = (await request.json()) as Partial<UserAccessUpdateInput>;
    if (!Array.isArray(body.roles) || body.roles.length === 0)
      return problem(422, 'ROLE_REQUIRED', 'Kamida bitta rol biriktirilishi kerak.');
    const roleCodes = body.roles.map((assignment) => assignment.role);
    if (new Set(roleCodes).size !== roleCodes.length)
      return problem(409, 'DUPLICATE_ROLE', 'Bitta rol takroran biriktirilmaydi.');
    if (roleCodes.includes('director') && roleCodes.length > 1)
      return problem(422, 'ROLE_COMBINATION_INVALID', 'Direktor roli alohida access modeli.');
    if (roleCodes.includes('director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor rolini faqat amaldagi direktor biriktirishi mumkin.',
      );
    if (
      hasRole(item, 'director') &&
      !roleCodes.includes('director') &&
      item.status === 'active' &&
      db.userRows.filter(
        (candidate) => candidate.status === 'active' && hasRole(candidate, 'director'),
      ).length === 1
    )
      return problem(409, 'LAST_DIRECTOR_REQUIRED', 'Oxirgi faol direktor roli olib tashlanmaydi.');
    const invalidAssignment = body.roles.find((assignment) => {
      if (!['cashier', 'finance_manager', 'director'].includes(assignment.role)) return true;
      if (assignment.role !== 'cashier') return assignment.branchId !== null;
      return (
        !assignment.branchId ||
        !branches.some((branch) => branch.id === assignment.branchId && branch.isActive)
      );
    });
    if (invalidAssignment)
      return problem(
        422,
        'ROLE_SCOPE_INVALID',
        'Kassirga faol filial, markaz rollariga esa null filial scope berilishi kerak.',
      );
    const roles: AuthenticatedUser['roles'] = body.roles.map((assignment, index) => {
      const branch = assignment.branchId
        ? branches.find((candidate) => candidate.id === assignment.branchId)
        : null;
      return {
        id: `role-access-${item.id}-${index + 1}`,
        role: assignment.role,
        roleName:
          assignment.role === 'cashier'
            ? 'Kassir'
            : assignment.role === 'finance_manager'
              ? 'Moliya rahbari'
              : 'Direktor',
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
      };
    });
    const centerRead = roles.some(
      (assignment) => assignment.role === 'director' || assignment.role === 'finance_manager',
    );
    const cashierBranches = [
      ...new Set(
        roles.flatMap((assignment) =>
          assignment.role === 'cashier' && assignment.branchId ? [assignment.branchId] : [],
        ),
      ),
    ];
    item.roles = roles;
    item.permissions = [
      ...new Set(roles.flatMap((assignment) => rolePermissionRows[assignment.role])),
    ];
    item.branchScopes = centerRead ? branches.map((branch) => branch.id) : cashierBranches;
    item.writeBranchScopes = roles.some((assignment) => assignment.role === 'director')
      ? branches.map((branch) => branch.id)
      : cashierBranches;
    if (db.signedInUser?.id === item.id) db.signedInUser = structuredClone(item);
    return ok(item);
  }),
  http.patch(`${API}/users/:id/status`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.deactivate'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchini nofaol qilish huquqi yo‘q.');
    const item = db.userRows.find((row) => row.id === params.id);
    if (!item) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    if (hasRole(item, 'director') && !hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Direktor statusini faqat direktor boshqarishi mumkin.',
      );
    const body = (await request.json()) as { status?: AuthenticatedUser['status'] };
    if (!body.status || !['active', 'inactive', 'blocked'].includes(body.status))
      return problem(
        422,
        'VALIDATION_ERROR',
        'Yangi status active, inactive yoki blocked bo‘lsin.',
      );
    if (actor.id === item.id && body.status !== 'active')
      return problem(
        409,
        'SELF_DEACTIVATION_DENIED',
        'Foydalanuvchi o‘z hisobini nofaol yoki bloklangan holatga o‘tkaza olmaydi.',
      );
    if (
      item.status === 'active' &&
      body.status !== 'active' &&
      hasRole(item, 'director') &&
      db.userRows.filter(
        (candidate) => candidate.status === 'active' && hasRole(candidate, 'director'),
      ).length === 1
    )
      return problem(
        409,
        'LAST_DIRECTOR_REQUIRED',
        'Oxirgi faol direktor bloklanmaydi yoki nofaol qilinmaydi.',
      );
    item.status = body.status;
    return ok(item);
  }),
  http.delete(`${API}/users/:id`, ({ params }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'user.delete'))
      return problem(403, 'PERMISSION_DENIED', 'Foydalanuvchini o‘chirish huquqi yo‘q.');
    const index = db.userRows.findIndex((row) => row.id === params.id);
    if (index < 0) return problem(404, 'USER_NOT_FOUND', 'Foydalanuvchi topilmadi.');
    const item = db.userRows[index]!;
    if (actor.id === item.id)
      return problem(
        409,
        'SELF_DELETE_DENIED',
        'Foydalanuvchi o‘z hisobini butunlay o‘chira olmaydi.',
      );
    if (
      item.status === 'active' &&
      hasRole(item, 'director') &&
      db.userRows.filter(
        (candidate) => candidate.status === 'active' && hasRole(candidate, 'director'),
      ).length === 1
    )
      return problem(409, 'LAST_DIRECTOR_REQUIRED', 'Oxirgi faol direktorni o‘chirib bo‘lmaydi.');
    // Historical mock expense/revenue rows intentionally remain. The real DB
    // keeps their actor UUIDs through fincore.user_identities; only the account
    // and its embedded authorization assignments disappear here.
    db.userRows.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API}/roles/permissions`, () => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'role.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Rollarni ko‘rish huquqi yo‘q.');
    return ok(rolePermissionRows);
  }),
  http.put(`${API}/roles/:role/permissions`, async ({ params, request }) => {
    const actor = requireUser();
    if (actor instanceof HttpResponse) return actor;
    if (!hasPermission(actor, 'role.manage'))
      return problem(403, 'PERMISSION_DENIED', 'Rollarni boshqarish huquqi yo‘q.');
    if (!hasRole(actor, 'director'))
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Rol ruxsatlarini faqat amaldagi direktor o‘zgartirishi mumkin.',
      );
    const body = (await request.json()) as { permissions?: AuthenticatedUser['permissions'] };
    if (!body.permissions) return problem(422, 'VALIDATION_ERROR', 'Ruxsatlar ro‘yxati majburiy.');
    const role = String(params.role) as AuthenticatedUser['roles'][number]['role'];
    if (!(role in rolePermissionRows)) return problem(404, 'ROLE_NOT_FOUND', 'Rol topilmadi.');
    if (role === 'business_owner')
      return problem(
        403,
        'BUSINESS_OWNER_ROLE_IMMUTABLE',
        'Biznes egasi ruxsatlari strategik read-only siyosat bilan himoyalangan.',
      );
    if (
      role !== 'director' &&
      body.permissions.some(
        (permission) => permission === 'user.deactivate' || permission === 'user.delete',
      )
    )
      return problem(
        403,
        'PRIVILEGE_ESCALATION_DENIED',
        'Foydalanuvchi lifecycle ruxsatlari faqat Direktor roliga biriktiriladi.',
      );
    rolePermissionRows[role] = [...new Set(body.permissions)];
    db.userRows.forEach((user) => {
      user.permissions = [
        ...new Set(user.roles.flatMap((assignment) => rolePermissionRows[assignment.role])),
      ];
    });
    if (db.signedInUser) {
      const refreshed = db.userRows.find((user) => user.id === db.signedInUser?.id);
      if (refreshed) db.signedInUser = structuredClone(refreshed);
    }
    return ok({ role, permissions: rolePermissionRows[role] });
  }),
];
