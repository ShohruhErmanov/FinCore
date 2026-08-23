# PHASE 18.3 — API Implementation Report

**Sana:** 2026-08-23 · **Holat: PARTIAL** — 1-batch (Expenses) + actor infratuzilmasi yakunlandi va jonli tasdiqlandi; qolgan batchlar boshlanmadi.

Bog'liq: [Implementation map](PHASE_18_3_API_IMPLEMENTATION_MAP.md) · [Open decisions](PHASE_18_3_OPEN_DECISIONS.md)

## 1. Frontend endpointlari — jami

**41 ta chaqiruv** `src/shared/api/contracts.ts` da.

## 2. Avval mavjud edi

**8 ta** — auth (3, Phase 18.1) va master data read (5, Phase 18.2).

## 3. Bu bosqichda qo'shildi

**4 ta** — to'liq Expense CRUD:

| Metod | Yo'l | Ruxsat | Branch scope |
| --- | --- | --- | --- |
| GET | `/api/expenses` | `expense.view_own_branch` | o'qish scope'i bo'yicha filtr |
| GET | `/api/expenses/:id` | `expense.view_own_branch` | 403 BRANCH_SCOPE_DENIED |
| POST | `/api/expenses` | `expense.create` | yozish scope'i |
| PATCH | `/api/expenses/:id` | `expense.edit` | yozish scope'i |

Qo'shimcha, ko'rinmaydigan lekin eng qimmatli qism — **actor token infratuzilmasi** (§7).

## 4. Database bilan ta'minlangan endpointlar

**12/41 (29%)** hozir haqiqiy PostgreSQL'dan ishlaydi.

## 5. Bloklangan

| ID | Endpointlar | Sabab |
| --- | --- | --- |
| BLK-18-3-01 | `/daily-revenues` (4), `reminder-preview`, dashboard tushum qismi | Kunlik tushum grain'i bazada yo'q |
| GAP-01 | `/users/:id/salary`, `/reports/cashiers` | `users` da oylik ustuni yo'q |

## 6. Qamrovdan tashqarida

Yo'q — qolgan **23 endpoint** bloklangan emas, shunchaki hali yozilmagan (READY). Ro'yxat: implementation map §B.

## 7. Actor token infratuzilmasi — bosqichning asosiy topilmasi

`fincore.fn_current_actor_id()` audit qilinadigan **har bir** yozuvda chaqiriladi va HMAC bilan imzolangan `app.actor_token` talab qiladi. `fincore._actor_signing_keys` **bo'sh keladi** — ya'ni kalitsiz hech qanday xarajat, tushum yoki budjet yozuvi ishlamas edi.

Qurildi:

- `npm run init:actor-key` — kalit yaratadi (`_actor_signing_keys` ga INSERT) va `.env` uchun ikki qator chiqaradi
- `ActorContextService.mint(userId)` — 60 soniyalik imzolangan token
- `PrismaService.withActor(token, fn)` — `set_config('app.actor_token', …, true)` bilan tranzaksiya; `SET LOCAL` bo'lgani uchun pool'da keyingi so'rovga sizmaydi

**Tasdiq:** `fincore.audit_logs` da `expenses.create` va `expenses.update` yozuvlari haqiqiy foydalanuvchiga (`Soyibjonova Madina`) bog'landi — tizim akkauntiga emas.

Bu **barcha** qolgan yozuv endpointlari uchun ochqich: ular endi faqat `withActor()` ni chaqirishi kifoya.

## 8. Frontend/backend kontrakt mosligi

**PASS.** Javob `src/shared/types/domain.ts:110` dagi `Expense` interfeysiga aynan mos — 24 maydon, jumladan `categoryCodeSnapshot`, `expenseTypeSnapshot`, `branchName`, `enteredByName`.

Ichki ustunlar chiqarilmadi: `status`, `is_reversed`, `version`, `reviewed_by`, `import_batch_id`, `source_workbook`.

`amountUzs` integer-string; `FinancialPayloadInterceptor` bironta buzilish topmadi.

## 9. Autentifikatsiya

**PASS** — o'zgarishsiz. Cookie-session, `fincore_session`, bcrypt. JWT/Bearer qo'shilmadi.

## 10. RBAC

**PASS** — birinchi marta jonli tasdiqlandi.

| Holat | Natija |
| --- | --- |
| 200 authenticated | PASS |
| 401 unauthenticated | PASS — `UNAUTHENTICATED` |
| **403 branch scope** | **PASS** — kassir boshqa filial xarajatini ko'ra olmadi; direktor (`writeBranchScopes=0`) tahrirlay olmadi |
| 400 validation | PASS — `amountUzs: "1 732 500"` → `VALIDATION_ERROR` + `details.fields` |
| 404 | PASS — `EXPENSE_NOT_FOUND` |
| 422 idempotency | PASS — header yo'q → `IDEMPOTENCY_KEY_REQUIRED` |
| Branch filtr | PASS — kassir `total=0`, moliya rahbari `total=1` |

## 11. Database tekshiruvi

**PASS.** Xarajat yaratishda trigger zanjiri to'liq ishladi:

- `accounting_period_id` avtomatik — **`fn_ensure_period` yo'q davrni yaratdi** (BLK-18-2-01 hal bo'ldi)
- `categoryCodeSnapshot=RENT`, `categoryNameSnapshot=Ijara`, `expenseTypeSnapshot=fixed` avtomatik
- Idempotentlik: bir xil kalit bilan qayta yuborilganda yangi qator yaratilmadi (`total` 1 da qoldi)

`/api/periods` endi `[{ year: 2026, month: 8, label: "Avgust 2026", status: "open" }]` qaytaradi.

## 12. `VITE_ENABLE_MOCKS=false` tekshiruvi

**PASS** — brauzerdan, haqiqiy cookie bilan:

```
login                    -> 200
/api/me                  -> 200
/api/branches            -> 200 (2 ta)
/api/periods             -> 200 (1 ta)
/api/master/categories   -> 200 (25 ta)
/api/expenses?pageSize=5 -> 200 (total 1)
```

## 13. Yaratilgan fayllar

- `backend/src/expenses/expenses.service.ts`
- `backend/src/expenses/expenses.controller.ts`
- `backend/src/expenses/expenses.module.ts`
- `backend/src/expenses/dto/expense.dto.ts`
- `backend/src/database/actor-context.service.ts`
- `backend/scripts/init-actor-key.mjs`
- `docs/PHASE_18_3_API_IMPLEMENTATION_MAP.md`
- `docs/PHASE_18_3_OPEN_DECISIONS.md`
- `docs/PHASE_18_3_COMPLETE_API_IMPLEMENTATION.md`

## 14. O'zgartirilgan fayllar

- `backend/prisma/schema.prisma` — `expenses` modeli + `expense_status` enum + back-relationlar. Mavjud jadvalni map qiladi, yangi jadval yo'q.
- `backend/src/database/prisma.service.ts` — `withActor()` va `PrismaTransaction` tipi
- `backend/src/database/database.module.ts`, `index.ts` — `ActorContextService` eksporti
- `backend/src/config/env.validation.ts` — `ACTOR_SIGNING_KEY_ID`, `ACTOR_SIGNING_KEY`, `ACTOR_TOKEN_TTL_SECONDS`
- `backend/src/config/env.validation.test.ts` — fixture yangi majburiy o'zgaruvchilar bilan
- `backend/src/app.module.ts` — `ExpensesModule`
- `backend/package.json` — `init:actor-key`
- `backend/.env.example` — actor kalit placeholder'lari

## 15. Ataylab tegilmagan

- **Frontend manba kodi** — bitta ham qator o'zgarmadi
- `contracts.ts`, `domain.ts`, `handlers.ts` (MSW o'chirilmadi, fallback sifatida qoldi)
- `docs/database/001_reference_schema.sql`, `002_seed_reference.sql`
- Auth poydevori (`src/auth/`, `src/common/`)
- Baza sxemasi — DDL o'zgarishi **yo'q**

## 16. Testlar

- Backend: **78/78**, typecheck PASS, build PASS
- Frontend: typecheck PASS (o'zgartirilmagan)

## 17. Qolgan blokerlar

**BLK-18-3-01** (kunlik tushum grain'i) · **GAP-01** (fix oylik ustuni) · **BLK-18-3-02** (direktorda ortiqcha yozuv ruxsatlari) · **BLK-18-2-03** (filial kodi) — batafsil [Open decisions](PHASE_18_3_OPEN_DECISIONS.md).

## 18. Keyingi tavsiya

**Batch 2 — Budget + Reports.** Ikkalasi ham `expenses` ustiga quriladi, blokeri yo'q, va dashboard'ning xarajat qismini ochadi:

1. `GET /budget-plans/:periodId`, `PUT /budget-plans/:periodId/lines`
2. `GET /reports/monthly`, `GET /reports/branch-comparison`
3. `GET /reports/dashboard` — xarajat qismi to'liq, tushum qismi BLK-18-3-01 hal bo'lgunicha nol

Tushum (`/daily-revenues`) BLK-18-3-01 qarori kelguncha kutadi.
