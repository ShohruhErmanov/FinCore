# FINCORE frontend implementatsiya rejasi

**Versiya:** 1.1  
**Sana:** 2026-08-21  
**Asosiy manba:** `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2  
**Ishlash usuli:** Figma’siz, code-first, phase-gated  
**Joriy holat:** funksional frontend va mock API implementatsiya qilingan; production release gate yopilmagan

## 1. Status qoidasi

Ushbu hujjatda route mavjudligi, frontend testi va production acceptance bir xil narsa deb olinmaydi.

| Status | Ma’no |
| --- | --- |
| `Implemented` | Ekran/oqim kodda mavjud va local mock contract bilan ishlashi mumkin. |
| `Frontend verified (mock)` | Muayyan frontend xulqi Vitest yoki Playwright + MSW passing daliliga ega. |
| `In progress` | Implementatsiya yoki hardening qisman bajarilgan, majburiy gate hali green emas. |
| `Pending integration` | Real backend, auth, persistence yoki PostgreSQL dalili kerak. |
| `Complete` | Phase deliverable’lari, barcha tegishli frontend gate va zarur real integration dalillari exit code `0` bilan o‘tgan. |

`Implemented` production-ready degani emas. MSW server-side permission, DB unique constraint, period immutability, append-only audit yoki real reconciliationni isbotlamaydi.

## 2. Joriy holatning qisqa xulosasi

Hozir repository’da:

- React 18 + TypeScript + Vite SPA foundationi;
- React Router lazy route’lari va permission-aware app shell;
- TanStack Query, typed API client va `credentials: 'include'` sessiya boundary’si;
- canonical `VITE_ENABLE_MOCKS=true` development switch’i va `VITE_API_BASE_URL`;
- MSW orqali ikki filial, uch rol, budget/expense/revenue/DQ/period/admin fixture va handlerlari;
- TZdagi 18 majburiy biznes ekraniga tegishli route/feature’lar;
- Vitest/Testing Library va Playwright testlari;
- GitHub Actions frontend workflow’i;
- code-first design system, responsive shell va error boundary mavjud.

Joriy holat **development/demo va backendni kutib parallel ishlash uchun yaroqli**. Quyidagi sabablar tufayli production-ready emas:

- real backend/DB integration dalili yo‘q;
- accessibility va 500+ pagination/performance acceptance tugallanmagan;
- remote GitHub Actions green run dalili yo‘q.

Local frontend quality gate green: format, lint, typecheck, unit, build va Chromium+MSW suite exit code `0`. Bu holat real session/RBAC, persistence, PostgreSQL constraint, production snapshot yoki reconciliationni isbotlamaydi.

Student, group, tuition, debtor, CRM/LMS, refund, PWA yoki double-entry accounting V1’ga qo‘shilmagan.

## 3. Scope

### V1 implementatsiya qilingan frontend surface

- login, logout, `/me`, role/permission va branch scope UX;
- dashboard va canonical URL drill-down;
- expense ledger/create/detail/correction UI;
- budget list/detail/revision/submit/approve UI;
- monthly, branch, profit/loss, revenue va cashier reportlari;
- revenue plan, create, ledger, detail va reversal UI;
- data-quality/reconciliation;
- accounting period list/detail/close/reopen UI;
- category, department, payment method va branch settings;
- user, role va audit ekranlari.

### V1’dan tashqari yoki to‘liq implementatsiya qilinmagan

- real Google Sheets upload/preview/approve/job lifecycle. `/data-quality/imports` route’ida local stateful legacy-normalize MSW job bor, ammo u tashqi Google Sheets yoki DB persistence emas;
- attachment upload: detailda V1.1 schema-ready holat ko‘rsatiladi;
- async server export joblari; mavjud local CSV production export o‘rnini bosmaydi;
- real bank/payment provider integratsiyasi;
- real notification kanallari;
- refund/chargeback, double-entry/GL, PWA/offline;
- yangi filial yaratish UI;
- course/group profitability va murakkab forecast.

## 4. Phase roadmap — real status

| Phase | Natija | Joriy status | Dalil va qolgan ish |
| ---: | --- | --- | --- |
| 0 | Discovery, scaffold, typed boundary, tooling, CI config | **Frontend verified (local)** | Local format/lint/typecheck/unit/build/E2E green. Clean `npm ci` va remote CI run dalili yo‘q; real API pending. |
| 1 | Design system, auth, permission-aware shell | **Frontend verified (mock)** | Auth/direct guard, blocked login, safe user projection va read/write scope browser testlari bor. Real HTTP-only session/RBAC pending integration. |
| 2 | Dashboard va canonical drill-down | **Frontend verified (mock)** | AC-14 va AC-16 component/Playwright daliliga ega. Real aggregate parity pending. |
| 3 | Expense ledger/create/detail | **Partially frontend verified (mock)** | Read/write scope, forged write denial, idempotency, business-date/period lock va cache refetch dalili bor. AC-02 exact invalid text, AC-04, pagination va real backend pending. |
| 4 | Budget va expense reportlari | **Partially frontend verified (mock)** | AC-07 va submitted → approve → new draft revision → submit stateful browser oqimi o‘tadi. AC-05 duplicate uniqueness, AC-06/11/12/13 va DB persistence pending. |
| 5 | Revenue, plan va cashier reportlari | **Partially frontend verified (mock)** | AC-15/17/18/19/21, on-behalf permission/reason, idempotency va report/dashboard invalidation dalili bor. AC-20 va real posted aggregate parity pending. |
| 6 | DQ, period, settings, users/roles, audit | **Partially frontend verified (mock)** | Stateful import/DQ/readiness/close/reopen, safe directory va blocked login o‘tadi. Real import, atomic DB close/snapshot va admin security pending. |
| 7 | Accessibility, responsive, performance, release QA | **In progress** | Full Chromium+MSW 21/21, unit 29/29 va local static/build gate green. Manual a11y, 500+ perf, clean install, remote CI va real API E2E pending. |

Hech bir phase real backend/DB talab qiladigan qismlar bo‘yicha `Complete` deb belgilanmagan.

## 5. Phase 0 — foundation

### Implemented

- [x] authoritative TZ va frontend arxitektura hujjatlari;
- [x] strict TypeScript, path alias va Vite;
- [x] Tailwind va semantic CSS variables;
- [x] typed domain DTO/API boundary;
- [x] TanStack Query provider;
- [x] React Hook Form + Zod form foundation;
- [x] MSW browser mock;
- [x] Vitest/Testing Library setup;
- [x] Playwright setup;
- [x] ESLint va Prettier config;
- [x] runtime env validation;
- [x] `.env.example`da `VITE_API_BASE_URL` va `VITE_ENABLE_MOCKS=true`;
- [x] README va `.github/workflows/frontend-ci.yml`.

### Pending before phase completion

- [ ] `npm ci` clean-install evidence;
- [x] format, lint, typecheck, unit, build va full Chromium E2E local green evidence;
- [ ] remote CI run URL/artifact;
- [ ] real API environment smoke test.

## 6. Phase 1 — auth, design system va shell

### Implemented

- semantic UI tokenlari va shared button/form/table/KPI/state komponentlari;
- login/logout va `/me` query;
- protected va permission route guard;
- permission-driven desktop/mobile navigation;
- branch/period URL filterlari;
- responsive sidebar/topbar/mobile bottom navigation;
- loading, empty, error, forbidden, locked, not-found va app error boundary;
- director, finance+cashier va cashier mock identities.

### Verified frontend behavior

- `src/test/permission-routes.test.tsx`: session redirect, direct access denial va cashier navigation;
- `e2e/auth.spec.ts`: invalid/valid mock login, localStorage auth token yo‘qligi va cashier audit denial.
- `e2e/safe-directory.spec.ts`: cashier safe directory’da telefon, permission va write scope yo‘qligi; `/admin/users` `403`.
- `e2e/write-scope-idempotency-period.spec.ts`: finance+kassir read-all, write-only-Sayxun; forged expense/revenue mutationlari state’ni o‘zgartirmaydi.
- `e2e/stateful-workflows.spec.ts`: admin userni blocked qiladi va keyingi mock login rad etiladi.

### Pending integration/manual

- real HTTP-only cookie, expiry/refresh/logout invalidation;
- real blocked-session invalidation va rate-limit oqimi;
- server-side permission va branch scope;
- keyboard-only auth/shell audit va focus management.

## 7. Phase 2 — dashboard

### Implemented

- period va branch/all filter;
- expense plan/actual/variance;
- revenue plan/actual/shortfall/collection;
- actual expense, net result va net margin;
- fixed/variable split, channel va branch breakdown;
- DQ warning;
- KPI/chart → canonical ledger/report URL.

### Verified frontend behavior

- center `300m` plan, `180m` actual, `120m` gap, `60%` collection;
- `180m` “sof foyda” deb nomlanmaydi; `70m` net result alohida;
- canonical period/branch drill-down URL;
- Sayxun `160m/150m/10m/93.75%` revenue report fixture’i.

### Pending integration

- dashboard va target ledger real sum/count parity;
- posted-only va approved-plan source-of-truth;
- real API error/loading/performance evidence.

## 8. Phase 3 — expenses

### Implemented

- server-style paginated ledger, URL filter va detail navigation;
- date/branch/category/type/department/payment/responsible/status filterlari;
- local current-page CSV;
- typed date, positive integer UZS va master-data form;
- cashier branch lock va category-derived read-only type;
- idempotency key, double-submit protection va unsaved-change warning;
- detail snapshot, audit timeline va reasonli correction/reversal UI;
- closed-period disabled/error semantics.

### Pending verification/integration

- AC-01 exact Xalqlar kassiri → Sayxun expense ssenariysi; finance+kassir read/write scope forged write testi mavjud;
- `15.08.2026` kabi exact invalid text date request testi (`AC-02`); yopiq/ochiq business-date va timezone-boundary testlari mavjud;
- category type/snapshot request boundary test (`AC-04`);
- closed-period real mutation rejection (`AC-08`); MSW/UI bloklash tekshirilgan;
- 500+ deterministic pagination (`AC-12`);
- real export permission/scope.

## 9. Phase 4 — budgets va expense reports

### Implemented

- period/branch/category budget matrix;
- draft/submitted/approved/locked va revision actions;
- explicit `0`, no-line va no-data semantics;
- reason va historical snapshot label/type;
- monthly category × month report;
- plan/actual/variance/completion va subtotals;
- branch comparison va profit/loss report;
- drill-down URL’lari.

### Verified frontend behavior

- `src/features/revenue/revenue-shared.test.ts` zero denominatorni `null` saqlaydi;
- `e2e/acceptance-revenue-budget.spec.ts` explicit zero va absent plan’ni alohida ko‘rsatadi, `Infinity/NaN` chiqarmaydi.
- `e2e/stateful-workflows.spec.ts` submitted budjetni approve qiladi, yangi draft revision yaratadi va submit qiladi.

### Pending verification/integration

- duplicate budget uniqueness DB qismi (`AC-05`); revision UI/MSW oqimi tekshirilgan;
- overbudget exact ledger parity (`AC-06`);
- ledger/report canonical parity (`AC-11`);
- 500+ pagination (`AC-12`);
- rename/retype historical persistence (`AC-13`).

## 10. Phase 5 — revenue va cashiers

### Implemented

- revenue plan list/detail/revision/approve UI;
- revenue create: RFC3339 time, integer UZS, channel, collector, reference va description;
- on-behalf collector + reason UX;
- cashier branch lock;
- revenue ledger/detail/filter/pagination;
- reasonli reversal UI;
- center/branch KPI, channel va cashier report/drill-down;
- inactive historical cashier display.

### Verified frontend behavior

- AC-15 Sayxun `160m/150m/10m/93.75%`;
- AC-17 Sayxun channels `60m/50m/40m`, `40/33.33/26.67%` va filterli drill-down;
- AC-18 cashier `70m/80m/30m`, inactive historical cashier va collector URL;
- AC-19 Xalqlar branch lock, forged Sayxun MSW `403`, unchanged mock count/sum;
- AC-16 markaz terminology/KPI.
- finance+kassir uchun ikkala filial read scope, faqat Sayxun write scope;
- expense va revenue stable idempotency key bilan duplicate write yaratmasligi;
- direktor on-behalf collector + majburiy sabab bilan `500000` tushum yaratishi, reversal qilishi va report/dashboardning canonical qiymatga qaytishi;
- oddiy kassir collector’ni almashtira olmasligi va forged on-behalf request `403` olishi.

### Pending verification/integration

- real on-behalf permission/audit persistence;
- approved/closed plan overwrite/revision (`AC-20`);
- `500000` reversalning DB append-only persistence’i (`AC-21`); frontend/MSW net refetch tekshirilgan;
- real posted-only branch/channel/cashier parity;
- duplicate reference va backend idempotency persistence.

## 11. Phase 6 — DQ, period va administration

### Implemented

- DQ exception/filter/detail va reconciliation table;
- `6 318 400` mismatch va 43 text-date row visibility;
- period list/detail/readiness/checklist/history;
- close/reopen forms va reason UX;
- category/department/payment-method settings;
- branch read-only V1 screen;
- safe user/role UI va audit log;
- stateful local legacy import job, DQ resolve va operational readiness recompute.

### Verified frontend behavior

- `src/test/acceptance-fixtures.test.ts` legacy source/ledger/diff invariantlari;
- `e2e/data-quality.spec.ts` `6 318 400`, 43 row va invalid-date visibility;
- initial reconciliation/close blocker ko‘rinishi;
- budget approve → import → DQ resolve → readiness success → close → majburiy sabab bilan reopen stateful oqimi;
- close paytida approved budget/revenue plan lock holati va closure history;
- safe directory projection, admin status mutation va blocked userning keyingi login rad etilishi.

### Pending verification/integration

- real Google Sheets preview/approve/job lifecycle va source-row trace;
- exception resolution DB persistence;
- close atomicity va immutable facts;
- immutable full report snapshot/arxiv DB persistence va production archive endpoint; joriy MSW snapshoti in-memory va period detailda ochiladi;
- reopen permission/reason/audit persistence;
- user projection, role write va audit append-only real backend dalili.

## 12. Phase 7 — hardening va release readiness

### Implemented yoki qisman verified

- [x] route lazy loading;
- [x] reduced-motion CSS foundation;
- [x] responsive mobile shell/forms;
- [x] report table overflow strategy;
- [x] query retry/cache/cancellation foundation;
- [x] runtime env validation;
- [x] app error boundary;
- [x] 29 passing Vitest tests (6 fayl);
- [x] 21 passing Chromium+MSW Playwright test;
- [x] 390px mobile overflow scenario full suite ichida passing;
- [x] local format, lint, typecheck va production build green;
- [x] CI workflow definition.

### Pending

- [ ] keyboard-only critical flows;
- [ ] axe/screen-reader va focus audit;
- [ ] WCAG AA contrast va rangsiz status manual check;
- [ ] long Uzbek text/large UZS overflow audit;
- [ ] 500+ pagination va performance measurement;
- [ ] real API Playwright suite;
- [ ] remote CI green run.

## 13. Joriy quality evidence

2026-08-21 local workspace natijasi:

| Command | Natija | Izoh |
| --- | --- | --- |
| `npm run format:check` | **PASS** | `All matched files use Prettier code style!`, exit `0` |
| `npm run lint` | **PASS** | exit `0` |
| `npm run typecheck` | **PASS** | exit `0` |
| `npm test` | **PASS** | 6 test file, 29/29 test passed |
| `npm run build` | **PASS** | production bundle yaratildi, exit `0` |
| `npm run test:e2e -- --project=chromium --workers=1 --reporter=line` | **PASS** | 21/21 mock browser scenario, exit `0`, 31.1s |

Format check ushbu hujjat tahriridan keyin qayta bajarildi. Qolgan commandlar latest source holatida final Chromium run bilan birga bajarilgan. Natijalar local frontend/MSW gate’ni yopadi; `npm ci` clean install, remote GitHub Actions, real API E2E, backend/DB va manual acceptance hanuz alohida ochiq.

## 14. Backend dependency backlog

| ID | Kerakli real kontrakt/dalil | Ta’sir | Holat |
| --- | --- | --- | --- |
| `BE-01` | `/me`, HTTP-only session, permission va branch scope | barcha protected UI | Pending integration |
| `BE-02` | Money integer-string va nullable percentage DTO | barcha KPI/form | Pending integration |
| `BE-03` | Revenue RFC3339 timestamp, business date va precision | revenue | Pending integration |
| `BE-04` | Period readiness/close/reopen transaction | period, expense, budget, revenue | Pending integration |
| `BE-05` | Budget/revenue plan revision va approval | planning | Pending integration |
| `BE-06` | DQ exception resolve va import job lifecycle | DQ/import | Pending integration |
| `BE-07` | Safe user directory va role management | admin | Pending integration |
| `BE-08` | Canonical report semantic flags va aggregate parity | dashboard/report | Pending integration |
| `BE-09` | Async export job/status/download | ledger/report | Pending contract |
| `BE-10` | API error catalog, idempotency va duplicate policy | mutations | Pending integration |

## 15. Keyingi ish tartibi

1. Production API contractini current typed adapter bilan kelishtirish: safe/admin user DTO, read/write scope, report aggregate, idempotency va error code.
2. Real HTTP-only session va backend adapterini ulash, `FE-E2E-REAL` suite yaratish.
3. Real Google Sheets import, DQ/reconciliation va atomic close/reopen/report-snapshot persistence’ini integratsiya qilish.
4. AC-specific qolgan frontend regressionlarni yozish: exact `01–06`, `11–13`, `20` va 500+ pagination.
5. Backend/DB integration dalillari bilan AC matrixni yangilash.
6. Accessibility va performance manual/automated gate’larini yopish.
7. `npm ci`dan boshlanadigan remote CI green run URL/artifactini evidence logga qo‘shish.

## 16. Release gate

Production candidate faqat quyidagi buyruqlarning barchasi exit code `0` bo‘lganda frontend quality gate’dan o‘tadi:

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- --project=chromium
```

Bundan keyin ham real backend/DB uchun `BE-INT`, `DB`, security va migration/reconciliation acceptance alohida majburiy.

## 17. Yakuniy V1 checklist

- [x] TZdagi majburiy frontend ekran/route surface’i implementatsiya qilingan;
- [x] student domeni qo‘shilmagan;
- [x] permission-aware navigation va direct forbidden route mock testga ega;
- [x] money va `Asia/Tashkent` formatter unit testga ega;
- [x] key revenue KPI, cashier, DQ va drill-down mock acceptance daliliga ega;
- [x] local format/lint/typecheck/unit/build/Chromium frontend gate green;
- [x] safe user projection, read/write scope, idempotency, stateful import/close va cache invalidation mock acceptance daliliga ega;
- [ ] barcha AC frontendga tegishli maxsus regression testga ega;
- [ ] branch scope real backendda tekshirilgan;
- [ ] historical snapshot va collector persistence DB bilan tekshirilgan;
- [ ] period close/reopen va reversal append-only ekanligi DB bilan tekshirilgan;
- [ ] `npm ci`dan boshlanadigan clean local/CI release gate qayd etilgan;
- [ ] remote CI green;
- [ ] manual accessibility/performance checklist yopilgan;
- [ ] AC-01…AC-22 real backend/DB evidence bilan integration verified.

**Halol yakun:** frontend surface va asosiy mock ssenariylar mavjud, ammo loyiha hozircha 100% production-ready emas va AC-01…AC-22 to‘liq yopilgan deb hisoblanmaydi.
