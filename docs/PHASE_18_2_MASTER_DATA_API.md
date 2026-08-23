# PHASE 18.2 — Master / Reference Data Read API

**Sana:** 2026-08-23 · **Oldingi:** [Phase 18.1.1](PHASE_18_1_1_BOOTSTRAP_ADMIN.md) · [Phase 18.1.2 audit](FINCORE_PROJECT_STATE_PHASE_18_1_2.docx)

## 1. PHASE STATUS

**COMPLETE** — beshala endpoint implement qilindi va jonli tekshirildi.

Uchta bloker qayd etildi (quyida, 12-bo'lim). Hech biri implementatsiyani to'xtatmadi.

## 2. Implement qilingan endpointlar

Yo'llar `src/shared/api/contracts.ts` dan olingan. Hech qanday yo'l ixtiro qilinmadi.

| METOD | YO'L | AUTH | DB JADVAL | NATIJA |
| --- | --- | --- | --- | --- |
| GET | `/api/branches` | Sessiya + branch scope filtri | `fincore.branches` | 200 — direktor 2, kassir 1 filial |
| GET | `/api/periods` | Sessiya | `fincore.accounting_periods` | 200 — `[]` (jadval bo'sh) |
| GET | `/api/master/categories` | Sessiya | `fincore.expense_categories`|BR|+ `category_aliases` | 200 — 25 element |
| GET | `/api/master/departments` | Sessiya | `fincore.departments` | 200 — 7 element |
| GET | `/api/master/payment-methods` | Sessiya | `fincore.payment_methods` | 200 — 6 element |

**Ruxsat talab qilinmadi** — bu ixtiyoriy qaror emas, kontrakt shunday. MSW handler'larining beshtasi ham faqat `requireUser()` chaqiradi, `hasPermission` emas (`src/mocks/handlers.ts:745-765`). `@RequirePermissions` qo'shilsa kassir o'ziga kerak bo'lgan kategoriyalarni yo'qotardi.

**Filial scope** faqat `/branches` da. MSW: `branches.filter((b) => canUseBranch(user, b.id))`. Qolgan to'rttasi global — MSW ularni filtrlamaydi.

## 3. FRONTEND CONTRACT MATCH

**PASS** — jonli javoblar `src/shared/types/domain.ts` tiplariga aynan mos.

```
Branch            {"id","code","name","isActive"}
MasterItem        {"id","code","name","isActive"}
ExpenseCategory   {"id","code","name","expenseType","isActive","aliases"}
AccountingPeriod  {"id","year","month","label","status","closedAt","closedByName"}
```

Jonli namunalar:

```
branches[1]        {"id":"c493…","code":"XALQLAR_DOSTLIGI","name":"Xalqlar do'stligi","isActive":true}
categories[0]      {"id":"0188…","code":"RENT","name":"Ijara","expenseType":"fixed","isActive":true,"aliases":[]}
departments[0]     {"id":"5ecf…","code":"ADMIN","name":"Ma'muriyat","isActive":true}
payment-methods[0] {"id":"1136…","code":"CASH","name":"Naqd pul","isActive":true}
```

Ichki maydonlar chiqarilmadi: `created_at`, `updated_at`, `sort_order`, `closed_by`, `closed_note`, `reopened_at`, `reopened_by`, `reopen_reason`. `password_hash`, sessiya, secret — hech qayerda yo'q.

`period.label` bazada ustun sifatida mavjud emas, shuning uchun `year`/`month` dan hosil qilinadi (`"Avgust 2026"` — format MSW fixture'idan olingan). `closedByName` `users` jadvaliga alohida so'rov bilan olinadi, chunki `accounting_periods.closed_by` uchun Prisma relation qo'shish auth modellariga tegishni talab qilardi.

## 4. LIVE DATABASE VERIFICATION

**PASS** — barcha javoblar haqiqiy PostgreSQL 18.6 (`fincore`) dan.

- `category_aliases` relation ishlaydi: aliasi bor 5 kategoriya, masalan `UTILITY -> ["Bank xizmat haqi"]`
- Server log'ida SQL/Prisma xatosi yo'q; `FinancialPayloadInterceptor` kontrakt buzilishi topmadi
- Log'da parol, xesh, connection string yoki secret yo'q

## 5. RBAC LIVE VERIFICATION

| Holat | Natija |
| --- | --- |
| 200 authenticated | **PASS** — beshala endpoint direktor va kassir sessiyasi bilan 200 |
| 401 unauthenticated | **PASS** — beshalasi ham `{"code":"UNAUTHENTICATED",...}` |
| 403 insufficient permission | **NOT ACHIEVABLE** — sabab quyida (BLK-18-2-02) |

403 ni bu bosqichda jonli tekshirib bo'lmaydi, chunki **beshala endpoint kontrakt bo'yicha hech qanday ruxsat talab qilmaydi**. Faqat sinov uchun `@RequirePermissions` qo'shish frontend kontraktini buzardi, soxta endpoint yaratish esa taqiqlangan edi.

Buning o'rniga shu endpointlar haqiqatan olib yuradigan avtorizatsiya nazorati — **filial scope** — jonli tasdiqlandi:

```
kassir (Mamurova Maftuna)   GET /api/branches -> 1 filial: XALQLAR_DOSTLIGI
direktor (Ergashev Abdulla) GET /api/branches -> 2 filial: SAYXUN, XALQLAR_DOSTLIGI
```

Bu `PermissionsGuard` emas, lekin bu real, jonli, rolga bog'liq ma'lumot cheklovi.

## 6. BUILD

**PASS** — `nest build` muvaffaqiyatli.

## 7. TYPECHECK

**PASS** — backend `tsc --noEmit` exit 0; frontend `tsc --noEmit` exit 0.

## 8. TESTS

- Backend: **78/78** (9 fayl) — o'zgarishsiz o'tdi
- Frontend: **68/68** (9 fayl) — o'zgarishsiz o'tdi

Bu bosqichda yangi test yozilmadi: endpointlar mantiqsiz proyeksiyalar, ularning qiymati jonli HTTP tekshiruvida, unit testda emas.

## 9. FILES CREATED

- `backend/src/master-data/master-data.service.ts`
- `backend/src/master-data/master-data.controller.ts`
- `backend/src/master-data/master-data.module.ts`
- `docs/PHASE_18_2_MASTER_DATA_API.md`

## 10. FILES MODIFIED

- `backend/prisma/schema.prisma` — 5 model + 2 enum qo'shildi (`departments`, `payment_methods`, `expense_categories`, `category_aliases`, `accounting_periods`, `expense_type`, `period_status`). **Barchasi mavjud jadvallarni map qiladi** — yangi jadval yo'q, migratsiya yaratilmadi.
- `backend/src/app.module.ts` — `MasterDataModule` ro'yxatga olindi (2 qator).

## 11. FILES NOT TOUCHED

- Frontend manba kodi — **o'zgartirilmadi** (kontrakt mos edi, mismatch topilmadi)
- `src/shared/api/contracts.ts` — o'zgarmadi
- `src/mocks/handlers.ts` — o'zgarmadi
- `docs/database/001_reference_schema.sql` — o'zgarmadi
- `docs/database/002_seed_reference.sql` — o'zgarmadi
- Auth poydevori (`src/auth/`, `src/common/`, `src/config/`, `src/database/`) — o'zgarmadi
- Baza: **INSERT/UPDATE/DDL yo'q** — bu bosqich faqat o'qidi

## 12. BLOCKERS

| ID | Tavsif | Jiddiylik | Tavsiya |
| --- | --- | --- | --- |
| **BLK-18-2-01** | `fincore.accounting_periods` bo'sh (0 qator). `/api/periods` to'g'ri ishlaydi, lekin `[]` qaytaradi. Frontend'da davr tanlovi bo'sh bo'ladi va davrga bog'liq sahifalar (budjet, oylik hisobot) ishlamaydi. | O'RTA | Davrlar qanday yaratiladi — avtomatik (birinchi tranzaksiyada `fn_ensure_period`) yoki qo'lda? Qaror kerak. Seed'ga davr qo'shilmadi, chunki bu biznes qarori. |
| **BLK-18-2-02** | RBAC 403 jonli tekshirilmagan. Master data **o'qish** endpointlari kontrakt bo'yicha ruxsat talab qilmaydi. | O'RTA | Birinchi 403 tekshiruvi master data **yozish** endpointlarida (`POST/PATCH /api/master/${resource}`) bo'lishi kerak — MSW ularni `master_data.manage` bilan himoyalaydi, kassirda bu ruxsat yo'q. |
| **BLK-18-2-03** | Filial kodi mos emas: baza `XALQLAR_DOSTLIGI`, frontend tipi `Branch.code: 'SAYXUN' \| 'XALQLAR'`. | PAST | Zararsiz — kod ilovada hech qayerda taqqoslanmaydi (grep bilan tasdiqlandi), faqat TS tip darajasida. Tuzatish uchun seed yoki frontend tipini o'zgartirish kerak — ikkalasi ham qaror talab qiladi. Tuzatilmadi. |

## 13. Frontend integratsiya natijasi

Brauzerda, haqiqiy backend bilan:

```
POST /api/auth/login          -> 200
GET  /api/me                  -> 200
GET  /api/branches            -> 200   (avval 404)
GET  /api/periods             -> 200   (avval 404)
GET  /api/master/categories   -> 200
GET  /api/master/departments  -> 200
GET  /api/master/payment-methods -> 200
GET  /api/reports/dashboard   -> 404   (qamrovdan tashqari)
```

**App shell endi to'liq yuklanadi**: 12 ta navigatsiya havolasi, foydalanuvchi paneli "Ergashev Abdulla / Direktor", route `/dashboard`.

Dashboard sahifasining **ichida** hamon "Server xatosi" ko'rinadi — sababi `GET /api/reports/dashboard` 404. Bu Phase 18.2 qamrovidan aniq chiqarilgan (`reports`, `dashboard calculations`). Ya'ni bu bosqichning maqsadi — reference ma'lumot yuklanishini ochish — bajarildi.

## 14. NEXT RECOMMENDED PHASE

**Phase 18.3 — Master data write API + birinchi jonli RBAC 403.**

`POST /api/master/${resource}` va `PATCH /api/master/${resource}/${id}` — MSW'da `master_data.manage` bilan himoyalangan. Bu ikki route BLK-18-2-02 ni yopadi va `@RequirePermissions` ni jonli sinovdan o'tkazadi.

Muqobil: **Phase 18.3 — Expenses read API** (`GET /api/expenses`), agar avval xarajat jurnalini ko'rish muhimroq bo'lsa. Bunda BLK-18-2-01 (davrlar) avval hal qilinishi kerak.

Tavsiya qilinmoqda, implement qilinmadi.
