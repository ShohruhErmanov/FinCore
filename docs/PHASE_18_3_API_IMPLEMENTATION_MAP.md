# PHASE 18.3 — API Implementation Map

**Sana:** 2026-08-23 · Manba: `src/shared/api/contracts.ts` (41 chaqiruv), `src/mocks/handlers.ts`, `docs/database/001_reference_schema.sql`

Legend: **DONE** implement qilingan · **READY** to'siqsiz, hali yozilmagan · **BLOCKED** qaror/DB gap kutmoqda

## A. Implement qilingan (Phase 18.1 / 18.2 / 18.3)

| # | Metod | Yo'l | Modul | DB manba | Auth | Ruxsat | Branch scope | Holat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | POST | `/auth/login` | auth | `users` | ochiq | — | — | DONE (18.1) |
| 2 | POST | `/auth/logout` | auth | — | ochiq | — | — | DONE (18.1) |
| 3 | GET | `/me` | auth | `users`+RBAC | sessiya | — | — | DONE (18.1) |
| 4 | GET | `/branches` | master-data | `branches` | sessiya | — | ✅ filtr | DONE (18.2) |
| 5 | GET | `/periods` | master-data | `accounting_periods` | sessiya | — | — | DONE (18.2) |
| 6 | GET | `/master/categories` | master-data | `expense_categories`+aliases | sessiya | — | — | DONE (18.2) |
| 7 | GET | `/master/departments` | master-data | `departments` | sessiya | — | — | DONE (18.2) |
| 8 | GET | `/master/payment-methods` | master-data | `payment_methods` | sessiya | — | — | DONE (18.2) |
| 9 | GET | `/expenses` | expenses | `expenses` | sessiya | `expense.view_own_branch` | ✅ filtr | **DONE (18.3)** |
| 10 | GET | `/expenses/:id` | expenses | `expenses` | sessiya | `expense.view_own_branch` | ✅ 403 | **DONE (18.3)** |
| 11 | POST | `/expenses` | expenses | `expenses` | sessiya | `expense.create` | ✅ write scope | **DONE (18.3)** |
| 12 | PATCH | `/expenses/:id` | expenses | `expenses` | sessiya | `expense.edit` | ✅ write scope | **DONE (18.3)** |

## B. Qolgan endpointlar

| Metod | Yo'l | MSW ruxsati | DB manba | Holat |
| --- | --- | --- | --- | --- |
| GET | `/users/directory` | sessiya | `users` | READY |
| GET | `/admin/users` | `user.manage` | `users`+`user_roles` | READY |
| POST | `/users` | `user.manage` | `users` | READY |
| PUT | `/users/:id/access` | `user.manage` | `user_roles` | READY |
| PATCH | `/users/:id/status` | `user.manage` | `users` | READY |
| PATCH | `/users/:id/salary` | `user.manage` | — | **BLOCKED** GAP-01 |
| GET | `/roles/permissions` | `role.manage` | `role_permissions` | READY |
| PUT | `/roles/:role/permissions` | `role.manage` | `role_permissions` | READY |
| POST | `/master/:resource` | `master_data.manage` | master jadvallar | READY |
| PATCH | `/master/:resource/:id` | `master_data.manage` | master jadvallar | READY |
| GET | `/budget-plans/:periodId` | `budget.view` | `budget_versions`+`budget_lines` | READY |
| PUT | `/budget-plans/:periodId/lines` | `budget.create_edit` | `budget_lines` | READY |
| GET | `/revenue-plans/:periodId` | `revenue_plan.manage` | `revenue_plans` | READY |
| PUT | `/revenue-plans/:periodId` | `revenue_plan.manage` | `revenue_plans` | READY |
| GET | `/daily-revenues` | `revenue.view_own_branch` | `revenue_transactions` | **BLOCKED** BLK-18-3-01 |
| GET | `/daily-revenues/:id` | `revenue.view_own_branch` | `revenue_transactions` | **BLOCKED** BLK-18-3-01 |
| POST | `/daily-revenues` | `revenue.create` | `revenue_transactions` | **BLOCKED** BLK-18-3-01 |
| PATCH | `/daily-revenues/:id` | `revenue.edit` | `revenue_transactions` | **BLOCKED** BLK-18-3-01 |
| GET | `/reports/dashboard` | `dashboard.view` | hisoblanadi | READY (tushum qismi BLK-18-3-01) |
| GET | `/reports/monthly` | `reports.view` | hisoblanadi | READY |
| GET | `/reports/branch-comparison` | `reports.view` | hisoblanadi | READY |
| GET | `/reports/cashiers` | `reports.view_cashiers` | hisoblanadi | **BLOCKED** GAP-01 (fix oylik) |
| GET | `/notifications/telegram` | `notification.manage` | `system_settings` | READY |
| PUT | `/notifications/telegram` | `notification.manage` | `system_settings` | READY |
| GET | `/notifications/reminder-preview` | `notification.manage` | hisoblanadi | BLOCKED BLK-18-3-01 |
| GET | `/notifications/monthly-preview` | `notification.manage` | hisoblanadi | READY |
| POST | `/notifications/telegram/test` | `notification.manage` | — | READY |
| POST | `/imports/expenses` | `import.run` | `expenses`+`import_batches` | READY |

## C. Infratuzilma topilmasi — actor token

Har bir audit qilinadigan yozuv (`expenses`, `revenue_transactions`, `budget_*`, …) `trg_audit_after_write` → `fn_current_actor_id()` orqali o'tadi. Bu funksiya **HMAC bilan imzolangan actor token** talab qiladi:

```
SET LOCAL app.actor_token = '<key_id>:<base64url(payload)>:<base64url(hmac_sha256(payload_b64, key))>'
payload = { uid, iat, exp }
```

`fincore._actor_signing_keys` jadvali **bo'sh keladi** — kalitsiz hech qanday yozuv ishlamaydi. Phase 18.3 da shu infratuzilma qurildi:

- `npm run init:actor-key` — kalit yaratadi va `.env` uchun ikki qator chiqaradi
- `ActorContextService.mint(userId)` — so'rov uchun qisqa muddatli token
- `PrismaService.withActor(token, fn)` — `set_config('app.actor_token', …, true)` bilan tranzaksiya

Bu **barcha** keyingi yozuv endpointlari uchun ochqich. Tasdiqlangan: audit jurnalida `expenses.create` va `expenses.update` haqiqiy foydalanuvchiga (`Soyibjonova Madina`) bog'landi.

## D. Trigger zanjiri — yozuvda nima avtomatik bo'ladi

`INSERT INTO fincore.expenses` da backend faqat biznes maydonlarini beradi. Baza o'zi to'ldiradi:

- `accounting_period_id` — `fn_ensure_period` orqali, **davr yo'q bo'lsa yaratadi**
- `category_code_snapshot`, `category_name_snapshot`, `expense_type_snapshot`
- `status` = `approved` (default), `is_reversed` = false, `version` = 1
- Yopilgan davr — `trg_expenses_guard` bloklaydi
- Audit yozuvi — `trg_audit_after_write`

Shu sabab `create` uchun parametrlangan raw INSERT ishlatiladi: Prisma'ning tipli `create()` trigger to'ldiradigan NOT NULL ustunlarni ifodalay olmaydi.
