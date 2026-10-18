import { delay, http, HttpResponse } from 'msw';
import { API, db, LATENCY_MS, MOCK_SESSION_KEY } from '../state';
import { noContent, ok, problem, requireUser } from '../support/http';

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay(LATENCY_MS);
    const body = (await request.json()) as { login?: string; password?: string };
    const normalized = body.login?.replace(/[\s()-]/g, '');
    const found = db.userRows.find(
      (user) => user.phone.replace(/[\s()-]/g, '') === normalized && user.status === 'active',
    );
    if (!found || body.password !== 'demo123')
      return problem(401, 'INVALID_CREDENTIALS', 'Telefon yoki parol noto‘g‘ri.');
    db.signedInUser = structuredClone(found);
    window.sessionStorage.setItem(MOCK_SESSION_KEY, db.signedInUser.id);
    return ok(db.signedInUser);
  }),
  http.post(`${API}/auth/logout`, async () => {
    db.signedInUser = null;
    window.sessionStorage.removeItem(MOCK_SESSION_KEY);
    return noContent();
  }),
  http.get(`${API}/me`, async () => {
    await delay(80);
    const user = requireUser();
    return user instanceof HttpResponse ? user : ok(user);
  }),
];
