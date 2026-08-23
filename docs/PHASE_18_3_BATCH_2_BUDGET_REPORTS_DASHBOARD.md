# PHASE 18.3 — Batch 2: Budget, Reports, Dashboard

**Sana:** 2026-08-23 · Oldingi: [Batch 1](PHASE_18_3_COMPLETE_API_IMPLEMENTATION.md) · [Open decisions](PHASE_18_3_OPEN_DECISIONS.md)

## 1. Phase status

**COMPLETE (batch qamrovi bo'yicha)** — Budget (2), Reports (2) va Dashboard (1) implement qilindi va jonli tasdiqlandi. BLK-18-3-03 hal qilindi: 22 ta report view bazaga qo'llandi.

Batch ichida qolgan yagona endpoint — `GET /reports/cashiers` — GAP-01 bilan bloklangan (`users` da fix oylik ustuni yo'q), unga tegilmadi.

## 2. Implement qilingan endpointlar

| Metod | Yo'l | Ruxsat | Manba | Holat |
| --- | --- | --- | --- | --- |
| GET | `/api/budget-plans/:periodId` | `budget.view` | `budget_versions` + `budget_lines` + `expenses` | IMPLEMENTED |
| PUT | `/api/budget-plans/:periodId/lines` | `budget.create_edit` | `budget_lines` | IMPLEMENTED |
| GET | `/api/reports/dashboard` | `dashboard.view` | `v_expense_plan_vs_actual`, `v_revenue_plan_vs_actual`, `v_expense_net_rows`, `v_revenue_net_rows`, `v_monthly_expense_report` | IMPLEMENTED |
| GET | `/api/reports/monthly` | `reports.view` | `v_monthly_expense_report`, `v_expense_net_rows` | IMPLEMENTED |
| GET | `/api/reports/branch-comparison` | `reports.view` | `v_branch_comparison` | IMPLEMENTED |

## 3. Tuzatilgan SQL reference

**Bitta token**, tasdiqlanganingiz bo'yicha:

```
docs/database/003_report_and_reconciliation_queries.sql:100
-  rt.payment_date, rt.amount_uzs,
+  rt.payment_business_date, rt.amount_uzs,
```

`v_revenue_ledger` ta'rifida, faqat `SELECT` ro'yxatida. Faylda `payment_date` boshqa hech qayerda uchramaydi (tekshirildi: 1 ta almashtirish, qolgani 0). Boshqa formula, business logic yoki view semantikasi **o'zgartirilmadi**.

**Natija:** `22 ta view` xatosiz yaratildi (avval 0 edi).

## 4. Endpoint → manba mapping

| Element | Manba | Izoh |
| --- | --- | --- |
| Budjet reja qiymatlari | `budget_lines.planned_amount_uzs` | Bitta `draft` + `is_applicable` versiya |
| Budjet fakt | `expenses` `groupBy(branch, category)` | `status='approved' AND is_reversed=false` |
| Dashboard xarajat reja/fakt | `v_expense_plan_vs_actual` | Sanksiyalangan view |
| Dashboard tushum reja/fakt | `v_revenue_plan_vs_actual` | Sanksiyalangan view |
| Doimiy/o'zgaruvchan xarajat | `v_expense_net_rows` `GROUP BY expense_type_snapshot` | |
| Oylik trend | `v_monthly_expense_report`, `v_revenue_plan_vs_actual` | |
| Kunlik/haftalik trend fakt | `v_expense_net_rows`, `v_revenue_net_rows` | Kunlik reja oylik rejadan teng taqsimlanadi (MSW `distributeDaily` bilan bir xil) |
| Yillik xulosa | `v_monthly_expense_report` | Excel «Xulosa» varag'i |
| Oylik hisobot | `v_monthly_expense_report` + `v_expense_net_rows` (tranzaksiya soni) | |
| Filiallar taqqoslashi | `v_branch_comparison` | |

**DDL o'zgarishi: YO'Q.** Jadvallarga tegilmadi; Prisma'ga faqat mavjud jadvallar map qilindi.

## 5. Authorization — CONFIRMED

MSW handler'laridan olingan, ixtiro qilinmagan:

| Endpoint | Ruxsat | MSW manbasi |
| --- | --- | --- |
| `budget-plans` GET | `budget.view` | `handlers.ts:970` |
| `budget-plans/:id/lines` PUT | `budget.create_edit` | `handlers.ts:979` |
| `reports/dashboard` | `dashboard.view` | dashboard handler |
| `reports/monthly` | `reports.view` | `handlers.ts` monthly |
| `reports/branch-comparison` | `reports.view` | `handlers.ts:1641` |

## 6. Branch scope xatti-harakati

- **Budget** — scope filtri **yo'q** (CONFIRMED): MSW `buildBudgetPlan` barcha filial ustunini qaytaradi; rejalashtirish kompaniya darajasida.
- **Reports/Dashboard** — `branchScopes` bo'yicha filtrlanadi. `branch=all` so'ralganda va foydalanuvchida bitta filial bo'lsa, `branchFilter` o'sha filialga siqiladi — MSW bilan bir xil.
- Scope'dan tashqaridagi filial so'ralsa, natija bo'sh bo'ladi (403 emas — MSW ham shunday).

**Jonli tasdiq:** kassir `?branch=all` so'raganda `branchFilter` `c493c525…` (o'z filiali) bo'lib qaytdi, `"all"` emas.

## 7. Actor audit

Budjet yozuvlari `PrismaService.withActor()` orqali (Batch 1 infratuzilmasi). Reports/Dashboard — faqat o'qish, actor kerak emas.

**Tasdiq:** `audit_logs` da `budget_lines.create | Soyibjonova Madina`.

## 8. Report ma'lumot manbai

Barcha raqamlar `003_report_and_reconciliation_queries.sql` dagi view'lardan. **Hech bir formula TypeScript'da qayta yozilmadi.**

TypeScript faqat quyidagilarni bajaradi: view qatorlarini DTO shakliga keltirish, `planActual` holat yorlig'i (`no_plan`/`unplanned`/`under_plan`/`on_plan`/`over_plan`), va foiz hisobi — ikkalasi ham MSW'ning `handlers.ts:209-228` dagi aynan o'sha qoidasi, `bigint` bilan aniqlik yo'qotmasdan.

## 9. Dashboard ma'lumot manbai

`isDemo: false` — mock emas. Barcha KPI, ikkala trend, yillik xulosa va filial kesimi jonli PostgreSQL'dan.

**Muhim topilma:** `v_applicable_budget_line` faqat `is_applicable = true` versiyani ko'radi. Frontend modelida tasdiqlash bosqichi yo'q, shuning uchun saqlangan reja darhol amaldagi reja bo'lishi kerak. Budjet versiyasi endi `draft` **va** `is_applicable = true` bilan yaratiladi: `draft` uni tahrirlanadigan qoldiradi (`trg_budget_lines_guard`), `is_applicable` esa hisobotlarga ko'rinadigan qiladi. Baza guard'i bu kombinatsiyaga ruxsat berishi jonli tekshirildi.

Shundan keyin dashboard `expensePlanUzs` 0 dan `5000000` ga o'zgardi — ya'ni budjet va hisobot bir xil raqamni ko'rsatadi.

## 10. Swagger — PASS

Mavjud sozlamadan foydalanildi, yangi setup yaratilmadi. `/api/docs-json` da **16 ta yo'l**.

Yangi endpointlar `@ApiTags`, `@ApiOperation`, `@ApiQuery`, `@ApiParam`, `@ApiResponse` bilan annotatsiyalangan — 200/400/401/403/404/409 real xatti-harakatga mos. Cookie auth sxemasi o'zgarishsiz (`fincore_session`, apiKey/cookie). Bearer qo'shilmadi.

## 11. Jonli tekshiruv natijalari

### Budget

| Tekshiruv | Natija |
| --- | --- |
| GET autentifikatsiya bilan | PASS — 50 qator (25 kategoriya × 2 filial), `Avgust 2026` |
| GET sessiyasiz | PASS — 401 |
| GET kassir bilan | PASS — 403, `missingPermissions: ["budget.view"]` |
| GET noma'lum davr / noto'g'ri UUID | PASS — 404 `PERIOD_NOT_FOUND` / 400 |
| PUT reja saqlash | PASS — `planned=5000000 actual=1732500 variance=3267500` |
| Baza persistensiyasi | PASS — `budget_versions=1`, `budget_lines=1`, snapshot `RENT/fixed` |
| PUT `null` bilan tozalash | PASS — `hasPlan` 0 ga tushdi |
| PUT kassir bilan | PASS — 403, `missingPermissions: ["budget.create_edit"]` |
| PUT manfiy qiymat | PASS — 400 `VALIDATION_ERROR` |

### Dashboard

| Tekshiruv | Natija |
| --- | --- |
| monthly granularity | PASS — `plan=5000000 fakt=1732500 var=3267500 pct=34.65` |
| daily granularity | PASS — 31 nuqta |
| weekly granularity | PASS — 5 nuqta |
| Yillik xulosa | PASS — `fixedShare=100`, `avgOylik=1732500`, `n=1`, peak `Avg` |
| Filial kesimi | PASS — Sayxun `34.65%`, Xalqlar `0` |
| `isDemo` | PASS — `false` |
| 401 / 400 / 404 | PASS |

### Reports

| Tekshiruv | Natija |
| --- | --- |
| monthly | PASS — 25 qator, `RENT` `under_plan` `34.65%`, `transactionCount=1` |
| `averagePolicy` | PASS — `months_with_actual`, `denominator=1` |
| branch-comparison | PASS — 12 oy, avgust `SAYXUN=1732500`, `XALQLAR_DOSTLIGI=0` |
| Branch scope | PASS — kassirda `branchFilter` o'z filialiga siqildi |

### Umumiy

- Hardcoded moliyaviy qiymat **yo'q** — barcha raqam Batch 1 da kiritilgan haqiqiy xarajatdan va Batch 2 da saqlangan haqiqiy rejadan
- Log gigienasi PASS — parol, connection string, actor token, session secret topilmadi
- `FinancialPayloadInterceptor` kontrakt buzilishi topmadi

## 12. Frontend real API mode — PASS

`VITE_ENABLE_MOCKS=false`, frontend manba kodiga tegilmagan.

```
login 200 | Soyibjonova Madina
dashboard   -> 200      monthly    -> 200
branch-cmp  -> 200      budget     -> 200
expenses    -> 200
```

**Dashboard sahifasi to'liq yuklanadi** — "Server xatosi" yo'qoldi. Brauzerdagi haqiqiy render:

```
Jami xarajat        1,7 mln so'm   Budjet bajarilishi 34,65%
Xarajat rejasi      5 mln so'm
Xarajat variansi    3,2 mln so'm
Doimiy xarajat      1,7 mln so'm   O'zgaruvchan 0 so'm
DOIMIY ULUSHI       100%
O'RTACHA OYLIK      1,7 mln so'm   Fakt mavjud 1 oy bo'yicha
ENG QIMMAT OY       1,7 mln so'm   Avg oyi
```

Ikkala diagramma (tushum va xarajat), oylik dinamika jadvali va CSV eksport tugmasi ham render bo'ladi.

## 13. Testlar / build

- Backend: typecheck **PASS**, `npm test` **78/78**, `npm run build` **PASS**
- Prisma: `prisma validate` **PASS**
- Frontend: typecheck **PASS**

## 14. Yaratilgan fayllar

- `backend/src/budget/budget.service.ts`, `budget.controller.ts`, `budget.module.ts`, `dto/budget.dto.ts`
- `backend/src/reports/reports.service.ts`, `dashboard.service.ts`, `reports.controller.ts`, `reports.module.ts`, `report-math.ts`, `dto/reports.dto.ts`
- `docs/PHASE_18_3_BATCH_2_BUDGET_REPORTS_DASHBOARD.md`

## 15. O'zgartirilgan fayllar

- `docs/database/003_report_and_reconciliation_queries.sql` — **bitta token** (§3)
- `backend/prisma/schema.prisma` — `budget_versions`, `budget_lines` + `budget_status` enum + back-relationlar
- `backend/src/app.module.ts` — `BudgetModule`, `ReportsModule`

## 16. Tegilmagan fayllar

- Frontend manba kodi, `contracts.ts`, `domain.ts`, `handlers.ts` — **0 o'zgarish** (MSW o'chirilmadi)
- `docs/database/001_reference_schema.sql`, `002_seed_reference.sql` — **0 o'zgarish**
- Auth/RBAC poydevori, `PrismaService.withActor()`, `ActorContextService`, Swagger setup — **0 o'zgarish**
- Jadval DDL — **0 o'zgarish**

## 17. Qolgan blockerlar

| ID | Endpointlar | Holat |
| --- | --- | --- |
| **BLK-18-3-03** | reports, dashboard | **RESOLVED** — 22 view qo'llandi |
| **GAP-01** | `/reports/cashiers`, `/users/:id/salary` | OCHIQ — `users` da fix oylik ustuni yo'q |
| **BLK-18-3-01** | `/daily-revenues` (4), `reminder-preview` | OCHIQ — kunlik tushum grain'i |
| **BLK-18-3-02** | — | OCHIQ — direktorda ortiqcha yozuv ruxsatlari (tegilmadi) |

## 18. Qolgan endpointlar

| Holat | Soni |
| --- | --- |
| **Ishlayapti** | **17 / 41** |
| Bloklangan | 8 |
| READY, yozilmagan | 16 |

## 19. Keyingi tavsiya

**Batch 3 — Admin API**: `/users/directory`, `/admin/users`, `POST /users`, `PUT /users/:id/access`, `PATCH /users/:id/status`, `/roles/permissions`, `PUT /roles/:role/permissions`, master data write (2). Jami 9 endpoint, blokeri yo'q, `withActor()` tayyor.
