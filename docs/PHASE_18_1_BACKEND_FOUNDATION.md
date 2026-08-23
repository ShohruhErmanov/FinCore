# PHASE 18.1 — Backend Foundation

**Sana:** 2026-08-23
**Holat:** Bajarildi (foundation qamrovida)
**Database:** `NOT CONFIGURED` — lokal PostgreSQL mavjud emas, `DATABASE_URL` o'rnatilmagan
**Oldingi bosqichlar:** [Phase 17](BACKEND_IMPLEMENTATION_MAP.md) · [Phase 17.1](PHASE_17_1_RECONCILIATION.md) · [Phase 18.0](PHASE_18_0_FRONTEND_BACKEND_MAPPING.md)

---

## 1. Maqsad va qamrov

Bu bosqichda backend **poydevori** quriladi: loyiha skeleti, konfiguratsiya,
database integratsiyasi, xatolik kontrakti, sessiya/autentifikatsiya
infratuzilmasi va health endpoint. Biznes logikasi yozilmaydi.

**Qamrovga kirgan:**

| # | Element | Holat |
| --- | --- | --- |
| 1 | NestJS 11 loyiha skeleti | done |
| 2 | TypeScript strict konfiguratsiya | done |
| 3 | Env validatsiyasi (fail-fast) | done |
| 4 | Prisma + PostgreSQL integratsiyasi (auth modellari) | done |
| 5 | Global xatolik filtri — `{ code, message, details? }` | done |
| 6 | Moliyaviy serializatsiya yordamchilari | done |
| 7 | Cookie-session autentifikatsiya | done |
| 8 | `SessionGuard` + `PermissionsGuard` | done |
| 9 | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` | done |
| 10 | `GET /api/health` (database holati bilan) | done |
| 11 | Swagger (`SWAGGER_ENABLED` bilan boshqariladi) | done |
| 12 | Helmet, CORS, rate limiting, graceful shutdown | done |
| 13 | Unit testlar (Vitest) — **78 ta** | done |

**Qamrovdan chiqarilgan** (foydalanuvchi ko'rsatmasi bo'yicha): Expense CRUD,
approval workflow, master data CRUD, Branch CRUD, Revenue, kunlik tushum,
Reports, Break-even, Profit/Loss, Notifications, Telegram, Attachments, PWA,
va frontend'ning har qanday o'zgarishi. Frontend kodiga **bitta ham qator**
tegilmadi.

---

## 2. Texnologiya tanlovi

| Komponent | Tanlov | Sabab |
| --- | --- | --- |
| Framework | NestJS **11.1.6** | Phase 17 tanlovi. 10-versiya production'da **12 ta zaiflik** olib keldi (express 4, multer, lodash, js-yaml); 11 da `npm audit --omit=dev` natijasi **0 vulnerabilities** |
| ORM | Prisma **5.22** | `multiSchema` preview `fincore` sxemasi uchun zarur |
| Parol | **bcryptjs**, cost 12 | Native build talab qilmaydi (Windows dev muhiti); cost 12 taxminan 250 ms |
| Sessiya | **Signed httpOnly cookie + server-side store** | Frontend `Authorization` sarlavhasini yubormaydi — pastda 9-bo'limga qarang |
| Validatsiya | class-validator (DTO) + zod (env) | DTO uchun Nest'ning `ValidationPipe`, env uchun frontend bilan bir xil zod uslubi |
| Test | **Vitest 4.1.11** | Frontend bilan aynan bir xil versiya. Jest (Nest'ning default'i) o'rniga — repo allaqachon Vitest'da va u tezroq |

Node v20.20.0, npm 10.8.2.

---

## 3. Papka strukturasi

```
backend/
├── prisma/schema.prisma        # faqat auth modellari, fincore sxemasiga map
├── src/
│   ├── main.ts                 # bootstrap: helmet, CORS, cookie, pipe, filter, swagger
│   ├── app.module.ts           # root modul + global guard'lar
│   ├── config/                 # env.validation.ts (zod), config.module.ts, env.token.ts
│   ├── database/               # prisma.service.ts (lifecycle + status), database.module.ts
│   ├── common/
│   │   ├── errors/             # ApiException
│   │   ├── filters/            # AllExceptionsFilter
│   │   ├── decorators/         # CurrentUser, Public, RequirePermissions
│   │   ├── guards/             # PermissionsGuard
│   │   ├── serialization/      # financial.ts + financial-payload.interceptor.ts
│   │   └── types/              # AuthenticatedUser (frontend bilan bir xil)
│   ├── auth/                   # auth.service, auth.controller, session.service,
│   │                           # session.cookie, password, guards/session.guard
│   └── health/                 # health.controller
├── .env.example                # haqiqiy secret YO'Q
├── .gitignore                  # .env, node_modules, dist
└── README.md
```

---

## 4. Konfiguratsiya

Barcha o'zgaruvchilar `backend/src/config/env.validation.ts` da zod bilan
tekshiriladi. Noto'g'ri konfiguratsiya bo'lsa, jarayon `listen()` ga yetib
bormaydi va aniq xabar beradi.

| O'zgaruvchi | Majburiy | Default | Izoh |
| --- | --- | --- | --- |
| `NODE_ENV` | yo'q | `development` | `development` / `test` / `production` |
| `PORT` | yo'q | `3000` | |
| `DATABASE_URL` | **production'da ha** | — | `postgres://` yoki `postgresql://` bo'lishi shart |
| `FRONTEND_URL` | yo'q | `http://localhost:5173` | CORS origin. Wildcard **rad etiladi** |
| `SESSION_SECRET` | **ha** | — | Kamida 32 belgi |
| `COOKIE_DOMAIN` | yo'q | — | Subdomen'lar uchun |
| `COOKIE_SECURE` | yo'q | `false` | **Production'da `true` bo'lishi majburiy** |
| `SESSION_TTL_HOURS` | yo'q | `12` | 1–720 |
| `SWAGGER_ENABLED` | yo'q | `false` | **Production'da `true` bo'lishi taqiqlanadi** |
| `RATE_LIMIT_MAX` | yo'q | `120` | Umumiy so'rov cheklovi |
| `RATE_LIMIT_TTL_SECONDS` | yo'q | `60` | |

Production uchun qo'shimcha qat'iy qoidalar (zod `superRefine`):
`DATABASE_URL` majburiy, `COOKIE_SECURE=true` majburiy, `SWAGGER_ENABLED=false`
majburiy.

---

## 5. Database integratsiyasi va holati

### Holat: NOT CONFIGURED

```
psql          : mavjud emas
DATABASE_URL  : o'rnatilmagan
Migratsiya    : ishga tushirilmagan
Seed          : ishga tushirilmagan
Soxta ma'lumot: YARATILMADI
```

`PrismaService` uchta holatni farqlaydi va `/api/health` orqali ochiq
ko'rsatadi: **`CONNECTED` / `NOT_CONFIGURED` / `CONNECTION_FAILED`**.

Loyihaviy qaror: `DATABASE_URL` bo'lmasa ham API ishga tushadi. Sababi —
foundation'ni (health, CORS, xatolik kontrakti, rate limit, Swagger) database
tayyor bo'lishini kutmasdan tekshirish mumkin bo'lsin. Ma'lumot talab qiladigan
har qanday so'rov toza **`503 DATABASE_UNAVAILABLE`** oladi, kutilmagan crash
emas. Connection xatosi log'ga yozilishidan oldin connection string
`redactConnectionString()` bilan tozalanadi.

---

## 6. Prisma schema mapping

`backend/prisma/schema.prisma` — **yangi jadval yaratmaydi**. U mavjud
`docs/database/001_reference_schema.sql` ustiga *moslashadi*. Faqat auth uchun
kerak bo'lgan 6 model va 1 enum e'lon qilingan:

`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `branches`,
va `user_status` enum (`active` / `inactive` / `blocked`).

Qolgan 22 jadval (expenses, budget_versions, revenue_transactions, import_*,
audit_logs, attachments va boshqalar) **ataylab yozilmagan** — ularni o'z
bosqichi qo'shadi. Migratsiya generatsiya qilinmadi; SQL skriptlar haqiqat
manbai bo'lib qoladi (`npm run prisma:pull` bilan jonli bazadan qayta olinadi).

---

## 7. Xatolik kontrakti

Frontend `src/shared/api/client.ts` faqat `{ code, message, details? }` shaklini
qabul qiladi va JSON bo'lmagan javobni `API_UNAVAILABLE` deb rad etadi. Shuning
uchun `AllExceptionsFilter` **barcha** xatoliklarni — Nest'ning ichki
xatoliklari, 404, validatsiya, rate limit — shu shaklga keltiradi.

| Status | `code` | Manba |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `ValidationPipe`, `details.fields[]` bilan |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` / `ACCOUNT_DISABLED` | `ApiException` |
| 403 | `FORBIDDEN` | `PermissionsGuard`, `details.missingPermissions[]` bilan |
| 404 | `NOT_FOUND` | Nest router |
| 429 | `RATE_LIMITED` | `ThrottlerGuard` |
| 503 | `DATABASE_UNAVAILABLE` | `PrismaService` |
| 5xx | `INTERNAL_ERROR` | Boshqa hamma narsa — **ichki tafsilot mijozga chiqmaydi** |

Muhim nozik nuqta: ataylab yozilgan `ApiException` (masalan 503) o'z kodini
saqlaydi; faqat **noma'lum** 5xx maskalanadi. Bu birinchi tekshiruvda xato
ishlagan edi va tuzatildi (15-bo'lim).

---

## 8. Serializatsiya qoidalari

`backend/src/common/serialization/financial.ts` frontend'ning
`assertFinancialPayload` qoidalarini bajaradi:

| Kalit shakli | Format | Yordamchi |
| --- | --- | --- |
| `*Uzs` | butun son-string, `"1732500"` | `toMoneyUzs()` — `bigint`, `Decimal`, string qabul qiladi; JS `number` faqat butun bo'lsa |
| `*At` | RFC3339 va offset | `toIsoDateTime()` |
| `transactionDate`, `paymentBusinessDate` | `YYYY-MM-DD` | `toIsoDate()` |
| `*percent`, `*Pct` | chekli `number` | `toPercent()` — 0 ga bo'linishda `0` |

Qo'shimcha himoya: `FinancialPayloadInterceptor` development/test rejimida
chiquvchi javoblarni **frontend'ning aynan o'sha qoidalari** bilan tekshiradi va
buzilishni server log'iga yozadi. Shu sababli kontrakt buzilishi brauzerda oq
ekran bo'lib emas, serverda xato satri bo'lib ko'rinadi. Production'da o'chiq.

---

## 9. Autentifikatsiya va sessiya

### Nega Bearer JWT emas

Frontend `Authorization` sarlavhasini **yubormaydi**; u `credentials: 'include'`
bilan ishlaydi (Phase 18.0 da tasdiqlangan). Shuning uchun:

- Cookie nomi: `fincore_session`
- `httpOnly` — JavaScript o'qiy olmaydi (XSS cookie'ni o'g'irlay olmaydi)
- `signed` — `SESSION_SECRET` bilan imzolangan; imzosiz cookie soxta deb rad etiladi
- `secure` va `SameSite=None` — `COOKIE_SECURE=true` bo'lganda (turli origin uchun majburiy)
- `SameSite=Lax` — lokal development'da
- Cookie ichida **faqat tasodifiy 32-baytli identifikator**; foydalanuvchi
  ma'lumoti ham, ruxsatlar ham unda saqlanmaydi

Bu tanlovning amaliy foydasi: `logout` haqiqatan ham kirishni bekor qiladi
(o'z-o'zini tasdiqlovchi JWT'dan farqli), va rol bekor qilinganda keyingi
so'rovdayoq kuchga kiradi — `AuthenticatedUser` har so'rovda qaytadan quriladi.

### Parol

- `bcryptjs`, cost 12
- Foydalanuvchi topilmasa ham `burnPasswordTiming()` bir xil vaqt sarflaydi —
  javob vaqti orqali "bu telefon ro'yxatdami?" degan ma'lumot sizmaydi
- Mock'dagi plaintext `demo123` xatti-harakati **takrorlanmadi**

### AuthenticatedUser proyeksiyasi

`users` → aktiv `user_roles` → `roles` → `role_permissions` → `permissions`
zanjiri bo'ylab quriladi. Faqat `is_active = true AND revoked_at IS NULL`
tayinlovlar va faqat aktiv rollar hisobga olinadi.

`branchScopes` va `writeBranchScopes` qoidasi seed faylining o'z izohidan olindi
(`002_seed_reference.sql`, "Roles" bo'limi): `branch_id = NULL` bilan berilgan
rol **butun kompaniya bo'ylab o'qish** huquqini beradi, yozish huquqi esa faqat
filialga bog'langan tayinlovdan keladi. Bu qoida `src/mocks/fixtures.ts` dagi
beshta foydalanuvchining hammasiga mos keladi — lekin tasdiqlanishi kerak
(16-bo'lim, GAP-03).

---

## 10. Avtorizatsiya

Global guard'lar tartibi (`app.module.ts`):

1. **`SessionGuard`** — cookie'ni yechadi, foydalanuvchini yuklaydi. `@Public()` bilan chetlab o'tiladi.
2. **`PermissionsGuard`** — `@RequirePermissions('expense.create', ...)` ni tekshiradi. **AND** mantiqi. Yetishmagan kodlar `details.missingPermissions` da qaytadi.
3. **`ThrottlerGuard`** — rate limit.

Ruxsat kodlari frontend'dagi `hasPermission()` ishlatadigan aynan o'sha satrlar.
Hozircha `@RequirePermissions` ishlatadigan biror route yo'q — u biznes
modullari uchun tayyorlangan infratuzilma.

---

## 11. Health endpoint

`GET /api/health` (ochiq):

```json
{
  "status": "degraded",
  "environment": "development",
  "uptimeSeconds": 13,
  "database": { "status": "NOT_CONFIGURED", "detail": null },
  "checkedAt": "2026-08-23T06:53:49.865Z"
}
```

Endpoint database yiqilganda ham **200** qaytaradi va `status: "degraded"`
deydi. Sabab — monitoring "API yiqilgan" bilan "API tirik, database yiqilgan" ni
farqlay olishi kerak.

---

## 12. Swagger

`SWAGGER_ENABLED=true` bo'lgandagina `/api/docs` da ochiladi va production'da
`true` bo'lishi zod tomonidan taqiqlanadi. Hujjatda cookie auth sxemasi
ro'yxatdan o'tgan:

```json
{ "cookie": { "type": "apiKey", "in": "cookie", "name": "fincore_session" } }
```

---

## 13. Xavfsizlik choralari

| Chora | Amalga oshirilishi |
| --- | --- |
| Parol xeshlash | bcryptjs cost 12 |
| Timing attack | Noma'lum login uchun ham bir xil vaqt |
| Session fixation | Har login'da yangi tasodifiy id |
| Cookie o'g'irlash | `httpOnly` + `signed` + `secure` |
| CSRF | `SameSite` va aniq CORS origin |
| CORS | Faqat `FRONTEND_URL`; wildcard zod darajasida rad etiladi |
| Brute force | Login: 60 soniyada 5 urinish |
| Header'lar | helmet (HSTS, nosniff, frameguard, referrer-policy) |
| Ma'lumot sizishi | 5xx tafsilotlari maskalanadi; `forbidNonWhitelisted` ortiqcha maydonni rad etadi |
| Log gigienasi | Parol, secret, cookie, connection string log'ga yozilmaydi (tekshirildi — 15-bo'lim) |
| Secret'lar | `.env` gitignore'da; `.env.example` da faqat placeholder |

---

## 14. Bootstrap tartibi

`main.ts` da tartib ahamiyatli:

```
setGlobalPrefix('api')
  -> helmet                       # xavfsizlik header'lari
  -> cookieParser(SESSION_SECRET) # signedCookies shu yerda paydo bo'ladi
  -> CORS (origin: FRONTEND_URL, credentials: true)
  -> ValidationPipe (whitelist, forbidNonWhitelisted, transform)
  -> AllExceptionsFilter
  -> FinancialPayloadInterceptor  # production'dan tashqari
  -> Swagger                      # shartli
  -> enableShutdownHooks()        # Prisma $disconnect, sessiya sweeper tozalanadi
  -> listen(PORT)
```

`cookieParser` `SessionGuard` ishlashidan oldin ro'yxatdan o'tishi shart, aks
holda `request.signedCookies` bo'sh bo'ladi.

---

## 15. Tekshiruv natijalari

**Build:** `npm run typecheck` → 0 xato (testlar ham qamrab olingan). `npm run build` → muvaffaqiyatli.
**Audit:** `npm audit` → **0 vulnerabilities** (dev va production, ikkalasida ham).
**Testlar:** `npm test` → **78/78 o'tdi**, 9 ta fayl.

### Unit testlar

| Fayl | Test | Nimani himoya qiladi |
| --- | --- | --- |
| `env.validation.test.ts` | 12 | Default qiymatlar, qisqa secret, wildcard origin, noto'g'ri DB URL, production qat'iyligi (3 ta shart), barcha xatolarni birdan xabar qilish |
| `financial.test.ts` | 21 | `bigint` aniqligi (`MAX_SAFE_INTEGER` dan katta), `Decimal`, kasrli sonni rad etish, lokal formatlangan pulni rad etish, UTC sana siljimasligi, 0 ga bo'linishda `0` |
| `prisma.service.test.ts` | 3 | Connection string log'ga sizib chiqmasligi |
| `all-exceptions.filter.test.ts` | 8 | `ApiException` 5xx'da ham o'z kodini saqlashi, noma'lum xatolik maskalanishi, `details.fields`, 429 xabari, har doim `{code, message}` |
| `permissions.guard.test.ts` | 5 | AND mantiqi, `missingPermissions`, foydalanuvchisiz so'rovda 403 (401 emas) |
| `session.service.test.ts` | 9 | Identifikator taxmin qilinmasligi va user id'ni oshkor qilmasligi, TTL, logout haqiqatan bekor qilishi, bir foydalanuvchi sessiyalarini boshqalarga tegmasdan bekor qilish |
| `session.cookie.test.ts` | 7 | `httpOnly` + `signed` har doim, `SameSite=None` faqat `Secure` bilan, clear-cookie atributlari mos kelishi |
| `session.guard.test.ts` | 6 | `@Public` chetlab o'tishi, imzosiz cookie rad etilishi, foydalanuvchi har so'rovda qayta yuklanishi, nofaol hisob sessiyasi o'chirilishi |
| `financial-payload.interceptor.test.ts` | 10 | **Frontend'da ikki marta production'ga chiqqan lokal-formatlash regressiyasi** (`"1 732 500"`, `"1,732,500"`), offset'siz timestamp, satr sifatidagi foiz, massiv ichidagi yo'l |

Test fayllari kod yonida (`*.test.ts`) turadi va `tsconfig.build.json` orqali
production build'dan chiqarilgan — `dist/` da bitta ham test fayli yo'q
(tekshirildi).

### Ishga tushirilgan server

`PORT=3010`, `DATABASE_URL` yo'q holatidagi natijalar:

| # | Tekshiruv | Natija |
| --- | --- | --- |
| 1 | `GET /api/health` | `200`, `database.status = NOT_CONFIGURED` — OK |
| 2 | `GET /api/me` cookie'siz | `401 UNAUTHENTICATED`, JSON — OK |
| 3 | `GET /api/me` soxta (imzosiz) cookie bilan | `401 UNAUTHENTICATED` — imzo tekshiruvi ishlaydi |
| 4 | `POST /api/auth/login` (database yo'q) | `503 DATABASE_UNAVAILABLE` — OK |
| 5 | `POST /api/auth/login` bo'sh body | `400 VALIDATION_ERROR` va `details.fields[]` — OK |
| 6 | `POST /api/auth/login` ortiqcha maydon | `400`, `"property role should not exist"` — OK |
| 7 | `POST /api/auth/logout` | `204` — OK |
| 8 | Noma'lum route | `404 NOT_FOUND`, `application/json` — HTML emas |
| 9 | CORS: `http://localhost:5173` | `Allow-Origin` va `Allow-Credentials: true` — OK |
| 10 | CORS: `https://evil.example` | `Access-Control-Allow-Origin` **yo'q** — brauzer bloklaydi |
| 11 | Login rate limit | 5 ta o'tdi, 6-si `429 RATE_LIMITED` — OK |
| 12 | Rate limit izolyatsiyasi | Login bloklangach `GET /api/health` hali `200` — OK |
| 13 | Swagger `/api/docs` | `200`, cookie auth sxemasi bor — OK |
| 14 | Kontrakt interceptor | Buzilish topilmadi (0 ta ogohlantirish) |
| 15 | Log gigienasi | `SESSION_SECRET`, parol, cookie, connection string — topilmadi |
| 16 | Git gigienasi | `.env`, `node_modules`, `dist` — ignore qilingan |

### Tekshiruv davomida topilgan va tuzatilgan 3 ta xato

1. **NestJS 10 → 12 ta production zaifligi.** NestJS 11 ga ko'tarildi, natija 0.
2. **`503` javobi `INTERNAL_ERROR` deb maskalanardi.** `AllExceptionsFilter`
   barcha 5xx ni maskalab, ataylab yozilgan `ApiException` ni ham yeb qo'ygan
   edi. Endi kontrakt shaklidagi payload avval tekshiriladi, faqat noma'lum 5xx
   maskalanadi.
3. **`auth` rate limiter barcha route'larni sanardi.** `@nestjs/throttler` da
   sozlangan **har bir** limiter har bir route'da hisoblanadi — ya'ni bir necha
   health so'rovi login kvotasini tugatib, foydalanuvchini tizimga kira
   olmaydigan holga keltirar edi. Endi bitta global limiter bor, login route'i
   esa `@Throttle` bilan o'zining qat'iyroq cheklovini qo'yadi.

---

## 16. Ochiq qarorlar va bloklovchilar

> Bu bandlar **o'z-o'zicha hal qilinmadi** — ular biznes yoki arxitektura qarori
> talab qiladi.

| ID | Muammo | Ta'sir | Kerakli qaror |
| --- | --- | --- | --- |
| **GAP-01** | `AuthenticatedUser.fixedSalaryUzs` frontend'da majburiy, lekin `fincore.users` da bunday ustun **yo'q** | **Bloklovchi.** Hozir `"0"` placeholder qaytadi. Kassirlar hisoboti shu bilan **noto'g'ri** bo'ladi | Fix oylik qayerda saqlanadi: `users` ga ustun qo'shiladimi, `user_roles` ga (filial kesimida) qo'shiladimi, yoki alohida jadvalmi? Schema o'zgarishi kerak |
| **GAP-02** | Tasdiqlangan schema'da **sessions jadvali yo'q**; sessiyalar jarayon xotirasida | Bitta instance uchun to'g'ri. **Ikki replika bo'lsa sessiyalar bo'linmaydi**, restart hammani chiqarib yuboradi | Redis'mi yoki `fincore.sessions` jadvalimi? |
| **GAP-03** | `branchScopes` / `writeBranchScopes` qoidasi seed izohi va fixture'lardan **xulosa qilingan** | Beshta fixture foydalanuvchisiga mos, lekin rasmiy tasdiq yo'q | Qoida tasdiqlansin: "`branch_id = NULL` → butun kompaniya o'qish; yozish faqat filialga bog'langan tayinlovdan" |
| **GAP-04** | `users.phone` schema'da **nullable**, frontend'da `string` (majburiy) | Hozir `?? ''` ishlatilgan | Telefon majburiymi? Agar ha — schema'da `NOT NULL` bo'lishi kerak |
| **GAP-05** | Telefon saqlash formati noma'lum (`+998 90 123 45 67` yoki `+998901234567`?) | Login uchta variantni sinaydi: xom, normallashtirilgan, email | Saqlash formati bir xillashtirilsin |
| **GAP-06** | **Hech narsa jonli database'ga qarshi tekshirilmagan** | Prisma modellari SQL bilan mos deb **taxmin qilinmoqda**; nomuvofiqlik faqat runtime'da chiqadi | PostgreSQL ko'tarilgach `prisma db pull` bilan solishtirish shart |
| **GAP-07** | Seed parollari yo'q — mock `demo123` ni plaintext ishlatardi | Hozir hech kim tizimga kira olmaydi | Boshlang'ich parollar qanday beriladi: seed skriptmi, majburiy almashtirishmi? |
| **GAP-08** | Oldingi bosqichlardan qolgan hal qilinmagan ziddiyatlar | O'zgarishsiz | 55 vs 40 endpoint ziddiyati, revenue grain bloklovchisi, uchta raqobatchi stack — Phase 17.1 hujjatida. Bu bosqichda **tegilmadi** |

---

## 17. Ataylab qilinmagan ishlar

Foydalanuvchi ko'rsatmasi bo'yicha quyidagilar **yozilmadi**: Expense CRUD,
approval workflow, master data CRUD, Branch CRUD, Revenue va kunlik tushum,
Reports, Break-even, Profit/Loss, Notifications, Telegram, Attachments, PWA.

Shuningdek: yangi biznes jadval **ixtiro qilinmadi**, tasdiqlangan schema
**o'zgartirilmadi**, "Madina uchun maxsus composite" kabi hech qanday hardcode
**qo'shilmadi**, frontend kodi **o'zgartirilmadi**, hech qanday biznes qarori
**mustaqil qabul qilinmadi**.

---

## 18. Frontend kontrakti bilan moslik

| Frontend talabi | Backend holati |
| --- | --- |
| `credentials: 'include'`, `Authorization` yo'q | Bajarildi — cookie-session |
| `{ code, message, details? }` xatolik | Bajarildi — global filter |
| JSON bo'lmagan javob → `API_UNAVAILABLE` | Bajarildi — 404 ham JSON |
| `*Uzs` → integer-string | Bajarildi — `toMoneyUzs()` va interceptor tekshiruvi |
| `*At` → RFC3339 offset | Bajarildi — `toIsoDateTime()`; `checkedAt` tekshirildi |
| `AuthenticatedUser` shakli | Qisman — `fixedSalaryUzs` dan tashqari hammasi (GAP-01) |
| `POST /api/auth/login` → user | Bajarildi |
| `POST /api/auth/logout` → 204 | Bajarildi |
| `GET /api/me` → user | Bajarildi |

Frontend `contracts.ts` dagi 40 endpoint'dan **4 tasi** shu bosqichda qoplandi.
Qolgan 36 tasi keyingi bosqichlarga qoldi.

---

## 19. Keyingi bosqich uchun tavsiya

Tavsiya etilgan tartib:

1. **PostgreSQL ko'tarish va `prisma db pull`** — GAP-06 ni yopadi. Bugungi
   barcha kod jonli baza bilan tekshirilmagan; birinchi navbatda shu.
2. **GAP-01 va GAP-07 bo'yicha qaror** — ularsiz hech kim tizimga kira olmaydi
   va kassirlar hisoboti noto'g'ri bo'ladi.
3. **Master data (faqat o'qish)** — `branches`, `categories`, `departments`,
   `payment_methods`, `periods`. Eng sodda, eng kam risk; guard'larni real
   ma'lumotda sinash imkonini beradi.
4. **Expense CRUD** — idempotency, yopilgan davrni bloklash, branch scope.
5. Keyin Budget, Revenue, Reports.

---

## 20. Yaratilgan fayllar

| Fayl | Vazifasi |
| --- | --- |
| `backend/package.json` | NestJS 11, 0 zaiflik |
| `backend/tsconfig.json` | strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `backend/tsconfig.build.json` | Testlarni production build'dan chiqaradi |
| `backend/vitest.config.mts` | Vitest sozlamasi (`@/*` alias, node muhiti) |
| `backend/src/test/setup.ts` | `reflect-metadata` — decorator metadata'si uchun |
| `backend/nest-cli.json` | Nest CLI |
| `backend/.gitignore` | `.env`, `node_modules`, `dist` |
| `backend/.env.example` | Placeholder'lar, haqiqiy secret yo'q |
| `backend/README.md` | Ishga tushirish va arxitektura qoidalari |
| `backend/prisma/schema.prisma` | 6 model va 1 enum, `fincore` sxemasiga map |
| `backend/src/config/env.validation.ts` | zod, fail-fast |
| `backend/src/config/config.module.ts` | Global env provider |
| `backend/src/config/env.token.ts` | DI token |
| `backend/src/database/prisma.service.ts` | Lifecycle, 3 holat, credential redaction |
| `backend/src/database/database.module.ts` | Global database moduli |
| `backend/src/common/errors/api-exception.ts` | Xatolik kontrakti |
| `backend/src/common/filters/all-exceptions.filter.ts` | Har qanday xatolik → JSON |
| `backend/src/common/serialization/financial.ts` | `toMoneyUzs`, `toIsoDate`, `toIsoDateTime`, `toPercent` |
| `backend/src/common/serialization/financial-payload.interceptor.ts` | Frontend qoidalarini serverda tekshiradi |
| `backend/src/common/decorators/` | `CurrentUser`, `Public`, `RequirePermissions` |
| `backend/src/common/guards/permissions.guard.ts` | AND mantiqi, `missingPermissions` |
| `backend/src/common/types/authenticated-user.ts` | Frontend tipining nusxasi |
| `backend/src/auth/auth.service.ts` | Autentifikatsiya va proyeksiya |
| `backend/src/auth/auth.controller.ts` | login / logout / me |
| `backend/src/auth/session.service.ts` | Opaque sessiyalar, TTL, sweeper |
| `backend/src/auth/session.cookie.ts` | Cookie atributlari |
| `backend/src/auth/password.ts` | bcrypt va timing himoyasi |
| `backend/src/auth/guards/session.guard.ts` | Imzolangan cookie → foydalanuvchi |
| `backend/src/auth/dto/login.dto.ts` | class-validator |
| `backend/src/health/health.controller.ts` | Database holati |
| `backend/src/app.module.ts` | Root va global guard'lar |
| `backend/src/main.ts` | Bootstrap |
| `backend/src/**/*.test.ts` | 9 ta test fayli, 78 ta test |

Frontend fayllari: **0 ta o'zgarish**.
