# FINCORE frontend

FINCORE — IT Live Academy’ning ikki filiali (`Sayxun` va `Xalqlar do'stligi`) uchun tushum, xarajat, budjet, kassir va reconciliation jarayonlarini boshqaradigan React + TypeScript SPA.

Authoritative product talablari [PLATFORM_TZ_FROM_GOOGLE_SHEET.md](docs/PLATFORM_TZ_FROM_GOOGLE_SHEET.md) faylida. Frontend o‘quvchi, guruh, CRM/LMS, refund, PWA yoki double-entry accounting domenlarini V1 scope’iga qo‘shmaydi.

## Ishga tushirish

Talablar:

- Node.js 20 LTS;
- npm 10+;
- development uchun zamonaviy Chromium, Firefox yoki WebKit brauzeri.

```bash
npm ci
npm run dev
```

Vite odatda `http://localhost:5173` manzilida ishga tushadi. MSW mock API `VITE_ENABLE_MOCKS` qiymatiga qarab ishga tushadi — bu development'da default `true`, production build'da default `false`. Real backend ulanganda `VITE_ENABLE_MOCKS=false` qiling va `VITE_API_BASE_URL`ni real backend manziliga (masalan `/api`) sozlang. Backend hali yo‘q demo/preview deploy (masalan Vercel)da production build ham MSW bilan ishlashi uchun `VITE_ENABLE_MOCKS=true`ni deploy environment'ida aniq belgilang — bu yagona farq, boshqa hech qanday build-mode shartisiz. Ikkala qiymat ham startup vaqtida Zod orqali tekshiriladi.

Demo parol barcha faol demo hisoblarda `demo123`:

| Rol                             | Telefon         |
| ------------------------------- | --------------- |
| Direktor                        | `+998901112233` |
| Moliya rahbari + Sayxun kassiri | `+998907778899` |
| Xalqlar kassiri                 | `+998909991122` |

Demo credential faqat lokal mock muhitga tegishli. Production autentifikatsiya HTTP-only secure cookie va server-side RBAC/branch scope orqali bajarilishi kerak; frontend localStorage’da auth token saqlamaydi.

## Asosiy texnologiyalar

- React 18, TypeScript va Vite;
- React Router — permission guard va URL-first filter/drill-down;
- TanStack Query — server state, cache va invalidation;
- React Hook Form + Zod — typed form validation;
- Tailwind CSS — semantic tokenli responsive UI;
- MSW — local contract-faithful mock API;
- Vitest + Testing Library — unit/component integration;
- Playwright — brauzer acceptance va mobile viewport.

Moliyaviy summalar API’da integer string sifatida yuritiladi. UI `BigInt` bilan formatlaydi; `number` faqat safe chart chegarasida ishlatiladi. Operatsion vaqt zonasi `Asia/Tashkent`.

## Joriy implementatsiya chegarasi

Repository’dagi local development API — stateful MSW implementatsiyasi. U brauzer oqimlarini, DTO chegarasini va cache xulqini tekshirish uchun real UI bilan ishlaydi, lekin production backend yoki PostgreSQL o‘rnini bosmaydi.

- `/me` ikkita mustaqil filial scope qaytaradi: `branchScopes` — ko‘rish uchun, `writeBranchScopes` — moliyaviy yozish uchun. Masalan, finance+kassir ikkala filialni ko‘radi, ammo faqat Sayxunga yozadi.
- Oddiy selectorlar `/users/directory` safe projectionidan foydalanadi: `id`, `fullName`, `status`, `roles`. Telefon, permissionlar va write scope faqat `user.manage` bilan himoyalangan `/admin/users` oqimida mavjud.
- Expense va revenue create requestlari bitta stable `idempotencyKey`ni body va `Idempotency-Key` headerda yuboradi. Local MSW bir user+key replayini bitta yozuvga deduplicate qiladi va header/body mismatchni rad etadi; payload-hash collision siyosati hamda production persistence hali tekshirilmagan.
- Expense/revenue/planning mutationlaridan keyin tegishli ledger, dashboard, report va readiness query namespace’lari invalidatsiya qilinadi. Moliyaviy state transitionlar optimistic emas; qaytgan response source of truth.
- Dashboard va report komponentlari aggregate, foiz, `hasPlan`/`hasData` semantikasi va net qiymatlarni response DTO’dan oladi. Developmentda bu DTO’ni MSW hisoblaydi; productionda u server-authoritative bo‘lishi shart.
- Local import → DQ resolve → reconciliation → close → majburiy sabab bilan reopen oqimi stateful. Historical category/type, collector va status label’lari DTO/fixture snapshotlari bilan ko‘rsatiladi. To‘liq arxiv report snapshotining DB persistence’i hali mavjud emas.

## Buyruqlar

```bash
npm run dev           # lokal Vite server
npm run typecheck     # TypeScript project references
npm run lint          # ESLint
npm run format:check  # Prettier tekshiruvi
npm test              # Vitest unit/integration
npm run build         # typecheck + production bundle
npm run test:e2e      # Playwright desktop va mobile projectlar
```

Faqat CI’dagi Chromium acceptance to‘plami:

```bash
npx playwright install chromium
npm run test:e2e -- --project=chromium
```

2026-08-21 local evidence: `npm run format:check`, `npm run lint`, `npm run typecheck` va `npm run build` exit code `0`; `npm test` — 6 fayl, 29/29; `npm run test:e2e -- --project=chromium --workers=1 --reporter=line` — 21/21. Bu local frontend/MSW quality gate dalili; remote CI run, real API E2E va backend/DB acceptance hali mavjud emas.

## Tuzilma

```text
src/
  app/                 providerlar, router va permission-aware shell
  features/            auth, dashboard, expense, budget, revenue, report, admin
  shared/              API contracts, domain types, helpers va UI primitives
  mocks/               ikki filialli deterministic acceptance fixture/handlerlar
  test/                unit va React integration testlari
e2e/                   Playwright browser acceptance testlari
docs/                  TZ, arxitektura, API kontrakti va acceptance matrix
```

## QA va acceptance

CI quyidagi qat’iy ketma-ketlikni bajaradi:

1. `npm ci`;
2. format check;
3. lint;
4. typecheck;
5. Vitest;
6. production build;
7. Playwright Chromium.

Regression fixturelari quyidagi kritik qiymatlarni tekshiradi:

- markaz tushum rejasi `300 000 000`, haqiqiy tushum `180 000 000`, yig‘ilish `60%`;
- sof moliyaviy natija alohida `70 000 000`, tushum “sof foyda” deb belgilanmaydi;
- kassirlar `70 000 000`, `80 000 000`, `30 000 000`, shu jumladan nofaol tarixiy kassir;
- legacy reconciliation tafovuti `6 318 400` va `43` satr;
- import va DQ resolve’dan keyingi close-readiness, close va reasonli reopen;
- safe user directory, read/write filial scope’larining ajratilishi va blocked user loginining rad etilishi;
- expense/revenue idempotency hamda `500 000` so‘mlik revenue reversalidan keyingi report/dashboard refetch;
- KPI drill-down period/branch filterlarini canonical query stringda saqlaydi;
- 390px cashier formasi gorizontal overflow qilmaydi.

MSW testlari frontend contract va UX’ni isbotlaydi, ammo backend authorization, PostgreSQL constraint, period immutability yoki real reconciliationni isbotlamaydi. To‘liq release gate uchun [FRONTEND_ACCEPTANCE_MATRIX.md](docs/FRONTEND_ACCEPTANCE_MATRIX.md)dagi `BE-INT/DB` dalillari ham talab qilinadi.

## Xavfsizlik va integratsiya chegarasi

- UI actionni yashirishi qulaylik, xavfsizlik kafolati emas; barcha permission va `branch_id` backendda tekshiriladi.
- `collector_user_id`, category/type snapshot, period, status va moliyaviy agregatlar server-authoritative.
- Posted moliyaviy fakt hard-delete qilinmaydi; reasonli reversal/audit oqimi ishlatiladi.
- Yopiq davr ordinary edit bilan o‘zgarmaydi.
- Mock login yoki mock success real backend acceptance sifatida qayd qilinmaydi.
