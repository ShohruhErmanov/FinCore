import { http, HttpResponse } from 'msw';
import type { UserDirectoryItem } from '@/shared/types/domain';
import { branches } from '../fixtures';
import { API, db, periodRows } from '../state';
import { canUseBranch, ok, requireUser } from '../support/http';

export const referenceHandlers = [
  http.get(`${API}/branches`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    return ok(branches.filter((branch) => canUseBranch(user, branch.id)));
  }),
  http.get(`${API}/periods`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(periodRows);
  }),
  http.get(`${API}/master/categories`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(db.categoryRows);
  }),
  http.get(`${API}/master/departments`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(db.departmentRows);
  }),
  http.get(`${API}/master/payment-methods`, () => {
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(db.paymentMethodRows);
  }),
  http.get(`${API}/users/directory`, () => {
    const user = requireUser();
    if (user instanceof HttpResponse) return user;
    const hasCenterRead = user.branchScopes.length === branches.length;
    const safeRows: UserDirectoryItem[] = db.userRows
      .filter(
        (candidate) =>
          hasCenterRead ||
          candidate.id === user.id ||
          candidate.roles.some(
            (assignment) =>
              assignment.branchId !== null && user.branchScopes.includes(assignment.branchId),
          ),
      )
      .map(({ id, fullName, status, roles }) => ({ id, fullName, status, roles }));
    return ok(safeRows);
  }),
];
