# FINCORE — Figma va TZ moslik tahlili

**Figma fayl:** `OWVbR4UnwiYHCsz1QUInR6`  
**Taqqoslangan TZ:** `PLATFORM_TZ_FROM_GOOGLE_SHEET.md`  
**Xulosa:** Figma TZ'ga 100% mos emas. Figma kengaytirilgan product vision; TZ esa Sheets'dagi real xarajat/budjet jarayonining V1 spetsifikatsiyasi.

> Auditda Figma'ning 53 ta frame'i inventarizatsiya qilingan. 15 tasi screenshot bilan chuqur tekshirilgan, 38 tasi frame nomi/layout strukturasi bo'yicha tekshirilgan. Shu sabab metadata-only ekranlardagi field va validationlar “tasdiqlanmagan” hisoblanadi.

## 1. Yakuniy moslik bahosi

| Yo'nalish | Moslik | Izoh |
|---|---|---|
| Moliya/kurs markazi konteksti | Kuchli | Ikkala manba ham education-center finance platformasini ko'rsatadi. |
| Xarajatlar yadrosi | Qisman kuchli | Figma'da list, filial, kategoriya, payment method va plan-vs-fact bor; TZ'dagi typed-date, data-quality va import traceability ko'rinmaydi. |
| Budjet | Kuchli | Ikki filial × kategoriya × oy va Finance Manager → Director tasdig'i mavjud. |
| Oylik/branch reportlar | Qisman | Dashboard va plan-vs-fact bor; ayrim Reports Center cards uchun dedicated ekran topilmagan. |
| RBAC/filial cheklovi | Konsept mos | Figma Viewer/Adminni ko'rsatadi; Sheets 3 ta real rolni tasdiqlaydi. |
| Expense approval | Ziddiyat | Figma pending/approved/rejected queue'ni asosiy oqim qiladi; Sheets'da per-expense gate yo'q. |
| Income/student/refund | Figma-only | Sheets/TZ V1'da yo'q. |
| Break-even | Figma-only | Sheets fixed/variable sababini aytadi, revenue ma'lumoti bermaydi. |
| Closing | Konsept mos, policy ochiq | Figma irreversible + checklist + SHA-256; TZ controlled reopen variantini beradi. |
| PWA/offline | Mos emas | Figma mobile frame'lari bor, lekin PWA install/offline/sync flow yo'q. |
| Design system | Tayyor emas | 0 reusable component/instance va 0 token qayd etilgan. |

**Qaror:** Figma'ni o'zgartirmasdan implementatsiya qilish mumkin emas. Google Sheets'dan tasdiqlangan qoidalar V1 source-of-truth bo'lib qoladi; Figma mos UI reference sifatida ishlatiladi.

## 2. Bevosita mos qismlar

- Executive dashboard: filial, oy, reja, fakt, bajarilish va overbudget statuslari.
- Xarajatlar ro'yxati, yangi xarajat va filial/kategoriya/payment filterlari.
- Budget editor: ikki filial satrlari, category-level reja va Finance Manager → Director approval stepper.
- Monthly report / Reja–Fakt konsepti.
- Month closing, closed-period archive va success modal.
- Administration, user va audit log konsepti.
- Mobile cashier shell va mobile new expense.

## 3. TZ'da bor, Figma'da to'liq ko'rsatilmagan qismlar

- `Data quality / reconciliation` — TZ'da P0; Figma'da faqat report discrepancy edge-case bor.
- Import exception queue — TZ migration qoidasi; Figma'da dedicated operativ ekran yo'q.
- Source-row traceability, correction/reversal va immutable ID — Figma'da tasdiqlanmagan.
- Category alias/version va historical snapshot — Figma'da ko'rinmaydi.
- Filiallar taqqoslash — Reports Center card bor, lekin dedicated top-level frame auditda topilmagan.

## 4. Figma'dagi, ammo TZ V1'ga kirmaydigan qismlar

- Daromadlar ro'yxati, yangi to'lov, o'quvchi profili va yangi qaytim.
- Expense approval queue/history, attachment va high-value threshold.
- Breakeven, active students, average check, revenue/profit KPI'lari.
- Cash balance, cash-flow va payment-provider label'lari.
- QA Dashboard, test detail, sync error, SMS verification, first-login password change.

Bu ekranlar borligi ularning real biznes scope'ga kirganini isbotlamaydi; Google Sheets'da income/student/refund ma'lumotlari yo'q.

## 5. Muhim domen konfliktlari

### Expense approval

Sheets'da kassir xarajatni kiritadi va jurnalga tushadi; per-expense pending gate yo'q. Figma esa `Tasdiqlandi / Tasdiq kutilmoqda / Rad etildi`, queue, approve/reject va attachmentlarni asosiy oqim sifatida ko'rsatadi.

TZ'dagi to'g'ri yechim:

- V1: xarajat `auto-approved`, approval schema-ready, workflow default OFF.
- Phase 2: threshold, pending/rejected, reject reason, queue, attachment va notifications.

### Filiallar

Sheets faqat `Sayxun` va `Xalqlar do'stligi`ni tasdiqlaydi. Figma ayrim dashboard/admin screenshotlarda `Yunusobod`, `Chilonzor` va “Filial qo'shish”ni ko'rsatadi. V1 UI 2 ta seed filial bilan qoladi; DB `branches` table dynamic bo'lishi mumkin.

### Rollar

Sheets: Madina (Moliya rahbari + kassir), Maftuna (Kassir), Abdulla (Direktor). Figma: Viewer literal ko'rinadi; Moliya Menejeri/Boshqaruvchi Direktor va Administrator role-like yoki inferred. V1'da 3 real rolni seed qilish, `Viewer` va `Administrator`ni faqat owner tasdiqlasa yoqish tavsiya etiladi.

### Closing policy

Figma “ortga qaytarilmaydi” deydi, TZ esa controlled reopen'ni taklif qiladi. Bitta policy tanlanishi kerak. Tavsiya: faqat director, majburiy sabab, approval va to'liq audit bilan emergency reopen.

## 6. Report va raqamlar

Sheets formulalari:

```text
Fakt = SUM(expenses.amount)
Reja = approved budget line
Farq = Reja - Fakt
Bajarilish % = Fakt / Reja
```

Figma dashboardidagi sample raqamlar Sheets bilan bir xil emas: masalan, Figma `197,726,000` so'm reja ko'rsatadi; Sheetsda `198,726,000` va category string mismatchdan keyin `197,526,000` variantlari bor. Figma sample raqamlari migration yoki acceptance source'i bo'la olmaydi.

Figma Reports Center 8 ta card ko'rsatadi: Oylik, Filiallar taqqoslash, Yillik, Breakeven, Naqd oqim, Xarajatlar tahlili, Daromad tahlili va Reja–Fakt. Auditda faqat Oylik va Breakeven uchun dedicated top-level frame tasdiqlangan. V1 report contract'i kamida monthly, branch comparison, two-branch matrix, dashboard va data-quality/reconciliationni aniq qamrashi kerak.

## 7. Shell, design system va responsive muammolari

Figma'da kamida 6 xil shell/brand bor:

1. `FINCORE / Financial Platform`.
2. `IT Live Academy / FINCORE Executive`.
3. `FINCORE ERP — Financial Management`.
4. `FINCORE Systems — Financial Control`.
5. `FINCORE ERP — Moliyaviy nazorat`.
6. Mobile shell — 4 ta bottom-nav item.

Bundan tashqari Uzbek/English label'lar aralashgan va Admin shell'da `+ New Payment` kabi noto'g'ri action bor. Bu route, permission va product identity'ni noaniq qiladi.

Design system audit:

- reusable Figma components/instances: 0;
- design token/variable: 0;
- sidebar, KPI card, badge, table, button va modal — faqat alohida chizilgan visual patternlar;
- attached UI libraries bor, lekin ishlatilgan component instance aniqlanmagan.

Responsive audit:

- 37 desktop frame, 14 mobile frame;
- tablet frame yo'q;
- mobile bottom-nav desktopdagi barcha modulni qamramaydi;
- PWA install/offline/update/sync state'lari yo'q.

## 8. P0 moslashtirish checklisti

1. Bitta canonical shell/brand tanlash; `IT Live Academy + FINCORE` varianti tavsiya qilinadi.
2. Desktop/mobile nav va route taxonomy'ni birlashtirish.
3. V1'dan Income, Students, Refunds, Breakeven va Cash Flow'ni yashirish yoki Phase 3 deb belgilash.
4. V1 Budget approvalni faol, Expense approvalni default OFF qilish.
5. Figma'da Data Quality/Reconciliation va Filiallar taqqoslash ekranlarini qo'shish yoki generic report viewer contract'ini ko'rsatish.
6. Production UI'da faqat Sayxun va Xalqlar do'stligini seed qilish; 4-filial demo data'ni ajratish.
7. Closing checklistni V1 expense/budget/DQ entitylariga moslash; checksum formatini yozma ravishda aniqlash.
8. Sample raqamlarni Sheets source raqamlariga almashtirish yoki `Demo data` deb belgilash.
9. Reject reason, empty/error/loading, import exception va report mismatch state'larini to'liq chizish.
10. Token, typography, spacing, table/badge/button/modal component library yaratish.
11. Prototype flow'larini tasdiqlash: login → dashboard, expense → list, budget → approval, close → success.
12. Tablet breakpoint va mobile “More” navigatsiyasi bo'yicha qaror chiqarish.

## 9. Scope mapping

### V1

Ikki filialli expense form va unified ledger; typed date; immutable ID; master-data FK; branch-scoped RBAC; budget version/revision; Finance Manager → Director budget approval; monthly report; dashboard; branch comparison; data-quality/reconciliation; audit log; period lock; responsive cashier form.

### Phase 2

Expense attachment; configurable approval threshold; pending/rejected queue; reject reason; approval history; notifications; correction/reversal UX; scheduled export.

### Phase 3

Income, student, tuition, refund, payment provider integration, cash-flow, revenue-based break-even, profit KPI, 4+ filial operational management va PWA/offline sync.

## 10. Yakuniy xulosa

Figma **core finans oqimi bo'yicha mos**, lekin **scope, role, branch, approval, closing policy va design-system bo'yicha to'liq mos emas**. To'g'ri implementatsiya tartibi:

1. Sheets-confirmed V1 TZ'ni asos qilish.
2. Figma'dagi mos core ekranlarni shu API/data contract'ga moslash.
3. Figma-only modullarni Phase 2/3ga ajratish.
4. P0 checklist yopilmaguncha ekranlarni kodlashni boshlamaslik.
