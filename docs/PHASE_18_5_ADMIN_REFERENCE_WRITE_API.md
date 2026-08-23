# PHASE 18.5 — Batch 3: Admin & Reference Write API

**Sana:** 2026-08-23 · Manba: [Phase 18.4 audit](PHASE_18_4_FRONTEND_BACKEND_API_INTEGRATION_AUDIT.md) §10
**Holat:** COMPLETE — Batch 3 dagi 9 ta endpointning hammasi implement qilindi va jonli tekshirildi

## 1. Implement qilingan endpointlar

| # | Metod | Endpoint | Frontend sahifa | Ruxsat | Jadvallar |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/users/directory` | Xarajatlar (mas'ul filtri), Import | sessiya + filial scope | `users`, `user_roles`, `roles`, `branches` |
| 2 | GET | `/api/admin/users` | `/admin/users` | `user.manage` | `users`, `user_roles`, `roles`, `role_permissions`, `branches` |
| 3 | POST | `/api/users` | `/admin/users` → Yangi user | `user.manage` | `users`, `user_roles` |
| 4 | PUT | `/api/users/:id/access` | `/admin/users` | `user.manage` | `user_roles` |
| 5 | PATCH | `/api/users/:id/status` | `/admin/users` | `user.manage` | `users` |
| 6 | GET | `/api/roles/permissions` | `/admin/roles` | `role.manage` | `roles`, `role_permissions`, `permissions` |
| 7 | PUT | `/api/roles/:role/permissions` | `/admin/roles` | `role.manage` + direktor roli | `role_permissions` |
| 8 | POST | `/api/master/:kind` | `/settings/{categories,departments,payment-methods}` | `master_data.manage` | tegishli master jadval |
| 9 | PATCH | `/api/master/:kind/:id` | shu sahifalar | `master_data.manage` | tegishli master jadval |

Ruxsat kodlari MSW handler'laridan olingan (`handlers.ts:766, 783, 1706, 1750, 1778, 1849, 1937, 1973, 1980`) — bittasi ham ixtiro qilinmagan.

## 2. Frontend integratsiyasi

`VITE_ENABLE_MOCKS=false`, MSW o'chiq (0 service worker). Brauzerdagi haqiqiy navigatsiya:

| Endpoint | FE runtime | HTTP | Real PostgreSQL |
| --- | --- | --- | --- |
| `GET /users/directory` | ✅ `/expenses`, `/settings/import` | 200 | ✅ — mas'ul filtri 7 ta variant bilan to'ldi |
| `GET /admin/users` | ✅ `/admin/users` | 200 | ✅ — 6 qator, haqiqiy ismlar |
| `GET /roles/permissions` | ✅ `/admin/roles` | 200 | ✅ — 20 ta ruxsat checkbox'i |
| `POST /master/:kind` | ✅ (API) | 201 | ✅ — yozuv `/settings/departments` jadvalida ko'rindi |
| `PATCH /master/:kind/:id` | ✅ **UI tugmasi bilan** | 200 | ✅ — "Faollashtirish" bosildi → `PATCH` → qator "Faol" bo'ldi |
| `POST /users` | API | 201 | ✅ |
| `PUT /users/:id/access` | API | 200 | ✅ |
| `PATCH /users/:id/status` | API | 200 | ✅ |
| `PUT /roles/:role/permissions` | API | 200 | ✅ |

**To'liq UI yozuv zanjiri tasdiqlandi:** `/settings/departments` da tugma bosilishi → `PATCH /api/master/departments/{id}` → PostgreSQL → ro'yxat qayta yuklandi → holat o'zgardi.

## 3. RBAC tekshiruvi

| Holat | Natija |
| --- | --- |
| 401 sessiyasiz `GET /admin/users` | `401` |
| 403 kassir `GET /admin/users` | `{"code":"FORBIDDEN","details":{"missingPermissions":["user.manage"]}}` |
| 403 kassir `GET /roles/permissions` | `missingPermissions:["role.manage"]` |
| 403 kassir `POST /master/departments` | `missingPermissions:["master_data.manage"]` |
| 200 direktor | barcha 9 endpoint |
| Filial scope | kassir `/users/directory` da **1** yozuv (o'zi), direktor **5** |

Kontraktdagi maxsus qoidalar ham saqlandi: `PRIVILEGE_ESCALATION_DENIED` (direktor rolini faqat direktor beradi), `LAST_DIRECTOR_REQUIRED`, `ROLE_COMBINATION_INVALID`, `DUPLICATE_ROLE`, `ROLE_REQUIRED`, `DUPLICATE_REFERENCE`, `BRANCH_REQUIRED`, `MASTER_KIND_NOT_FOUND`, `PERMISSION_UNKNOWN`.

## 4. Actor audit

Barcha yozuvlar mavjud `PrismaService.withActor()` orqali — yangi mexanizm yaratilmadi.

| Operatsiya | Actor | Baza tasdig'i |
| --- | --- | --- |
| `POST /users` + rol biriktirish | Ergashev Abdulla | `user_roles.granted_by` = Ergashev Abdulla |
| `PUT /users/:id/access` | Ergashev Abdulla | 3 yozuv (1 bekor qilingan + 2 faol) — grantlar o'chirilmaydi, `revoked_at` bilan yopiladi |

`users`, `user_roles` va master jadvallarda `trg_audit_after_write` **yo'q** (tekshirildi) — shuning uchun `audit_logs` ga yozuv tushmaydi. `withActor()` bu yerda tranzaksiya va bir xillik uchun ishlatiladi.

## 5. Database

**Ishlatilgan jadvallar:** `users`, `user_roles`, `roles`, `permissions`, `role_permissions`, `branches`, `expense_categories`, `departments`, `payment_methods`, `category_aliases`

**Schema o'zgarishi: NONE.** DDL bajarilmadi. Prisma'da faqat `sort_order` ustuniga `@default(0)` qo'shildi — bu bazadagi mavjud default'ni aks ettiradi (`information_schema` bo'yicha tasdiqlangan), jadval o'zgarmadi.

**Test yozuvlari:** bitta bo'lim (`ZZ_TEST_185`) va bitta foydalanuvchi (`ZZ Test Foydalanuvchi 185`) yaratildi, tekshiruvdan keyin **faqat o'sha ikkitasi** o'chirildi. Oldin bog'liqlik tekshirildi (0 xarajat, 0 grant). Yakuniy holat asl holatiga qaytdi: `users=5`, `departments=7`.

## 6. Swagger

```
Controller route'lari : 27
Swagger operatsiyalari: 27   -> MOS
```

Yangi 9 ta operatsiya cookie auth, parametrlar, request DTO va 200/201/400/401/403/404/409/422 javoblari bilan hujjatlangan.

## 7. API qamrovi

| | Oldin (18.4) | Keyin (18.5) |
| --- | --- | --- |
| CONNECTED | 17 | **26** |
| BACKEND_MISSING | 16 | 7 |
| BLOCKED | 7 | 7 |
| **Jami** | **40** | **40** ✓ |

## 8. Testlar

| Tekshiruv | Natija |
| --- | --- |
| Backend typecheck | PASS |
| Backend tests | 78/78 PASS |
| Backend build | PASS |
| `prisma validate` | PASS |
| Frontend typecheck | PASS |

Test o'chirilmadi va zaiflashtirilmadi.

## 9. Yaratilgan fayllar

- `backend/src/admin/admin.controller.ts`
- `backend/src/admin/admin.module.ts`
- `backend/src/admin/users.service.ts`
- `backend/src/admin/roles.service.ts`
- `backend/src/admin/dto/admin.dto.ts`
- `backend/src/master-data/master-write.service.ts`
- `docs/PHASE_18_5_ADMIN_REFERENCE_WRITE_API.md`

## 10. O'zgartirilgan fayllar

- `backend/src/app.module.ts` — `AdminModule` ro'yxatga olindi
- `backend/src/master-data/master-data.controller.ts` — 2 ta yozuv route'i
- `backend/src/master-data/master-data.module.ts` — `MasterWriteService`
- `backend/src/auth/auth.service.ts` — `getAuthenticatedUser(userId, requireActive = true)` ixtiyoriy parametri
- `backend/prisma/schema.prisma` — `sort_order @default(0)` (bazadagi default'ni aks ettiradi)

### `auth.service.ts` o'zgarishi nima uchun zarur edi

Admin ro'yxati va status o'zgartirish **nofaol/bloklangan** foydalanuvchini ham qaytarishi shart. Mavjud `getAuthenticatedUser` sessiya uchun yozilgan va nofaol hisobni `ACCOUNT_DISABLED` bilan rad etardi — natijada `GET /admin/users` 401 berardi va foydalanuvchini bloklash amali ham 401 bilan tugardi. Standart qiymat `true` bo'lgani uchun **sessiya yo'li o'zgarmadi**; faqat admin chaqiruvlari `false` uzatadi.

## 11. Tegilmagan fayllar

- `src/shared/api/contracts.ts` — **0 o'zgarish**
- `src/shared/types/domain.ts` — **0 o'zgarish**
- `src/mocks/handlers.ts` va MSW sozlamasi — **0 o'zgarish**
- Frontend manba kodi — **0 o'zgarish** (bu bosqichda)
- `docs/database/001_reference_schema.sql`, `002_seed_reference.sql`, `003_report_and_reconciliation_queries.sql` — **0 o'zgarish**
- Auth poydevori: `SessionService`, `SessionGuard`, `PermissionsGuard`, `ActorContextService`, `password.ts` — **0 o'zgarish**

## 12. Qolgan endpointlar

### BACKEND_MISSING (7)

| Guruh | Endpointlar |
| --- | --- |
| **Revenue plans (2)** | `GET /revenue-plans/:periodId`, `PUT /revenue-plans/:periodId` — `revenue_plans` jadvali mavjud, grain muammosiga tegmaydi |
| **Notifications (4)** | `GET/PUT /notifications/telegram`, `GET /notifications/monthly-preview`, `POST /notifications/telegram/test` — `system_settings` da saqlanadi |
| **Import (1)** | `POST /imports/expenses` — `import_batches`, `import_rows` mavjud |

### BLOCKED (7)

| Blocker | Endpointlar |
| --- | --- |
| **BLK-18-3-01** (kunlik tushum grain'i) | `GET/POST /daily-revenues`, `GET/PATCH /daily-revenues/:id`, `GET /notifications/reminder-preview` |
| **GAP-01** (fix oylik ustuni yo'q) | `GET /reports/cashiers`, `PATCH /users/:id/salary` |

## 13. Ma'lum cheklov — yaratilgan foydalanuvchining paroli

`UserCreateInput` da parol maydoni **yo'q** va kontraktda parol o'rnatuvchi endpoint ham yo'q. `fincore.users.password_hash` esa NOT NULL. Shuning uchun yangi akkaunt `'!disabled!'` xeshi bilan yaratiladi — bu `002_seed_reference.sql` dagi tizim akkaunti uchun ishlatilgan aynan o'sha konvensiya. Akkaunt yaratiladi va rol oladi, lekin **parol berilmaguncha tizimga kira olmaydi**.

Parol `npm run bootstrap:users` (yoki `BOOTSTRAP_ALLOW_PASSWORD_RESET=true`) orqali alohida beriladi. Bu yangi biznes qoidasi emas — kontraktda parol oqimi umuman yo'qligining to'g'ridan-to'g'ri natijasi.

## 14. Keyingi tavsiya

**Batch 4 — Revenue plans + Notifications + Import** (7 endpoint, blokersiz):

1. `GET/PUT /revenue-plans/:periodId` — `revenue_plans` jadvali va `v_applicable_revenue_plan` view'i tayyor, `/revenue/plans` sahifasini ochadi
2. Notifications (4) — `system_settings` da saqlanadi
3. `POST /imports/expenses` — `import_batches`/`import_rows` va `expenses` yozuv yo'li tayyor

Shundan keyin faqat 7 ta BLOCKED endpoint qoladi — ular **BLK-18-3-01** va **GAP-01** bo'yicha qaroringizni kutadi.
