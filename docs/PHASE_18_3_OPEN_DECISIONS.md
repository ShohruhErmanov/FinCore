# PHASE 18.3 — Open Decisions

Bu yerdagi bandlar **o'z-o'zicha hal qilinmadi** — har biri biznes yoki arxitektura qarori talab qiladi.

## BLK-18-3-01 — Kunlik tushum grain'i

**Frontend kutadi** (`DailyRevenue`, `domain.ts:229`): bir kun + bir filial = **bitta** yozuv, uchta to'lov ustuni bilan.

```
{ businessDate, branchId, cashUzs, cardUzs, transferUzs, totalUzs, comment, enteredBy }
```

**Baza reallik** (`fincore.revenue_transactions`): **har bir tranzaksiya alohida qator**, bitta `payment_method_id` va bitta `amount_uzs` bilan. Kunlik agregat jadval yo'q.

**Bloklangan endpointlar:** `GET/POST/PATCH /daily-revenues`, `GET /daily-revenues/:id`, `GET /notifications/reminder-preview`, va `GET /reports/dashboard` ning tushum qismi.

**Mavjud alternativalar:**

1. **Agregat sifatida o'qish** — `revenue_transactions` ni `(payment_business_date, branch_id)` bo'yicha guruhlash; `cash/card/transfer` ustunlari `payment_methods.code` (`CASH`/`CARD`/`BANK_TRANSFER`) bo'yicha. `POST` uchta tranzaksiya yaratadi, `PATCH` esa kunni qayta yozadi. Sxema o'zgarmaydi, lekin `id` barqaror bo'lmaydi (agregatning tabiiy id'si yo'q) va `PATCH /daily-revenues/:id` kontrakti buziladi.
2. **Yangi `daily_revenues` jadvali** — kontraktga aynan mos, lekin tasdiqlangan 28-jadvalli arxitekturaga qo'shimcha va `revenue_transactions` bilan ikkilanish yaratadi.
3. **Frontend kontraktini tranzaksiya grain'iga o'tkazish** — eng toza model, lekin frontend refactori (taqiqlangan).

**Tavsiya:** 1-variant, agar `id` sifatida `${businessDate}:${branchId}` kabi barqaror kompozit ishlatilsa. Lekin bu `UUID` tipini buzadi — shuning uchun **qaror sizniki**.

## GAP-01 — `fixedSalaryUzs` uchun ustun yo'q

**Frontend kutadi:** `AuthenticatedUser.fixedSalaryUzs` (majburiy), `PATCH /users/:id/salary`, va `GET /reports/cashiers` fix oylikni ko'rsatadi.

**Baza reallik:** `fincore.users` da hech qanday oylik ustuni yo'q (`information_schema` bo'yicha `%salary%` = 0 ta ustun).

**Hozirgi holat:** `/api/me` `"0"` placeholder qaytaradi.

**Bloklangan:** `PATCH /users/:id/salary`, `GET /reports/cashiers`.

**Alternativalar:** (a) `users` ga `fixed_salary_uzs BIGINT` ustuni, (b) `user_roles` ga (filial kesimida turli oylik bo'lsa), (c) alohida `user_compensation` jadvali (tarix bilan).

**Tavsiya:** agar oylik vaqt o'tishi bilan o'zgarsa va tarix kerak bo'lsa — (c); aks holda (a). **Qaror sizniki.**

## BLK-18-3-02 — Direktorda ortiqcha yozuv ruxsatlari

**Topilma:** bazada direktorda `expense.create`, `expense.edit`, `expense.approve`, `expense.submit`, `expense.reject`, `expense.correct_reverse` bor. Frontend matritsasi (`roles-page.tsx:97`) esa direktorga bularni bermaydi — "Direktor kunlik xarajat/tushum kiritmaydi".

**Sabab:** `002_seed_reference.sql` Phase 16 loyihasiga mos; `003_permission_alignment.sql` faqat qo'shdi, hech narsani olib tashlamadi.

**Hozirgi ta'sir:** amalda bloklangan, chunki direktorning `writeBranchScopes = 0` — jonli tasdiqlandi (`PATCH /api/expenses/:id` → `403 BRANCH_SCOPE_DENIED`). Ya'ni ikki qatlamli himoya ishladi.

**Xavf:** agar direktorga kelajakda filial-scoped rol berilsa, u UI ko'rsatmaydigan amallarni API orqali bajara oladi.

**Alternativalar:** (a) `003` uslubida yangi `004_permission_revocation.sql` bilan ortiqcha grantlarni olib tashlash, (b) qoldirish va faqat branch scope'ga tayanish.

**Tavsiya:** (a) — ruxsat matritsasi bitta haqiqat manbaiga ega bo'lishi kerak. **Qaror sizniki**, chunki bu grantlarni olib tashlash.

## BLK-18-2-03 — Filial kodi mos emas (o'zgarishsiz)

Baza `XALQLAR_DOSTLIGI`, frontend tipi `Branch.code: 'SAYXUN' | 'XALQLAR'`. Kod ilovada hech qayerda taqqoslanmaydi, shuning uchun zararsiz. Tuzatish seed yoki frontend tipini o'zgartirishni talab qiladi.

## Hal bo'lgan blokerlar

| ID | Holat |
| --- | --- |
| **BLK-18-2-01** — `accounting_periods` bo'sh | **RESOLVED** — `fn_ensure_period` birinchi xarajat kiritilganda davrni avtomatik yaratdi. `/api/periods` endi `Avgust 2026` qaytaradi. |
| **BLK-18-2-02** — RBAC 403 jonli tekshirilmagan | **RESOLVED** — `PATCH /api/expenses/:id` kassir va direktor sessiyalarida `403 BRANCH_SCOPE_DENIED` qaytardi. |
