# FINCORE frontend acceptance matrix

**Versiya:** 1.1  
**Sana:** 2026-08-21  
**Asosiy manba:** `PLATFORM_TZ_FROM_GOOGLE_SHEET.md` v1.2, AC-01…AC-22  
**Holat:** frontend va mock dalillari qayd qilingan; real backend/DB acceptance hali bajarilmagan

## 1. Status va dalil chegarasi

| Status | Ma’no |
| --- | --- |
| `Frontend verified (mock)` | Ko‘rsatilgan frontend xulqi Vitest yoki Playwright + MSW bilan exit code `0` natijada tekshirilgan. Bu backend xavfsizligi yoki DB yaxlitligini isbotlamaydi. |
| `Partially verified` | Talabning faqat fixture, formatter, URL yoki ko‘rinish qismi avtomatlashtirilgan. |
| `Implemented, unverified` | UI va/yoki MSW oqimi mavjud, lekin AC uchun maxsus passing regression testi yo‘q. |
| `Pending integration` | Real API, autentifikatsiya, PostgreSQL constraint/transaction yoki real import dalili kerak. |
| `Integration verified` | Frontend, real backend va zarur DB dalillari birga o‘tgan. Hozir bunday AC yo‘q. |

Dalil darajalari:

| Daraja | Ma’no |
| --- | --- |
| `FE-UNIT` | formatter, calculation, fixture invariant yoki permission helper testi |
| `FE-COMP` | React component/router interaction testi |
| `FE-MSW` | browser yoki component oqimi mock HTTP contract bilan |
| `FE-E2E-MOCK` | Playwright browser oqimi MSW bilan |
| `FE-E2E-REAL` | Playwright real backend bilan; hali bajarilmagan |
| `BE-INT` | backend endpoint + auth + persistence integration; hali bajarilmagan |
| `DB` | constraint, transaction, RLS/audit/reconciliation testi; hali bajarilmagan |
| `MANUAL` | accessibility, visual va product tekshiruvi |

Muhim chegara: MSW’dagi `403`, period lock, revision yoki reconciliation javobi real server shu qoidani bajarayotganini isbotlamaydi. Shu sabab frontendda o‘tgan AC’larning ham backend ustuni `Pending integration` bo‘lib qoladi.

## 2. Joriy command evidence

2026-08-21 kuni workspace’da bajarilgan natijalar:

| Command | Natija | Dalil/izoh |
| --- | --- | --- |
| `npm run format:check` | **PASS** | `All matched files use Prettier code style!`, exit `0`; docs update’dan keyin qayta run qilindi. |
| `npm run lint` | **PASS** | exit `0` |
| `npm run typecheck` | **PASS** | exit `0` |
| `npm test` | **PASS** | 6 test file, 29/29 test passed |
| `npm run build` | **PASS** | production bundle yaratildi, exit `0` |
| `npm run test:e2e -- --project=chromium --workers=1 --reporter=line` | **PASS** | 21/21 Chromium+MSW browser scenario, exit `0`, 31.1s |

`.github/workflows/frontend-ci.yml` mavjud va `npm ci → format → lint → typecheck → test → build → Chromium E2E` ketma-ketligini belgilaydi. Ushbu hujjat yozilgan paytda GitHub Actions run URL yoki remote green run dalili yo‘q; workflow mavjudligini “CI passed” deb hisoblab bo‘lmaydi.

## 3. AC-01…AC-22 joriy matrix

| AC | Frontend/mock holati va dalili | Real backend/DB uchun qolgan dalil | Joriy status |
| --- | --- | --- | --- |
| `AC-01` | `e2e/write-scope-idempotency-period.spec.ts` read-all/write-only-Sayxun userdan Xalqlarga forged expense `POST`ni `403` qiladi va count/sum o‘zgarmasligini tekshiradi; exact Xalqlar kassiri → Sayxun varianti yo‘q. | Exact AC user/scope bilan real session `403` va DB’da satr yaratilmasligi. | **Partially verified; Pending integration** |
| `AC-02` | Fixture invalid text-date exceptionni, browser test esa open/closed business-date hamda `Asia/Tashkent` timezone boundarysini tekshiradi. Exact `15.08.2026` live request testi yo‘q. | Strict typed date validation, import exception persistence va ledgerga yozilmaslik. | **Partially verified; Pending integration** |
| `AC-03` | Category management UI/MSW va selectorlar implementatsiya qilingan; create → refetch → budget/report propagation regression testi yo‘q. | Persistence, permission va dynamic report/master query. | **Implemented, unverified; Pending integration** |
| `AC-04` | Expense form computed type va detail snapshotni ko‘rsatadi; AC-ga maxsus component testi yo‘q. | Type/snapshot server-derived bo‘lishi va forged patch bloklanishi. | **Implemented, unverified; Pending integration** |
| `AC-05` | `e2e/stateful-workflows.spec.ts` submitted budgetni approve qilib, yangi draft revision yaratish va submitni tekshiradi; duplicate line varianti yo‘q. | `(version, branch, category)` uniqueness va atomic revision. | **Partially verified; Pending integration** |
| `AC-06` | Variance/status/drill-down UI mavjud; exact overbudget parity testi yo‘q. | Canonical `reja − fakt` aggregate va detail sum/count tengligi. | **Implemented, unverified; Pending integration** |
| `AC-07` | `src/features/revenue/revenue-shared.test.ts` va `e2e/acceptance-revenue-budget.spec.ts` nol reja, no-plan va `—` semantikasini tekshiradi. | Real report DTO’da `hasPlan`, explicit `0` va nullable percentage semantikasi. | **Frontend verified (mock); Pending integration** |
| `AC-08` | `e2e/stateful-workflows.spec.ts` blocked readinessdan stateful close’gacha boradi va period/budget/revenue lock holatini MSW’da o‘zgartiradi; close’dan keyingi har edit endpoint alohida assert qilinmagan. | Close permission, atomic close va expense/budget/revenue DB immutability. | **Partially verified; Pending integration** |
| `AC-09` | Shu browser oqimi reopen sababining majburiyligini va closure history’da ko‘rinishini tekshiradi. | Real permission, mandatory reason va append-only event/audit persistence. | **Frontend verified (mock); Pending integration** |
| `AC-10` | Fixture va `e2e/data-quality.spec.ts` 43 satr/`6 318 400`ni ko‘rsatadi; stateful workflow importni ishga tushirib 43 normalize va 1 exception natijasini tekshiradi. | Real Google Sheets parser, har source row trace, normalization/exception persistence va final reconciliation. | **Frontend verified (mock); Pending integration** |
| `AC-11` | Ledger/report route va filter UI mavjud; bir xil filterdagi sum/count parity testi yo‘q. | Bitta source-of-truth query va real ledger/report sum/count tengligi. | **Implemented, unverified; Pending integration** |
| `AC-12` | Server-style pagination UI/MSW mavjud; 500+ unique ID dataset regression testi yo‘q. | Deterministic cursor/sort, 500+ rowda missing/duplicate yo‘qligi. | **Implemented, unverified; Pending integration** |
| `AC-13` | Historical snapshot label/type render qilinadi; rename/retype’dan keyingi persistence testi yo‘q. | Master change tarixiy fact/budget snapshotini qayta yozmasligi. | **Implemented, unverified; Pending integration** |
| `AC-14` | `src/test/dashboard.integration.test.tsx` va `e2e/dashboard.spec.ts` canonical period/branch drill-down URL’ni tekshiradi. | KPI va target ledger real canonical aggregate sum/count parity. | **Frontend verified (mock URL); Pending integration** |
| `AC-15` | Fixture/unit va `e2e/acceptance-revenue-budget.spec.ts` Sayxun `160m/150m/10m/93.75%`ni tekshiradi. | Approved plan + posted-only real aggregate. | **Frontend verified (mock); Pending integration** |
| `AC-16` | `src/test/acceptance-fixtures.test.ts`, `src/test/dashboard.integration.test.tsx` va `e2e/dashboard.spec.ts` markaz `300m/180m/120m/60%` hamda alohida `70m` net resultni tekshiradi. | Branch plan sum, posted revenue va actual expense real aggregate’i. | **Frontend verified (mock); Pending integration** |
| `AC-17` | `e2e/acceptance-revenue-budget.spec.ts` Sayxun `60m/50m/40m`, `40/33.33/26.67%` va channel drill-downni tekshiradi. | Posted-only channel sumlari real branch totalga tengligi. | **Frontend verified (mock); Pending integration** |
| `AC-18` | `src/test/acceptance-fixtures.test.ts` va `e2e/cashiers.spec.ts` `70m/80m/30m`, tarixiy nofaol kassir va collector drill-downni tekshiradi. | Aggregate aynan `collector_user_id` bo‘yicha bo‘lishi va historical user persistence. | **Frontend verified (mock); Pending integration** |
| `AC-19` | `e2e/acceptance-revenue-budget.spec.ts` disabled Xalqlar branch selector, forged Sayxun MSW `403` va unchanged count/sumni tekshiradi. | Xuddi shu forged request real auth/backend/DB bilan bloklanishi. | **Frontend verified (MSW); Pending integration** |
| `AC-20` | Approved/closed plan uchun disabled/conflict/revision UX implementatsiya qilingan; passing AC testi yo‘q. | Raw overwrite bloklanishi, revision yoki audited reopen transaction. | **Implemented, unverified; Pending integration** |
| `AC-21` | `e2e/stateful-workflows.spec.ts` `500000` on-behalf tushumni yaratadi, reasonli reversal qiladi va revenue report/dashboardning canonical qiymatga qaytishini tekshiradi. | Append-only original/reversal/audit va real aggregate’dan `500000` ayrilishi. | **Frontend verified (mock); Pending integration** |
| `AC-22` | Fixture/DQ test mismatch va close blockerini ko‘rsatadi; stateful workflow import+DQ resolve’dan keyin reconciliation/readinessni qayta hisoblab close’ni ochadi. Barcha kesim net-total parity alohida assert qilinmagan. | Center=branches=channels=cashiers real net posted parity, persisted exception va close block. | **Partially verified; Pending integration** |

### Xulosa

- Frontend/mock darajasida maxsus passing dalil bor AC’lar: `07`, `09`, `10`, `14`, `15`, `16`, `17`, `18`, `19`, `21`.
- Talabning bir qismi browser/fixture bilan tekshirilgan AC’lar: `01`, `02`, `05`, `08`, `22`.
- UI/MSW implementatsiyasi bor, lekin AC-specific passing regression testi yetarli emas: `03`, `04`, `06`, `11`, `12`, `13`, `20`.
- `Integration verified`: **0/22**. Real backend/DB ulanmaguncha hech bir AC production darajasida yopilgan hisoblanmaydi.

## 4. Critical non-AC frontend regressionlar

| Test ID | Joriy dalil | Status |
| --- | --- | --- |
| `FE-AUTH-01` | `e2e/auth.spec.ts`: invalid va valid mock login. | Frontend verified (mock); real auth pending |
| `FE-AUTH-02` | `e2e/stateful-workflows.spec.ts`: admin userni blocked qiladi va keyingi mock loginni rad etadi. Active sessionning real `/me` invalidationi pending. | Frontend verified (mock); real auth pending |
| `FE-AUTH-03` | `src/test/permission-routes.test.tsx` va `e2e/auth.spec.ts`. | Frontend verified (mock) |
| `FE-SEC-01` | E2E localStorage’da auth token yo‘qligini tekshiradi; HTTP-only cookie real backendga bog‘liq. | Partial; Pending integration |
| `FE-SEC-02` | `e2e/safe-directory.spec.ts`: cashier directory telefon/permission/write scope’ni qaytarmaydi va `/admin/users` `403`. | Frontend verified (mock); backend projection pending |
| `FE-SCOPE-02` | `e2e/write-scope-idempotency-period.spec.ts`: read scope va write scope mustaqil; forged writes state’ni o‘zgartirmaydi. | Frontend verified (mock); backend/DB pending |
| `FE-REV-01` | `e2e/stateful-workflows.spec.ts`: director on-behalf reasoni majburiy, oddiy kassir selector/forged request bilan bloklanadi. | Frontend verified (mock); backend audit pending |
| `FE-IDEM-01` | Expense va revenue bir xil header/body key bilan ikki marta yuborilganda bitta yozuv qoladi; mismatch `422`. | Frontend verified (mock); durable backend idempotency pending |
| `FE-CACHE-01` | Revenue create/reversalidan keyin report/dashboard refetch canonical totalni ko‘rsatadi. | Frontend verified (mock); real report parity pending |
| `FE-STATE-01` | Shared loading/empty/error/forbidden/closed komponentlari mavjud; state matrix testi yo‘q. | Implemented, unverified |
| `FE-STATE-02` | AC-07 zero/no-plan testlari bor; no-data/import-error to‘liq matrixi yo‘q. | Partially verified |
| `FE-HIST-01` | `e2e/cashiers.spec.ts` nofaol kassirni tekshiradi. | Frontend verified (mock); DB pending |
| `FE-A11Y-01` | Semantik label/role’lar ishlatilgan, lekin axe va keyboard-only manual audit bajarilmagan. | Pending manual/test |
| `FE-MOBILE-01` | `e2e/mobile.spec.ts` 390px scenario full 21/21 Chromium suite ichida o‘tdi. | Frontend verified (mock); broader device audit pending |
| `FE-TIME-01` | `src/test/format.test.ts` `Asia/Tashkent` conversionni tekshiradi. | FE-UNIT verified |
| `FE-TIME-02` | Browser test UTC boundarydan Tashkent business date/period hosil bo‘lishini va offset yo‘q request radini tekshiradi. | Frontend verified (mock); backend pending |
| `FE-MONEY-01` | `src/test/format.test.ts` large integer, decimal/exponent va safe chart conversionni tekshiradi. | FE-UNIT verified |
| `FE-PERF-01` | Lazy routes va query cancellation foundationi mavjud; 500+ pagination/performance measurement yo‘q. | Implemented, unverified |

## 5. Amaldagi test fayl xaritasi

```text
src/test/setup.ts
src/test/format.test.ts
src/test/api-client.test.ts
src/test/permission-routes.test.tsx
src/test/acceptance-fixtures.test.ts
src/test/dashboard.integration.test.tsx
src/features/revenue/revenue-shared.test.ts
e2e/support/auth.ts
e2e/auth.spec.ts
e2e/dashboard.spec.ts
e2e/cashiers.spec.ts
e2e/data-quality.spec.ts
e2e/acceptance-revenue-budget.spec.ts
e2e/safe-directory.spec.ts
e2e/stateful-workflows.spec.ts
e2e/write-scope-idempotency-period.spec.ts
e2e/mobile.spec.ts
```

## 6. Acceptance fixture katalogi

| Fixture | Qiymat | Joriy avtomatik dalil |
| --- | --- | --- |
| Sayxun revenue | plan `160000000`, actual `150000000`, shortfall `10000000`, `93.75%` | Vitest fixture + Playwright |
| Center revenue | plan `300000000`, actual `180000000`, shortfall `120000000`, `60%` | Vitest + component + Playwright |
| Sayxun channel split | cash `60000000`, card `50000000`, bank `40000000`, total `150000000` | Playwright |
| Cashier split | `70000000`, `80000000`, `30000000`; Sayxun subtotal `150000000` | Vitest + Playwright |
| Legacy DQ | source `52433400`, ledger `46115000`, diff `6318400`, 43 row | Vitest + Playwright visibility + stateful import/DQ resolve |
| Plan semantics | explicit `0` va absent line alohida | Unit + Playwright |
| Historical cashier | inactive `Komil Normurodov`, `80000000` | Vitest + Playwright |
| Period/reversal | open/closed, close history va `500000` reversal | Stateful Playwright; DB append-only/snapshot pending |

## 7. Manual va production release gate

Quyidagilar hali yopilmagan:

- keyboard-only login → create → detail → logout;
- dialog focus trap/return va screen-reader error announcement;
- axe/WCAG AA audit va rangsiz status tekshiruvi;
- chart uchun textual/table fallbackning to‘liq manual auditi;
- 500+ transaction pagination va performance measurement;
- real backend branch scope, period lock, revision, reversal va import reconciliation;
- production HTTPS/cookie/CSRF siyosati;
- remote CI green run.

Production acceptance uchun quyidagi gate’larning barchasi exit code `0` bo‘lishi kerak:

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- --project=chromium
```

So‘ng `FE-E2E-REAL`, `BE-INT` va `DB` dalillari qo‘shiladi. Joriy holat development/mock verification bo‘lib, **100% production-ready yoki AC-01…22 to‘liq yopildi degan da’vo qilinmaydi**.
