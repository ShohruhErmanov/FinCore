# PHASE 18.4 — Frontend ↔ Backend API Integration Audit

**Sana:** 2026-08-23 · **Rejim:** AUDIT ONLY — hech qanday kod, sxema yoki ma'lumot o'zgartirilmadi
**Muhit:** NestJS 11 @ `localhost:3000` · Vite @ `localhost:5173` · PostgreSQL 18.6 (`fincore`) · `VITE_ENABLE_MOCKS=false`

---

## 1. Executive summary

| Ko'rsatkich | Soni |
| --- | --- |
| **Frontend talab qiladigan endpointlar** | **40** |
| Backend implement qilgan route'lar | 18 (17 frontend uchun + 1 `/health`) |
| **CONNECTED** | **17** |
| MOCK_ONLY | 0 |
| BACKEND_MISSING | 16 |
| CONTRACT_MISMATCH | 0 (2 ta ma'lumot darajasidagi nomuvofiqlik hujjatlashtirildi, §6) |
| NOT_USED_BY_UI | 0 (frontend to'plami ichida) |
| ERROR | 0 |
| BLOCKED | 7 |

**Yig'indi:** 17 + 0 + 16 + 0 + 0 + 0 + 7 = **40** ✓

**CONNECTED tarkibi:** 12 tasi shu auditda **frontend runtime** dalili bilan (brauzer Network, HTTP 200); 5 tasi (yozuv va detail yo'llari) backend'da mavjud va kontraktga mos, lekin bu bosqichda **ishga tushirilmadi**, chunki audit qoidasi bazaga yozishni taqiqlaydi. Ular §7 da alohida belgilangan.

**Eslatma:** oldingi bosqichlar "41 endpoint" deb hisobot bergan. Aniq sanoq **40**. Farq — `contracts.ts` ni tahlil qilgan regex ichma-ich generiklarni (`PaginatedResponse<Expense>`) noto'g'ri o'qiganidan. Bu auditda qavs balansi bilan qayta sanaldi.

---

## 2. Complete API integration matrix

`FE runtime` = shu auditda brauzerdan yuborilgan haqiqiy so'rov dalili.

| # | Metod | Endpoint | Frontend usage | Backend | Contract | MSW | FE runtime | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | POST | `/auth/login` | `authApi.login` → LoginPage | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 2 | POST | `/auth/logout` | `authApi.logout` → TopBar | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 3 | GET | `/me` | `authApi.me` → AuthContext | ✅ | ⚠️ §6.2 | o'chiq | ✅ 200 | CONNECTED |
| 4 | GET | `/branches` | `referenceApi.branches` | ✅ | ⚠️ §6.1 | o'chiq | ✅ 200 | CONNECTED |
| 5 | GET | `/periods` | `referenceApi.periods` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 6 | GET | `/master/categories` | `referenceApi.categories` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 7 | GET | `/master/departments` | `referenceApi.departments` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 8 | GET | `/master/payment-methods` | `referenceApi.paymentMethods` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 9 | GET | `/expenses` | `expenseApi.list` → ExpensePages | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 10 | GET | `/expenses/:id` | `expenseApi.detail` | ✅ | ✅ | o'chiq | ⛔ yozuvsiz sinov | CONNECTED |
| 11 | POST | `/expenses` | `expenseApi.create` | ✅ | ✅ | o'chiq | ⛔ yozuv taqiqlangan | CONNECTED |
| 12 | PATCH | `/expenses/:id` | `expenseApi.update` | ✅ | ✅ | o'chiq | ⛔ yozuv taqiqlangan | CONNECTED |
| 13 | GET | `/budget-plans/:periodId` | `budgetApi.get` → BudgetPages | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 14 | PUT | `/budget-plans/:periodId/lines` | `budgetApi.saveLines` | ✅ | ✅ | o'chiq | ⛔ yozuv taqiqlangan | CONNECTED |
| 15 | GET | `/reports/dashboard` | `dashboardApi.get` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 16 | GET | `/reports/monthly` | `reportApi.monthly` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 17 | GET | `/reports/branch-comparison` | `reportApi.branchComparison` | ✅ | ✅ | o'chiq | ✅ 200 | CONNECTED |
| 18 | GET | `/daily-revenues` | `revenueApi.list` | ❌ | — | o'chiq | ✅ 404 | BLOCKED |
| 19 | GET | `/daily-revenues/:id` | `revenueApi.detail` | ❌ | — | o'chiq | — | BLOCKED |
| 20 | POST | `/daily-revenues` | `revenueApi.create` | ❌ | — | o'chiq | — | BLOCKED |
| 21 | PATCH | `/daily-revenues/:id` | `revenueApi.update` | ❌ | — | o'chiq | — | BLOCKED |
| 22 | GET | `/notifications/reminder-preview` | `notificationApi.reminderPreview` | ❌ | — | o'chiq | ✅ 404 | BLOCKED |
| 23 | GET | `/reports/cashiers` | `reportApi.cashiers` | ❌ | — | o'chiq | ✅ 404 | BLOCKED |
| 24 | PATCH | `/users/:id/salary` | `adminApi.updateUserSalary` | ❌ | — | o'chiq | — | BLOCKED |
| 25 | GET | `/users/directory` | `referenceApi.users` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 26 | GET | `/admin/users` | `adminApi.users` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 27 | POST | `/users` | `adminApi.createUser` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 28 | PUT | `/users/:id/access` | `adminApi.updateUserAccess` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 29 | PATCH | `/users/:id/status` | `adminApi.updateUserStatus` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 30 | GET | `/roles/permissions` | `adminApi.rolePermissions` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 31 | PUT | `/roles/:role/permissions` | `adminApi.updateRolePermissions` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 32 | POST | `/master/:resource` | `adminApi.createMaster` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 33 | PATCH | `/master/:resource/:id` | `adminApi.updateMaster` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 34 | GET | `/revenue-plans/:periodId` | `revenueApi.plan` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 35 | PUT | `/revenue-plans/:periodId` | `revenueApi.savePlan` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 36 | GET | `/notifications/telegram` | `notificationApi.settings` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 37 | PUT | `/notifications/telegram` | `notificationApi.saveSettings` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 38 | GET | `/notifications/monthly-preview` | `notificationApi.monthlyPreview` | ❌ | — | o'chiq | ✅ 404 | BACKEND_MISSING |
| 39 | POST | `/notifications/telegram/test` | `notificationApi.sendTest` | ❌ | — | o'chiq | — | BACKEND_MISSING |
| 40 | POST | `/imports/expenses` | `importApi.expenses` | ❌ | — | o'chiq | — | BACKEND_MISSING |

---

## 3. Page-by-page result

Har bir qator — brauzerda haqiqiy navigatsiya va Network paneli dalili.

| Sahifa | Chaqirilgan API'lar | Real backend | Mock | Runtime natija |
| --- | --- | --- | --- | --- |
| `/login` | `POST /auth/login` | ✅ | yo'q | 200 — sessiya cookie o'rnatildi |
| `/dashboard` | `/branches`, `/periods`, `/reports/dashboard` | ✅ 3/3 | yo'q | **To'liq render**: Jami xarajat 1,7 mln · 34,65% · reja 5 mln · Doimiy ulushi 100% |
| `/expenses` | `/expenses`, `/master/categories`, `/master/departments`, `/master/payment-methods`, `/users/directory` | 4/5 | yo'q | Jurnal yuklandi; `/users/directory` → 404 (mas'ul filtri bo'sh) |
| `/expenses/new` | `/me`, `/users/directory` | 1/2 | yo'q | Forma ochiladi; mas'ul ro'yxati bo'sh (404) |
| `/budgets` | `/budget-plans/:periodId` | ✅ 1/1 | yo'q | 50 qatorli matritsa yuklandi |
| `/reports/monthly` | `/reports/monthly?year=2026&branch=all` | ✅ 1/1 | yo'q | 25 qator, plan-fakt |
| `/reports/branches` | `/reports/branch-comparison?year=2026` | ✅ 1/1 | yo'q | 12 oy + yillik |
| `/revenue` | `/me`, `/periods`, `/daily-revenues` | 2/3 | yo'q | `/daily-revenues` → 404 — **BLOCKED** |
| `/revenue/new` | (sahifa yuklanishida API yo'q) | — | yo'q | Forma ochiladi, saqlash `POST /daily-revenues` ga bog'liq (404) |
| `/revenue/plans` | `/revenue-plans/:periodId` | 0/1 | yo'q | 404 — BACKEND_MISSING |
| `/reports/cashiers` | `/reports/cashiers?period=…&branch=all` | 0/1 | yo'q | 404 — **BLOCKED (GAP-01)** |
| `/settings/import` | `/branches`, `/users/directory` | 1/2 | yo'q | `/users/directory` 404 |
| `/settings/notifications` | `/notifications/telegram`, `/users/directory`, `/notifications/reminder-preview`, `/notifications/monthly-preview` | 0/4 | yo'q | Barchasi 404 — sahifa "Sozlamalar tayyorlanmoqda…" holatida qoladi |
| `/settings/categories`, `/departments`, `/payment-methods`, `/branches` | (sahifa yuklanishida yangi API yo'q — cache'dagi master data) | — | yo'q | Ro'yxatlar render bo'ladi; yozuv `POST/PATCH /master/:resource` ga bog'liq (mavjud emas) |
| `/admin/users` | `/admin/users` | 0/1 | yo'q | Direktor sessiyasida 404; moliya rahbarida "Ruxsat yo'q" (UI gate) |
| `/admin/roles` | `/roles/permissions` | 0/1 | yo'q | 404 |

---

## 4. MSW / mock result

| Savol | Javob | Dalil |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS=false` da MSW to'liq o'chadimi? | **HA** | `src/mocks/init.ts:4` — `if (!environment.enableMocks) return;` erta qaytish **dinamik import'dan oldin**, ya'ni `./browser` va `handlers.ts` umuman yuklanmaydi |
| Biror so'rov hali ham intercept qilinadimi? | **YO'Q** | Brauzerda `navigator.serviceWorker.getRegistrations()` → **0** |
| Mock'ga qaytish (fallback) mavjudmi? | **YO'Q** | `mockServiceWorker.js` resurs sifatida umuman yuklanmagan (`performance.getEntriesByType('resource')` bo'yicha tekshirildi) |
| Biror sahifa hardcoded mock ma'lumotni import qiladimi? | **YO'Q** | `src/` bo'yicha `from '@/mocks'` qidiruvi faqat bitta natija berdi: `src/main.tsx:6` — `startMockApi` (yuqoridagi guard bilan) |
| Biror API xizmati backend'ni chetlab o'tadimi? | **YO'Q** | `fetch(`/`axios` qidiruvi `src/shared/api/client.ts` tashqarisida natija bermadi; barcha 40 chaqiruv `contracts.ts` orqali o'tadi |

**Xulosa:** mock qatlam runtime'da butunlay yo'q. Ishlamayotgan sahifalarning sababi mock emas, backend'da endpoint yo'qligi.

---

## 5. Backend API inventory

Manba: controller fayllaridagi dekoratorlar (Swagger'ga tayanilmagan). Global prefix: `api`.

| # | Metod | Endpoint | Controller | Service | Auth | Permission | Swagger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | POST | `/api/auth/login` | AuthController | AuthService + SessionService | `@Public` | — | ✅ |
| 2 | POST | `/api/auth/logout` | AuthController | SessionService | `@Public` | — | ✅ |
| 3 | GET | `/api/me` | AuthController | AuthService | sessiya | — | ✅ |
| 4 | GET | `/api/health` | HealthController | PrismaService | `@Public` | — | ✅ |
| 5 | GET | `/api/branches` | MasterDataController | MasterDataService | sessiya | — (branch scope) | ✅ |
| 6 | GET | `/api/periods` | MasterDataController | MasterDataService | sessiya | — | ✅ |
| 7 | GET | `/api/master/categories` | MasterDataController | MasterDataService | sessiya | — | ✅ |
| 8 | GET | `/api/master/departments` | MasterDataController | MasterDataService | sessiya | — | ✅ |
| 9 | GET | `/api/master/payment-methods` | MasterDataController | MasterDataService | sessiya | — | ✅ |
| 10 | GET | `/api/expenses` | ExpensesController | ExpensesService | sessiya | `expense.view_own_branch` | ✅ |
| 11 | GET | `/api/expenses/:id` | ExpensesController | ExpensesService | sessiya | `expense.view_own_branch` | ✅ |
| 12 | POST | `/api/expenses` | ExpensesController | ExpensesService | sessiya | `expense.create` | ✅ |
| 13 | PATCH | `/api/expenses/:id` | ExpensesController | ExpensesService | sessiya | `expense.edit` | ✅ |
| 14 | GET | `/api/budget-plans/:periodId` | BudgetController | BudgetService | sessiya | `budget.view` | ✅ |
| 15 | PUT | `/api/budget-plans/:periodId/lines` | BudgetController | BudgetService | sessiya | `budget.create_edit` | ✅ |
| 16 | GET | `/api/reports/dashboard` | ReportsController | DashboardService | sessiya | `dashboard.view` | ✅ |
| 17 | GET | `/api/reports/monthly` | ReportsController | ReportsService | sessiya | `reports.view` | ✅ |
| 18 | GET | `/api/reports/branch-comparison` | ReportsController | ReportsService | sessiya | `reports.view` | ✅ |

`/api/health` — frontend uni chaqirmaydi (monitoring uchun). Frontend to'plamidan tashqarida, shuning uchun yig'indiga kirmaydi.

---

## 6. Contract mismatches

Maydon nomlari, tiplari, nullability, pagination, sana va pul formati **17 ta CONNECTED endpoint bo'yicha to'liq tekshirildi** — barcha kalitlar `domain.ts` bilan bir xil. Ikkita **qiymat darajasidagi** nomuvofiqlik topildi.

### 6.1 `Branch.code` — enum qiymati mos emas

```
Frontend kutadi (domain.ts:36):   code: 'SAYXUN' | 'XALQLAR'
Backend qaytaradi:                code: "SAYXUN" | "XALQLAR_DOSTLIGI"
Manba:                            fincore.branches.code (002_seed_reference.sql:47)
```

**Ta'siri:** runtime'da **yo'q**. `branch.code` ilova kodida hech qayerda taqqoslanmaydi (grep bilan tasdiqlangan) — u faqat TypeScript union darajasida mavjud va ekranda ko'rsatilmaydi. Tuzatish seed'ni yoki frontend tipini o'zgartirishni talab qiladi. Blocker ID: **BLK-18-2-03**.

### 6.2 `AuthenticatedUser.fixedSalaryUzs` — placeholder qiymat

```
Frontend kutadi (domain.ts:59):   fixedSalaryUzs: MoneyUzs   (majburiy)
Backend qaytaradi:                fixedSalaryUzs: "0"        (doimiy placeholder)
Sabab:                            fincore.users da oylik ustuni YO'Q
```

**Ta'siri:** shakl to'g'ri, **qiymat noto'g'ri**. Kassirlar hisoboti va `PATCH /users/:id/salary` shu sababli bloklangan. Blocker ID: **GAP-01**.

### Nomuvofiqlik topilmagan sohalar

| Soha | Natija |
| --- | --- |
| Pagination | `{items, page, pageSize, total, nextCursor}` — mos |
| Pul | `*Uzs` butun son-string; `FinancialPayloadInterceptor` buzilish topmadi |
| Sana | `*At` RFC3339 offset bilan; `transactionDate` `YYYY-MM-DD` |
| Foiz | `completionPercent`, `fixedSharePct` — chekli `number` yoki `null` |
| UUID vs integer | Barcha id'lar UUID — frontend, backend va baza uch tomonlama mos |
| Xatolik formati | `{code, message, details?}` — 400/401/403/404/409 da tasdiqlandi |
| `PlanActual` | `hasPlan, plannedAmountUzs, actualAmountUzs, varianceUzs, completionPercent, status` — mos |

---

## 7. Runtime verification

### Frontend → real backend (brauzer Network paneli, `VITE_ENABLE_MOCKS=false`)

```
POST /api/auth/login                                            -> 200
GET  /api/me                                                    -> 200
GET  /api/branches                                              -> 200
GET  /api/periods                                               -> 200
GET  /api/master/categories                                     -> 200
GET  /api/master/departments                                    -> 200
GET  /api/master/payment-methods                                -> 200
GET  /api/expenses?branch=all&sort=transactionDate:desc&page=1  -> 200
GET  /api/budget-plans/02f0adb6-…                               -> 200
GET  /api/reports/dashboard?period=…&branch=all&granularity=…   -> 200
GET  /api/reports/monthly?year=2026&branch=all                  -> 200
GET  /api/reports/branch-comparison?year=2026                   -> 200
POST /api/auth/logout                                           -> 200
```

### Frontend → backend, 404 (endpoint mavjud emas)

```
GET  /api/daily-revenues?branch=all&…      -> 404 NOT_FOUND
GET  /api/revenue-plans/02f0adb6-…         -> 404 NOT_FOUND
GET  /api/reports/cashiers?period=…        -> 404 NOT_FOUND
GET  /api/users/directory                  -> 404 NOT_FOUND
GET  /api/admin/users                      -> 404 NOT_FOUND
GET  /api/roles/permissions                -> 404 NOT_FOUND
GET  /api/notifications/telegram           -> 404 NOT_FOUND
GET  /api/notifications/reminder-preview   -> 404 NOT_FOUND
GET  /api/notifications/monthly-preview    -> 404 NOT_FOUND
```

### Ishga tushirilmagan (audit yozuvni taqiqlaydi)

`GET /expenses/:id`, `POST /expenses`, `PATCH /expenses/:id`, `PUT /budget-plans/:periodId/lines` — backend'da mavjud, kontraktga mos va Phase 18.3 Batch 1/2 da curl bilan tasdiqlangan; bu auditda **frontend runtime dalili yo'q**.

### RBAC / auth (jonli)

```
sessiyasiz  GET /api/reports/dashboard   -> 401 UNAUTHENTICATED
kassir      GET /api/budget-plans/:id    -> 403 FORBIDDEN  missingPermissions:["budget.view"]
noto'g'ri   GET /api/reports/dashboard?period=1 -> 400 VALIDATION_ERROR
noma'lum    GET /api/reports/dashboard?period=<uuid> -> 404 PERIOD_NOT_FOUND
```

UI darajasida ham: moliya rahbari `/admin/users` ga kirganda "Ruxsat yo'q" ko'rsatildi (`user.manage` yo'q) — server so'rovi umuman yuborilmadi.

---

## 8. Swagger audit

| Tekshiruv | Natija |
| --- | --- |
| Swagger operatsiyalari | **18** |
| Controller route'lari | **18** |
| Swagger'da bor, implement qilinmagan | **0** |
| Implement qilingan, Swagger'da yo'q | **0** |
| Auth sxemasi | `{"cookie":{"type":"apiKey","in":"cookie","name":"fincore_session"}}` — cookie-session bilan mos, Bearer yo'q |
| Frontend talab qiladigan, hujjatlanmagan | 23 ta — ular backend'da umuman mavjud emas, shuning uchun Swagger'da bo'lishi ham kutilmaydi |

**Drift yo'q.** Swagger controller'lar bilan 1:1.

---

## 9. Files modified

Faqat bitta fayl yaratildi:

- `docs/PHASE_18_4_FRONTEND_BACKEND_API_INTEGRATION_AUDIT.md`

Boshqa hech qanday fayl o'zgartirilmadi. Bazada `INSERT`/`UPDATE`/`DELETE`/DDL bajarilmadi — barcha so'rovlar `SELECT` yoki `GET`.

---

## 10. Next recommended phase

**Batch 3 — Admin & Reference write API** (9 endpoint, blokersiz):

`/users/directory`, `/admin/users`, `POST /users`, `PUT /users/:id/access`, `PATCH /users/:id/status`, `/roles/permissions`, `PUT /roles/:role/permissions`, `POST /master/:resource`, `PATCH /master/:resource/:id`

Sabab: eng ko'p sahifani ochadi (`/admin/users`, `/admin/roles`, 4 ta `/settings/*`, va `/expenses` dagi mas'ul filtri `users/directory` orqali), barcha jadval mavjud, `withActor()` tayyor.

So'ng **Revenue plans** (2 endpoint — `revenue_plans` jadvali mavjud, grain muammosiga tegmaydi), keyin **Notifications** (4 endpoint, `system_settings` da saqlanadi) va **Import** (1).

Oxirida qolgan 7 ta BLOCKED endpoint — ular avval **BLK-18-3-01** (kunlik tushum grain'i) va **GAP-01** (fix oylik ustuni) qarorlarini talab qiladi.
