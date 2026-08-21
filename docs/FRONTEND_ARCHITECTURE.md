# FINCORE frontend arxitekturasi

**Versiya:** 1.0  
**Sana:** 2026-08-21  
**Holat:** joriy frontend implementatsiyasi va production integratsiya chegarasi  
**Asosiy manba:** `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2

## 1. Maqsad va chegaralar

FINCORE frontend — ikki filialli o‘quv markazining xarajat, budjet, tushum, kassir nazorati, data-quality, davr yopish va rahbariyat hisobotlarini boshqaruvchi React SPA. Figma majburiy emas: design tokenlar, komponentlar va ishlaydigan UI vizual source of truth bo‘ladi.

Manbalar ustuvorligi:

1. `PLATFORM_TZ_FROM_GOOGLE_SHEET.md`;
2. TZ tasdiqlagan API kontrakti;
3. backendning eng yangi bajariladigan kontrakti;
4. ushbu frontend arxitekturasi;
5. ikkilamchi dizayn hujjatlari.

V1 doirasiga o‘quvchi, guruh, davomat, qarzdorlik, CRM, LMS, tuition yoki individual o‘quvchi balansi kirmaydi. `Barchasi` fizik filial emas, faqat hisobot filtri. V1da ikkita tasdiqlangan filial bor: `Sayxun` va `Xalqlar do'stligi`.

## 2. Arxitektura tamoyillari

- Frontend DB jadvallarini bilmaydi; faqat typed HTTP DTO va endpointlar bilan ishlaydi.
- Backend permission, branch scope, period lock va moliyaviy hisoblarning yagona xavfsizlik/manba chegarasi. Frontend guardlari faqat UX qatlamidir.
- Server state TanStack Query’da, qisqa muddatli UI state React state/context’da saqlanadi. Redux faqat keyinchalik aniq ehtiyoj isbotlansa qo‘shiladi.
- Moliyaviy canonical summa yoki foiz komponentlarda qayta hisoblanmaydi. Backend tayyor aggregate va semantic status beradi.
- `MoneyUzs` canonical ko‘rinishi butun sonni ifodalovchi decimal string; float moliyaviy source of truth bo‘lmaydi.
- Filtrlar, pagination va sort URL bilan sinxronlanadi. Dashboard/chart drill-down aynan shu canonical query contractdan foydalanadi.
- Feature’lar yuqoridan pastga bog‘lanadi; `shared` hech qachon `features`, `widgets` yoki `pages`ni import qilmaydi.
- Accessibility komponent API’sining bir qismi: label, focus, keyboard, ARIA va rangsiz matnli status majburiy.
- Mock va real API adapterlari bir xil TypeScript DTO boundary’dan foydalanadi; generic client money/date/timestamp/percentage invariantlarini va error body’ni runtime Zod/refinement bilan tekshiradi.
- Tarixiy ma’lumot current master yoki role holatidan qat’i nazar ko‘rsatiladi; snapshot label/type frontendda live qiymat bilan almashtirilmaydi.

Joriy repository stateful MSW adapteri bilan implementatsiya qilingan. Ushbu hujjatdagi “server-authoritative” atamasi production kontraktini anglatadi: local developmentda shu server rolini MSW handlerlari bajaradi. MSW natijasi real backend, cookie security, PostgreSQL transaction yoki snapshot persistence dalili emas.

## 3. Texnologik stack

| Yo‘nalish      | Qaror                                        |
| -------------- | -------------------------------------------- |
| Runtime/UI     | React + TypeScript strict mode               |
| Build          | Vite                                         |
| Routing        | React Router, typed route registry           |
| Server state   | TanStack Query                               |
| Form           | React Hook Form + Zod                        |
| Styling        | Tailwind CSS + semantic CSS variables        |
| Primitives     | Accessible Radix/shadcn-style local wrappers |
| Chart          | Recharts va accessible table/text fallback   |
| Icons          | Lucide yoki bitta izchil SVG to‘plami        |
| Mock           | MSW (`VITE_ENABLE_MOCKS=true`)               |
| Unit/component | Vitest + React Testing Library               |
| E2E            | Playwright                                   |
| Static quality | ESLint + Prettier + `tsc --noEmit`           |

## 4. Modul va dependency modeli

Joriy tuzilma:

```text
src/
  app/
    layouts/             app shell
    providers/           Query va boshqa app providerlar
    router/              lazy route registry va guardlar
  features/
    auth/
    dashboard/
    expenses/
    budgets/
    reports/
    revenue/
    operations/          import, DQ, reconciliation va period
    admin/               master data, user, role va audit
  shared/
    api/
    config/
    lib/
    types/
    ui/
  mocks/
    fixtures.ts
    handlers.ts
  test/                  Vitest/Testing Library
e2e/                     Playwright browser acceptance
```

Qatlam vazifasi:

| Qatlam | Vazifa | Import qilishi mumkin |
| --- | --- | --- |
| `shared` | generic UI, typed HTTP client, query key/invalidation, formatter, config va domain type | tashqi kutubxona va o‘z ichki moduli |
| `features` | route page, query/mutation va biznes interaction | `shared`, ayrim boshqa feature’ning public auth helperi |
| `app` | provider, router, layout va bootstrap | `features`, `shared` |
| `mocks` | development-only deterministic state va HTTP contract simulation | `shared` type/config, mock fixture |
| `test`/`e2e` | unit/component va browser acceptance | public UI/API behavior |

Taqiqlar:

- UI komponentida bevosita `fetch()`;
- katta, barcha biznesni saqlaydigan `App.tsx`;
- DTO’ni bir necha joyda qayta e’lon qilish;
- feature-specific qoida `shared/ui` ichida;
- broadly typed `any`;
- role nomini yagona authorization mezoni qilish;
- component ichida tarqoq query key yoki URL parser;
- index’ni table row key sifatida ishlatish.

## 5. Application bootstrap va providerlar

Providerlar tashqi bog‘liqlikdan ichkariga qarab joylashadi:

```text
StrictMode
  → ApplicationErrorBoundary
    → QueryClientProvider
      → AuthProvider (/me)
        → RouterProvider
          → Toast/Dialog portals
```

Bootstrap ketma-ketligi:

1. runtime env Zod bilan tekshiriladi;
2. `VITE_ENABLE_MOCKS=true` bo‘lsa MSW worker tayyor bo‘lguncha render kutiladi;
3. query client va typed API client yaratiladi;
4. protected layout `/me`ni yuklaydi;
5. `401` login’ga yo‘naltiradi, `403` esa sessionni o‘chirmasdan `Ruxsat yo‘q` holatini chiqaradi;
6. route navigation permission va branch capability bo‘yicha quriladi.

## 6. Auth, permission va filial scope

- Session HTTP-only, `Secure`, server-managed cookie orqali ishlaydi; barcha requestlar `credentials: 'include'` bilan yuboriladi.
- Token/session secret `localStorage`, `sessionStorage`, URL yoki client logga yozilmaydi.
- `/me` current user, status, permission kodlari va branch-scoped role assignmentlar uchun yagona frontend manbasi. Local MSW login shu DTO’ni simulyatsiya qiladi; production cookie implementatsiyasi hali ulanmagan.
- `/me.branchScopes` read scope, `/me.writeBranchScopes` esa mutation scope. `can(permission)`, `hasBranchScope(branchId)` va `canWriteBranch(branchId)` markaziy helperlarda ishlatiladi.
- Bir user bir paytda `finance_manager` global scope va `cashier` Sayxun scope’iga ega bo‘lishi mumkin. Effective permission role nomidan emas, permission + branch scope’dan olinadi.
- Kassir write formasida branch yashiriladi yoki read-only ko‘rsatiladi. Submitted DTO’ga boshqa branch qo‘yish frontendda bloklansa ham, backend buni qayta tekshiradi.
- Reportdagi `branch=all` write vakolati bermaydi. Filter scope va mutation scope mustaqil.
- Direct URL access route guard bilan tushunarli forbidden page beradi, ammo haqiqiy himoya backendning `403 BRANCH_SCOPE_DENIED` javobidir.
- User blocked/inactive bo‘lsa `/me` yoki navbatdagi requestdagi `401/403` orqali protected app’dan chiqariladi.

User ma’lumotining ikki projectioni aralashtirilmaydi:

| Endpoint | Consumer | Maydonlar |
| --- | --- | --- |
| `/users/directory` | selector, responsible/collector lookup | faqat `id`, `fullName`, `status`, `roles`; telefon, permission va scope yo‘q |
| `/admin/users` | user management | admin DTO; faqat `user.manage` bilan |

Local E2E cashier uchun safe directory projectionini va `/admin/users`ning `403` javobini tekshiradi. Bu PII projectionning production backendda ham aynan shunday himoyalanganini isbotlamaydi.

Canonical permission katalogi backenddan keladi; V1 UI quyidagi kodlarni taniydi:

```text
dashboard.view                expense.view_own_branch
expense.view_all_branches
expense.create                expense.edit
expense.correct_reverse       expense.submit
expense.approve               expense.reject
budget.view                   budget.create_edit
budget.submit                 budget.approve
revenue.create                revenue.view_own
revenue.view_all              revenue.reverse
revenue.enter_on_behalf       revenue_plan.create_edit
revenue_plan.submit           revenue_plan.approve
reports.view                  reports.view_cashiers
period.close
period.reopen                 master_data.manage
import.run                    import.resolve_exception
audit.view                    user.manage
role.manage
```

Frontend noma’lum permissionni inkor qiladi; backend bergan yangi kod avtomatik ravishda yangi UI capability ochmasligi kerak.

## 7. Route registri

Route meta turi kamida `path`, `title`, `navGroup`, `requiredAnyPermission`, `loaderPolicy` va `phase`ni saqlaydi.

| Route                                  | Ekran                   | Minimal UI capability                                                | Phase |
| -------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ----: |
| `/login`                               | Login                   | public                                                               |     1 |
| `/dashboard`                           | Dashboard               | `dashboard.view`                                                     |     2 |
| `/expenses`                            | Unified ledger          | own/all expense view                                                 |     3 |
| `/expenses/new`                        | Yangi xarajat           | `expense.create`                                                     |     3 |
| `/expenses/:expenseId`                 | Xarajat detail/audit    | own/all expense view                                                 |     3 |
| `/budgets`                             | Budjetlar               | `budget.view`                                                        |     4 |
| `/budgets/:versionId`                  | Budjet revision/matrix  | `budget.view`                                                        |     4 |
| `/reports/monthly`                     | Oylik hisobot           | `reports.view`                                                       |     4 |
| `/reports/branches`                    | Filiallar taqqoslash    | `reports.view`                                                       |     4 |
| `/reports/profit-loss`                 | Foyda/zarar             | `reports.view`                                                       |     4 |
| `/revenue/plans`                       | Tushum rejalari         | plan view capability/backend scope                                   |     5 |
| `/revenue/plans/:planId`               | Tushum reja revisioni   | plan view capability/backend scope                                   |     5 |
| `/revenue/new`                         | Yangi tushum            | `revenue.create`                                                     |     5 |
| `/revenue/transactions`                | Tushum jurnali          | `revenue.view_own` yoki `revenue.view_all`                           |     5 |
| `/revenue/transactions/:transactionId` | Tushum detail           | own/all revenue view                                                 |     5 |
| `/reports/revenue`                     | Tushum hisoboti         | `reports.view`                                                       |     5 |
| `/reports/cashiers`                    | Kassirlar hisoboti      | `reports.view_cashiers`                                              |     5 |
| `/data-quality`                        | DQ/reconciliation       | `import.run` yoki `import.resolve_exception`                         |     6 |
| `/data-quality/imports`                | Importlar               | `import.run` yoki `import.resolve_exception`                         |     6 |
| `/periods`                             | Davrlar/arxiv           | `period.close`                                                       |     6 |
| `/periods/:periodId`                   | Close readiness/history | `period.close`; action ichida `period.close/reopen` capability       |     6 |
| `/settings/categories`                 | Kategoriyalar           | view; mutation uchun `master_data.manage`                            |     6 |
| `/settings/departments`                | Bo‘limlar               | view; mutation uchun `master_data.manage`                            |     6 |
| `/settings/payment-methods`            | To‘lov usullari         | view; mutation uchun `master_data.manage`                            |     6 |
| `/settings/branches`                   | Ikki filial holati      | read-only V1; yangi filial UI scope’dan tashqari                     |     6 |
| `/admin/users`                         | Userlar                 | `user.manage`                                                        |     6 |
| `/admin/roles`                         | Rol va permission       | `role.manage`                                                        |     6 |
| `/audit`                               | Audit log               | `audit.view`                                                         |     6 |

TZ 18 ta biznes ekranini belgilaydi; yuqoridagi 27 route ayrim ekranlarning list/detail/settings bo‘linmalaridir. Route soni mahsulot scope’i sonini kengaytirmaydi.

## 8. Code-first design system

Semantic token guruhlari:

- rang: `background`, `surface`, `surface-muted`, `border`, `text`, `text-muted`, `primary`, `success`, `warning`, `danger`, `info`, `focus`;
- chart: filial va ma’no bo‘yicha barqaror `chart-1…n`, `chart-fixed`, `chart-variable`, `chart-plan`, `chart-actual`;
- spacing: 4px bazali shkala;
- radius: control/card/dialog darajalari;
- shadow: overlay va raised surface;
- typography: display, heading, body, label, tabular-number;
- breakpoint: mobile cashier forms, tablet va desktop dashboard.

Majburiy UI primitive’lar:

`Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Combobox`, `DatePicker`, `DateTimeInput`, `Checkbox`, `RadioGroup`, `FormField`, `CurrencyInput`, `MoneyText`, `PercentText`, `StatusBadge`, `KpiCard`, `DataTable`, `Pagination`, `FilterBar`, `Tabs`, `Modal`, `Drawer`, `ConfirmDialog`, `Toast`, `Alert`, `Skeleton`, `EmptyState`, `ErrorState`, `AccessDenied`, `PageHeader`, `Breadcrumbs`, accessible chart wrapper.

Quyidagi holatlar bitta ko‘rinishga birlashtirilmaydi:

| Holat                           | UI semantikasi                                      |
| ------------------------------- | --------------------------------------------------- |
| Haqiqiy `0`                     | `0 so‘m`, valid qiymat                              |
| Reja qatori yo‘q                | `Reja mavjud emas`                                  |
| Reja `0`, fakt `>0`             | `Rejadan tashqari / Unplanned`, foiz `—`            |
| Data yo‘q                       | `Ma’lumot mavjud emas`                              |
| Import chiqarib tashlagan summa | `Import xatosi`, summa va drill-down                |
| Yopiq period                    | `Yopiq davr`, mutation sababi bilan disabled        |
| Reversal                        | `Bekor qilingan (reversed)`, original saqlangan     |
| Permission yo‘q                 | `Ruxsat yo‘q`, login xatosi sifatida ko‘rsatilmaydi |

Rang yolg‘iz ma’no tashimaydi: icon, matnli label va kerak bo‘lsa izoh ham beriladi.

## 9. API, query va URL state

Typed client va DTO tafsilotlari `FRONTEND_API_CONTRACT.md`da. Har feature quyidagi qatlamlardan foydalanadi:

```text
TypeScript DTO + financial runtime invariant → API function → query key factory → query/mutation hook → UI
```

Query keylar obyekt filterini canonical tartibda saqlaydi:

```ts
expensesKeys.list(filters);
reportsKeys.dashboard(filters);
revenuesKeys.list(filters);
cashiersKeys.report(filters);
```

Mutation qoidalari:

- joriy client expense/revenue create uchun stable UUID’ni bodydagi `idempotencyKey` va `Idempotency-Key` headerda bir xil yuboradi; MSW bir user+key replayini bitta yozuvga deduplicate qiladi. Payload-hash collision siyosati production backend backlogida;
- reversal/approve/close kabi qolgan moliyaviy transitionlarda production backend idempotency siyosati kontrakt bo‘yicha hali yakunlanishi kerak;
- double-click paytida submit bloklanadi, lekin retry backend idempotency bilan xavfsiz qoladi;
- expense mutationlari `expenses`, `dashboard`, `report`; revenue mutationlari `revenue-transactions`, `dashboard`, `report`; planning mutationlari `dashboard`, `report`, `revenue-plan-summary`, `period-readiness` namespace’larini invalidatsiya qiladi. Detail/list querylari feature darajasida qo‘shimcha invalidatsiya qilinadi;
- moliyaviy state transitionlar optimistic qilinmaydi; server javobi source of truth;
- master-data name kabi past-risk amallarda optimistic update faqat rollback bilan qo‘llanishi mumkin;
- `409 REVISION_CONFLICT` eski formani jim overwrite qilmaydi.

URL qoidalari:

- `period`, `year`, `month`, `dateFrom`, `dateTo`, `branch`, `category`, `expenseType`, `department`, `paymentMethod`, `collector`, `responsible`, `enteredBy`, `status`, `sort`, `cursor`, `pageSize` Zod orqali parse qilinadi;
- `branch=all` faqat report/ledger query qiymati;
- invalid query qiymati xavfsiz defaultga normalize qilinadi va UI’da yashirin noto‘g‘ri filter qolmaydi;
- KPI drill-down filterlarni query string orqali yuboradi, masalan `/revenue/transactions?period=...&branch=...&paymentMethod=...&status=posted`;
- server pagination deterministic cursor yoki explicit page contract bilan ishlaydi; 500 qatorli hard limit yo‘q.

## 10. Pul, foiz va vaqt

- `MoneyUzs` decimal integer string, masalan `"150000000"`.
- Form input decimal, manfiy, exponent va harfli qiymatni qabul qilmaydi; formatter faqat display uchun bo‘shliq bilan guruhlaydi.
- Chart uchun numberga o‘tkazishdan oldin `Number.isSafeInteger` tekshiriladi; aks holda textual/table fallback ishlatiladi.
- Backend bergan `null` percentage `—` bo‘lib ko‘rsatiladi; frontend `Infinity`, `NaN` yoki denominator `0`ni `0%`ga aylantirmaydi.
- Xarajat sanasi `YYYY-MM-DD`, browser timezone arifmetikasidan o‘tkazilmaydi.
- Tushum payment vaqti RFC3339 explicit offset bilan keladi; ko‘rsatish zonasi doim `Asia/Tashkent`.
- Payment time noma’lum tarixiy qator uchun API aniqlik flagini beradi va UI `Vaqt mavjud emas` deb ko‘rsatadi.
- `Haqiqiy tushum` foyda emas. `Sof moliyaviy natija = haqiqiy tushum − haqiqiy xarajat` alohida KPI.

## 11. Error va async holatlar

Har sahifa to‘rt asosiy holatni alohida render qiladi: initial loading, background refresh, empty, terminal error. Markaziy mapper kamida quyidagi kodlarni taniydi:

- `VALIDATION_ERROR`;
- `UNAUTHENTICATED`;
- `FORBIDDEN`;
- `BRANCH_SCOPE_DENIED`;
- `PERIOD_CLOSED`;
- `REVISION_CONFLICT`;
- `DUPLICATE_REFERENCE`;
- `RECONCILIATION_MISMATCH`;
- `NETWORK_ERROR`;
- `UNKNOWN_ERROR`.

Retry faqat idempotent GET va xavfsiz idempotency-key’li mutationlarda qo‘llanadi. `403`, validation, duplicate va period-closed avtomatik retry qilinmaydi. Katta import/export job status/progress bilan kuzatiladi.

## 12. Accessibility va responsive talablar

- visible label va ARIA-connected validation;
- modal/drawer focus trap, qaytuvchi focus va Escape semantics;
- keyboard bilan DataTable action, filter va chart drill-down;
- chartga textual summary yoki jadval fallback;
- kamida WCAG AA contrast maqsadi;
- `prefers-reduced-motion`ni hurmat qilish;
- destructive/reversal/correction harakatida confirm va sabab;
- cashier expense/revenue formasi mobil ekranda horizontal scrollsiz;
- keng report jadvallari desktopda sticky header/columns, kichik ekranda scroll yoki semantic card fallback;
- timestamp, status va historical inactive label screen reader uchun to‘liq matnli.

## 13. Performance va observability

- ledger maqsadi `<2s`, odatiy report `<3s`; API latency alohida o‘lchanadi;
- route-level lazy loading va feature chunklar;
- server pagination, virtualizatsiya faqat o‘lchovdan keyin;
- static master data uchun uzoqroq `staleTime`, moliyaviy list/report uchun qisqaroq siyosat;
- window focus refetch moliyaviy ekranda boshqariladi;
- request cancellation route/filter o‘zgarishida ishlaydi;
- frontend logga password, cookie, token, raw PII yoki sensitive before/after payload yozilmaydi;
- kuzatuv eventlari: login failure turi, authorization denial, import/export failure, report mismatch, close failure; backend correlation/request ID bilan bog‘lanadi.

### Report va snapshot ownership

- Dashboard, revenue, cashier, monthly, branch va P&L ekrani authoritative total, percentage, `hasPlan`/`hasData` va semantic statusni response DTO’dan render qiladi; visible rowlardan canonical total tuzmaydi.
- Local MSW filterlangan current state’dan shu report DTO’larini qayta hosil qiladi. Create/reversaldan keyingi invalidation browser testida report/dashboard refetch bilan tekshirilgan.
- Expense category nomi/turi, budget revision ma’lumoti va revenue collector/entered-by tarixiy DTO qiymatlari live master/user holati bilan almashtirilmaydi.
- Period close vaqtida local MSW dashboard-derived expense/revenue/net/reconciliation snapshotini in-memory saqlaydi; period detail “Arxiv rekordini ochish” orqali uni render qiladi. Bu browser oqimi uchun functional, ammo immutable DB persistence yoki production arxiv endpointi dalili emas.

## 14. Test chegaralari

| Qatlam              | Isbotlaydi                                              | Isbotlamaydi                                  |
| ------------------- | ------------------------------------------------------- | --------------------------------------------- |
| Unit                | parser, formatter, permission helper, schema, UI status | backend RBAC/RLS va DB constraint             |
| Component           | form, table, modal, loading/error/empty semantics       | real persistence va concurrency               |
| MSW integration     | frontend ↔ documented DTO, URL drill-down, mutation UX | server implementatsiyasi kontraktga mosligini |
| Playwright mock     | to‘liq UI oqimi va accessibility interaction            | backend/DB xavfsizligini                      |
| Playwright real API | browser ↔ backend integratsiya                         | DB constraintning barcha ichki holatini       |
| Backend/DB suite    | scope, lock, uniqueness, reconciliation, immutability   | visual/accessibility sifatini                 |

AC-01…AC-22 ownership va dalil darajasi `FRONTEND_ACCEPTANCE_MATRIX.md`da yuritiladi. Backend-only qoida frontend test o‘tgani uchun `Verified` deb belgilanmaydi.

## 15. Joriy operational flow va backendga bog‘liq kontraktlar

Local MSW’da quyidagi stateful oqim mavjud:

```text
legacy import run
  → 43 text-date row normalize + explicit DQ exception
  → DQ exception reason bilan resolve
  → reconciliation va close-readiness qayta hisoblanadi
  → approved budget/revenue readiness bilan period close
  → budget/revenue plan lock + closure history
  → majburiy sabab bilan reopen
```

Frontend readinessni o‘zi hisoblamaydi: `GET /periods/:id/readiness` response’ini ko‘rsatadi, close endpoint esa state’ni qayta tekshiradi. DQ/import mutationlari `data-quality`, `imports`, `reconciliations` va `period-readiness` cache’larini invalidatsiya qiladi. Close/reopen period list/detailni refetch qiladi.

Production uchun hali tasdiqlanishi va real API/DB testidan o‘tishi kerak bo‘lganlar:

- period list/detail/readiness, atomic close/reopen va immutable report snapshot persistence;
- budget/revenue-plan uniqueness, submit/approve/lock/revision concurrency;
- real Google Sheets upload/preview/approve/job lifecycle va source-row trace;
- DQ exception/reconciliation persistence;
- safe user directory, admin user/role CRUD va blocked-session invalidation;
- server-authoritative report aggregate parity;
- async export job/status/download, attachment V1.1 va notificationlar.

MSW endpointlari UI kontraktini bajarishi real backend tayyorligini anglatmaydi. Exact current/mock va taklif endpointlar `FRONTEND_API_CONTRACT.md`da alohida ko‘rsatiladi.

## 16. Product qarorlari va defaultlar

| Qaror                     | Frontend defaulti                                 | Holat                                |
| ------------------------- | ------------------------------------------------- | ------------------------------------ |
| Login identifikatori      | telefon + parol                                   | product owner tasdig‘i kerak         |
| Xarajat approval          | default OFF, UI schema-ready                      | TZ tavsiyasi                         |
| Budget approval           | finance submit → director approve                 | TZ tavsiyasi                         |
| Reopen                    | director + majburiy sabab + audit                 | policy yoqilishi tasdiqlanishi kerak |
| Attachment threshold      | backend system setting                            | V1.1                                 |
| Branch management         | ikki branch read-only; yangi branch yaratish yo‘q | V1 scope                             |
| O‘rtacha KPI maxraji      | server label + denominator qaytaradi              | product owner tasdig‘i kerak         |
| Bank/karta integratsiyasi | manual/reference                                  | tashqi scope                         |
| Offline/PWA               | yo‘q                                              | Phase 3                              |

## 17. Arxitektura Definition of Done

- 18 V1 ekranining barcha route/compositionlari ishlaydi;
- permission va branch-aware navigation `/me`dan quriladi;
- typed real/mock API bitta DTO contractdan foydalanadi;
- moliyaviy summa, foiz va vaqt xavfsiz ko‘rsatiladi;
- zero/no-plan/no-data/import-error farqlanadi;
- report va ledger filterlari URL’da saqlanadi;
- dashboard KPI va chart segmentlari canonical detailga drill-down qiladi;
- historical inactive master/kassir yozuvi yo‘qolmaydi;
- local format, lint, typecheck, unit/component, critical Playwright va production build o‘tadi; remote CI green run alohida dalil bo‘ladi;
- backend-dependent acceptance’lar alohida real integration evidence bilan yopiladi;
- student domeniga oid hech qanday modul yaratilmaydi.

2026-08-21 holatida local frontend gate green: format, lint, typecheck va build exit code `0`, Vitest 29/29, Playwright Chromium+MSW 21/21. Real API E2E, backend/DB suite, remote CI, manual accessibility va performance dalillari Definition of Done’ning ochiq qismlari bo‘lib qoladi.
