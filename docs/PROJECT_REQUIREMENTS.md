# FINCORE — Project Requirements (Business Source of Truth)

**Status:** First version derived from an original business artifact. Supersedes Figma-only inference wherever the two disagree — the Excel is the real-world process; Figma is a proposed digitization of it.
**Primary source:** Google Sheets workbook, ID `1OWIABt9nsVXcwhVh9ZfUTOtHjDgaF-9K6mcVvvbm8so` — downloaded as `.xlsx` (read-only), 12 worksheets, all read and analyzed in full: `Yoriqnoma`, `Sozlamalar`, `Jurnal`, `Oylik_hisobot`, `Xulosa`, `Filiallar_taqqoslash`, `2_filial_bitta_jadval`, `Budjet_tarixi`, `Sayxun_kassa`, `Xalqlar_kassa`, `Xarajat`, `Rollar`.
**Secondary source:** `docs/PHASE_15_DEVELOPMENT_SPECIFICATION.md` (Figma audit).
**Classification legend used throughout:** `CONFIRMED FROM ORIGINAL EXCEL` · `CONFIRMED FROM FIGMA` · `CONFIRMED FROM BOTH` · `INFERRED` · `NOT VERIFIED` · `CONFLICTING`. No item below has been silently upgraded past what its evidence supports.

---

## 1. Project Overview

FINCORE is the proposed digitization of a real, currently-manual, Excel-based financial-management process used by **IT Live Academy**, an education/tutoring organization operating **2 branches**: Sayxun and Xalqlar do'stligi. — `CONFIRMED FROM ORIGINAL EXCEL` (Yoriqnoma R2: "IT Live Academy · Excel instrumenti · qo'llanma"; Yoriqnoma R1 title: "MOLIYA TIZIMI — 2 FILIAL UCHUN OYLIK XARAJATLAR" / "Finance System — Monthly Expenses for 2 Branches").

The word **"FINCORE" itself never appears anywhere in the Excel workbook.** The Excel calls the process simply "MOLIYA TIZIMI" (Finance System). "FINCORE" (and its variants "FINCORE ERP," "FINCORE Systems," "FINCORE Executive") are Figma-only naming choices for the software product being proposed to digitize this organization's process. — `CONFIRMED FROM FIGMA` (naming) / `NOT VERIFIED` (that this is the organization's chosen product name) — see §36.

## 2. Current Business Problem

`INFERRED` (this framing is not literally stated as a "problem" anywhere in the workbook; it is a reasonable synthesis of what the artifact's structure reveals, combined with the task's own framing that this workbook "represents the existing real-world financial workflow that FINCORE is intended to digitize"):

The organization currently tracks 2-branch monthly expenses and budgets through a shared, manually-maintained Excel workbook. Data integrity depends on human discipline rather than system enforcement: branch-scoped entry is a written instruction, not an access control; historical-budget immutability is a written instruction ("eski oylarni o'zgartirmang" — don't change old months), not a locked record; variance review is a manual monthly habit, not an automated alert. There is no live multi-user concurrency control, no per-expense approval gate, and no income/revenue tracking at all (see §35).

## 3. Existing Manual Workflow

`CONFIRMED FROM ORIGINAL EXCEL` — the workbook's own `Yoriqnoma` (Guide) sheet states this as an explicit 4-step process:

1. **Check your role** on the `Rollar` sheet to know which pages you're responsible for.
2. **Cashier data entry** — Madina enters into `Sayxun_kassa`, Maftuna enters into `Xalqlar_kassa`.
3. **Budget** — Madina enters both branches' monthly limits into the relevant month-block in `Budjet_tarixi`.
4. **Control** — `Jurnal` auto-aggregates from both cashier sheets; reports and dashboards auto-calculate from `Jurnal`.

Color convention (`CONFIRMED FROM ORIGINAL EXCEL`, Yoriqnoma): yellow cell = manual input required; green text = auto-pulled from another sheet, do not edit; black text = formula result, do not edit.

## 4. Business Objectives

`INFERRED` (synthesized from the manual workflow's evident weak points plus the task's own "digitize and evolve into a platform" framing — not literally stated as objectives in the source):
- Replace manual, honor-system branch scoping with enforced access control.
- Replace the manual "don't touch old months" instruction with a technically immutable budget-history record.
- Replace manual monthly variance review with automated/real-time budget-vs-actual reporting.
- Extend beyond the current expense-and-budget-only scope into a fuller platform (the Figma file's Income/Approval/Reports/Closing/Admin phases represent this evolution — see §35 for what is Figma-only, not yet part of the confirmed current process).

## 5. Organizations / Branches

`CONFIRMED FROM ORIGINAL EXCEL`: Exactly **2 branches** exist in the current real process:
- **Sayxun**
- **Xalqlar do'stligi**

Every one of the 12 worksheets that contains branch data (`Sozlamalar`, `Jurnal`, `Sayxun_kassa`, `Xalqlar_kassa`, `Oylik_hisobot`, `Xulosa`, `Filiallar_taqqoslash`, `2_filial_bitta_jadval`, `Budjet_tarixi`, `Rollar`) uses only these two branch names, consistently.

`CONFLICTING`: Phase 15's Figma audit recorded at least 4 branch names appearing in screenshots — Sayxun, Xalqlar do'stligi, **Yunusobod**, **Chilonzor** (Executive Dashboard's "Filiallar Kesimida" panel and the Expense list's Filial column). The Excel — the actual operating reality — confirms only 2 branches exist today. See §36 CONFLICT-E1.

## 6. Confirmed Branch Model

`CONFIRMED FROM ORIGINAL EXCEL`:
- A branch is a first-class scoping dimension on every expense transaction and every budget line.
- Every report supports both a **single-branch view** and a **combined ("Barchasi"/All) view** that sums both branches (§22–23, §36).
- Branches are currently a small, fixed, named set (2) — not evidenced as a self-service "add a branch" admin feature anywhere in the Excel (the workbook is hand-built per-branch; adding a 3rd branch today would require manually adding new sheets/columns). Whether the platform should support dynamic branch creation is `NOT VERIFIED` from this source.

## 7. Confirmed User Roles

`CONFIRMED FROM ORIGINAL EXCEL` — extracted verbatim from the `Rollar` sheet (the workbook's own authoritative role source), 3 named people, 3 roles:

| Xodim (Staff) | Roli (Role) — **ORIGINAL, verbatim** | Filial (Branch) |
|---|---|---|
| Soyibjonova Madina | **"Moliya rahbari + kassir"** (Finance Head + Cashier — one combined role held by one person) | Sayxun |
| Mamurova Maftuna | **"Kassir"** (Cashier) | Xalqlar do'stligi |
| Ergashev Abdulla | **"Direktor"** (Director) | Barchasi (All) |

Note the combined role: Madina is simultaneously the finance head (who plans the whole organization's budget) *and* the Sayxun-branch cashier — a real person holding two functions at once. Whether the platform should model this as one combined role or two separate role-assignments on one user account is an open modeling choice (see Normalization Recommendation below).

## 8. Role Responsibilities

`CONFIRMED FROM ORIGINAL EXCEL` (`Rollar` sheet, "Asosiy qoida" / core rule column, verbatim):
- Soyibjonova Madina: **"Budjet va Sayxun xarajatlari uchun javobgar"** — responsible for the Budget (both branches) and for Sayxun's expenses.
- Mamurova Maftuna: **"Faqat Xalqlar do'stligi xarajatlarini kiritadi"** — enters only Xalqlar do'stligi expenses.
- Ergashev Abdulla: **"Yakuniy nazorat va tasdiqlash"** — final control and approval.

## 9. Branch Access Scope

`CONFIRMED FROM ORIGINAL EXCEL` (`Rollar` sheet, "Ma'lumot kiritadi" / data-entry-access and "Faqat ko'radi" / view-only columns, verbatim):

| Role | Data entry access | View access | Branch scope |
|---|---|---|---|
| Moliya rahbari + kassir (Madina) | `Sayxun_kassa`, `Budjet_tarixi`, `Sozlamalar` | `Jurnal` va barcha hisobotlar (Journal + all reports) | Sayxun |
| Kassir (Maftuna) | `Xalqlar_kassa` | `Jurnal` va ruxsat berilgan hisobotlar (Journal + permitted reports) | Xalqlar do'stligi |
| Direktor (Abdulla) | Barcha sahifalar (all pages) | Barcha sahifalar (all pages) | Barchasi (All) |

This is a direct, literal, structural confirmation (not an inference) of two of the explicitly-requested critical rules: **each cashier can enter data only for their assigned branch**, and **the director has access to all branches** — reinforced structurally by the fact that `Sayxun_kassa` and `Xalqlar_kassa` are physically separate sheets, each titled with the responsible cashier's name.

## 10. Expense Management Requirements

`CONFIRMED FROM ORIGINAL EXCEL`: An expense transaction is entered by a cashier into their branch's cash sheet, and carries: date, year, month (derived from date), category, type (fixed/variable), free-text description ("what for"), amount (so'm, no cents), payment method, department, a "responsible" tag, branch (auto-filled from which sheet it was entered on), and a free-text comment field which in actual practice is used to record *who* handled it (see §15). Entries automatically roll up into the shared `Jurnal` (journal) — cashiers are explicitly instructed not to enter data directly into `Jurnal`.

## 11. Expense Categories

`CONFIRMED FROM ORIGINAL EXCEL` — master reference list from `Sozlamalar` (the sheet whose stated purpose is exactly this: "SOZLAMALAR — kategoriya va yordamchi ro'yxatlar" / Settings — category and helper lists):

**Fixed (Doimiy) — 10:** Ijara (bino arendasi) [rent], Xodimlar oyligi (asosiy stavka) [staff base salary], Soliq va ijtimoiy to'lovlar [tax & social payments], Internet va aloqa [internet & communications], Kommunal abonent to'lovi [utilities], Dasturiy ta'minot / litsenziya (CRM, hosting, domen) [software/licenses], Buxgalteriya xizmati [accounting service], Qo'riqlash va xavfsizlik [security], Terminal, server, sms, Tozalash xizmati [cleaning].

**Variable (O'zgaruvchan) — 15:** Mentorlar oyligi (o'quvchi soniga bog'liq) [mentor pay, tied to student count], KPI va bonuslar, Marketing va reklama (SMM/Target), Poligrafiya (banner, buklet, sertifikat), Kanselyariya va o'quv materiallari [stationery/study materials], Elektr energiya [electricity], Texnika sotib olish va yangilash [equipment purchase/upgrade], Texnika ta'miri va xizmat ko'rsatish [equipment repair/service], Tadbirlar (Demo Day, tanlov, ochiq dars) [events], Mehmondorchilik (choy, suv, shirinlik) [hospitality], Transport va yo'l xarajati, Xodimlarni o'qitish va malaka oshirish [staff training], Team building HR (tug'ilgan kun), Boshqa xarajatlar [other], Gaminifikatsiya [gamification].

`CONFLICTING (internal to the Excel itself, not an Excel-vs-Figma conflict)`: the `Budjet_tarixi` planning template uses a **slightly different category list** than `Sozlamalar` — it includes "Bank xizmat haqi" (bank service fee, not in Sozlamalar) in place of "Terminal, server, sms," and "Sovg'a va rag'batlantirish" (gifts/incentives, not in Sozlamalar) in place of "Team building HR" and "Gaminifikatsiya." This is a real inconsistency inside the source document — flagged, not silently reconciled. See §37 Open Decisions.

## 12. Fixed vs Variable Expenses

`CONFIRMED FROM ORIGINAL EXCEL` — every category is tagged exactly one of two types, consistently, everywhere: **Doimiy** (Fixed) or **O'zgaruvchan** (Variable). The `Yoriqnoma` sheet states the *reason* this split exists explicitly: **"Bu farq zarur breakeven (nol nuqta) hisoblash uchun"** — this distinction is necessary for the required break-even (zero-point) calculation. `CONFIRMED FROM BOTH`: Figma's Breakeven screen (`1:5368`) uses exactly this Fixed Cost / Variable Cost split as its calculation inputs — the Excel confirms this is real accounting practice, not an invented UI feature.

## 13. Payment Methods

`CONFIRMED FROM ORIGINAL EXCEL` (`Sozlamalar`, "To'lov usuli" column) — 6 methods: **Naqd pul** (Cash), **Bank o'tkazmasi** (Bank transfer), **Plastik karta (Uzcard/Humo)** (Card), **Click / Payme**, **Korporativ karta** (Corporate card), **Boshqa** (Other).

`CONFLICTING`: Figma's Income-list screenshot (`1:2331`) shows **"Uzum Bank"** as a payment method — this string does not appear anywhere in the Excel's payment-method list. See §36 CONFLICT-E2.

## 14. Departments

`CONFIRMED FROM ORIGINAL EXCEL` (`Sozlamalar`, "Bo'lim" reference list) — 7 departments: **Ma'muriyat** (Administration), **O'quv bo'limi** (Education dept.), **Marketing**, **Sotuv (ROP)** (Sales), **Texnik ta'minot** (Technical support), **HR**, **Umumiy** (General). This field is selected per-transaction in `Jurnal`/cashier sheets, not fixed per category. **Department has no equivalent field anywhere in the Figma audit** — see §35.

## 15. Responsible Person Concept

`CONFIRMED FROM ORIGINAL EXCEL`, with a nuance the column name alone doesn't convey: the "Mas'ul" (Responsible) column, in actual recorded data, is populated with the **role** ("Kassir") rather than a specific name in almost every row; the *specific person's name* is instead recorded in the trailing **"Izoh" (Comment)** column (e.g., "Ergashev Abdulla," "Xusraf," "Odina," "Maftuna"). This is how the field is actually used in practice, which may differ from its literal header intent — flagged precisely rather than assumed.

## 16. Budget Planning

`CONFIRMED FROM ORIGINAL EXCEL`: Budgets are planned **per branch, per category, per month, per year** in `Budjet_tarixi`, entered by the "Moliya rahbari" (Madina) per the Rollar sheet. Each month-block carries an "Izoh / sabab" (comment/reason) column for justifying the planned figure — present in the structure but empty in all currently-populated data.

## 17. Budget History

`CONFIRMED FROM ORIGINAL EXCEL`: `Budjet_tarixi` is structured as **24 independent, sequentially-labeled monthly blocks**, spanning **January 2026 through December 2027** — i.e., the budget calendar is pre-provisioned nearly two years ahead of the current active month (August 2026), with all future months present but zeroed. Each block is headed "[OY] [YIL] — TASDIQLANGAN OYLIK BUDJET" (e.g., "AVGUST 2026 — TASDIQLANGAN OYLIK BUDJET" — "APPROVED Monthly Budget"), confirming that a budget is expected to already be in an **approved state** by the time it appears in this sheet.

## 18. Historical Budget Preservation

`CONFIRMED FROM ORIGINAL EXCEL` — this is the most literal, most structurally-embedded rule in the entire workbook. The sheet's own instructions (`Budjet_tarixi` R3): **"kerakli oy blokini toping → ... sariq ustunlarini to'ldiring → eski oylarni o'zgartirmang"** — find the relevant month block, fill in the yellow columns, **do not change old months**. This directly and literally confirms both explicitly-requested rules: **budget history must be preserved**, and **old monthly budgets should not be overwritten** — currently enforced only as a written instruction (an honor system), not a technical constraint. Digitizing this into an actually-enforced immutability rule is the clear implication (§4).

## 19. Budget vs Actual Comparison

`CONFIRMED FROM ORIGINAL EXCEL`: this is a core, load-bearing feature of the workbook, not a peripheral one. `Oylik_hisobot` computes **"Farq (reja−fakt)"** (Variance: plan − fact) per category, per month, with an explicit interpretation note: **"«Farq» ustuni musbat bo'lsa — rejadan tejaldi, manfiy bo'lsa — reja oshib ketdi"** (if positive, under budget; if negative, budget was exceeded). `2_filial_bitta_jadval` performs the identical Reja/Fakt/Farq computation per category, per branch, side-by-side. Directly confirms the explicitly-requested rule: **actual expenses are compared against planned budget.**

## 20. Monthly Reporting

`CONFIRMED FROM ORIGINAL EXCEL`: `Oylik_hisobot` reports fact vs. plan **per category, per month (Jan–Dec columns), filterable by branch or combined**, with a year-to-date total and total variance column. `CONFIRMED FROM BOTH`: this matches the concept of Figma's "Oylik hisobot" screens (Phase 8), though Figma's mocked visual layout is a card-based summary rather than the Excel's full category × month grid — see §36.

## 21. Annual Reporting

`CONFIRMED FROM ORIGINAL EXCEL`: annual figures are produced by aggregation, not as a separate report type — `Oylik_hisobot`'s "JAMI (yil)" / "JAMI reja (yil)" columns, `Filiallar_taqqoslash`'s annual JAMI rows, and `Xulosa`'s "Yillik umumiy xarajat" (annual total expense) section all derive from the same monthly data rolled up. Figma's Reports Center lists a separate "Yillik hisobot" (Annual report) card with **no dedicated screen behind it** (per Phase 15 §P) — `NOT FOUND IN FIGMA` as a distinct screen, `CONFIRMED FROM ORIGINAL EXCEL` as an aggregation capability.

## 22. Branch Comparison

`CONFIRMED FROM ORIGINAL EXCEL`: `Filiallar_taqqoslash` exists specifically for this — monthly and annual fact/plan/execution-% side-by-side for both branches, plus a per-branch summary table (Yillik fakt / Yillik reja / Reja bajarilishi). Directly confirms the explicitly-requested rule: **branch comparison is required.**

## 23. Management Summary Dashboard

`CONFIRMED FROM ORIGINAL EXCEL`: `Xulosa` ("2 filial bo'yicha rahbariyat dashboardi" — 2-branch leadership dashboard) provides year+branch-filterable annual totals, average monthly spend, and a full monthly dynamics table (Fixed/Variable/Total-fact/Plan/Variance/Execution-%). The extracted `.xlsx` package additionally contains **5 embedded charts** (`chart1.xml`–`chart5.xml`) and 12 drawing objects, confirming this dashboard is genuinely chart-backed in the live spreadsheet, not text-only. `CONFIRMED FROM BOTH`: this concept closely matches Figma's Executive Dashboard (`1:855`).

## 24. Confirmed Financial Calculations

`CONFIRMED FROM ORIGINAL EXCEL`, verified against actual populated numbers (not just column headers):
- **Farq (Variance) = Reja − Fakt** (Plan − Fact), per category/branch/month.
- **Bajarilish % (Execution %) = Fakt / Reja** (Fact ÷ Plan) — verified: Xulosa's Avgust row shows Fakt 10,000,000 / Reja 103,248,000 = 0.09685417635, exactly matching the displayed value; `Filiallar_taqqoslash`'s Xalqlar do'stligi row shows 22,815,400 / 94,478,000 = 0.2414890239, exactly matching.
- **Doimiy xarajat ulushi % (Fixed-expense share) = Doimiy JAMI / UMUMIY JAMI.**
- **Break-even formula is NOT present anywhere in the Excel.** The workbook supplies the *cost-side inputs* (Fixed + Variable split) that a break-even calculation needs, and states this is *why* the split exists, but contains **no revenue figures anywhere** and performs no break-even computation itself. Figma's literal formula (`Margin of Safety = (Revenue − Breakeven Sum) / Revenue`, `1:5368`) is therefore `CONFIRMED FROM FIGMA` only — the *need* for it is `CONFIRMED FROM ORIGINAL EXCEL`, the *formula itself* is `NOT VERIFIED` against this source.

## 25. Data Entry Rules

`CONFIRMED FROM ORIGINAL EXCEL`: only yellow-highlighted cells accept manual input; green text is auto-pulled (do not edit); black text is formula-derived (do not edit). All amounts are in so'm, whole numbers, no fractional currency ("tiyinsiz kiritiladi," e.g. "8 000 000"). New categories must be added to `Sozlamalar` **first**, then referenced in the appropriate month's `Budjet_tarixi` block — a defined, sequenced workflow for category management.

## 26. Automatic Calculations

`CONFIRMED FROM ORIGINAL EXCEL`: `Jurnal` is 100% auto-aggregated from `Sayxun_kassa` + `Xalqlar_kassa` — its own header explicitly instructs "Bu sahifaga ma'lumot kiritmang" (do not enter data on this page). All report sheets (`Oylik_hisobot`, `Xulosa`, `Filiallar_taqqoslash`, `2_filial_bitta_jadval`) are formula-derived from `Jurnal` and `Budjet_tarixi` — none accept direct manual entry. This is a clean "raw entry → computed aggregate/report" architecture worth preserving in database/API design.

## 27. Manual Input Rules

`CONFIRMED FROM ORIGINAL EXCEL`: per-transaction manually entered fields are: date, category, type, description, amount, payment method, department, responsible tag, comment. Branch is implicit (which sheet you're entering into), not manually chosen. Year/month appear to be derived from the entered date rather than independently typed.

## 28. Historical Data Rules

`CONFIRMED FROM ORIGINAL EXCEL`: `Jurnal` is capacity-planned for **~500 records (rows 4–503), described as "approximately one year's volume"** across both branches combined — giving a real transaction-volume baseline (~40–45 combined expense entries/month) for capacity/pagination planning. Recommended closing cadence: **"Har oy 1–5 sanada o'tgan oy jurnalini yopib, «Oylik_hisobot»dagi «Farq» ustunini ko'rib chiqing"** — close last month's journal on the 1st–5th of each month and review the variance column. `CONFIRMED FROM BOTH` (concept): this maps to Figma's Monthly Closing phase (10), though Excel's version is an informal manual habit (look at a column) versus Figma's much more elaborate reconciliation-checklist-plus-checksum mechanism — the latter is `NOT VERIFIED` against this source (see §35).

## 29. Confirmed Business Rules (numbered master list)

1. Each cashier may enter expense data only for their own assigned branch. — `CONFIRMED FROM ORIGINAL EXCEL`
2. The Director has full access (entry + view) to all branches. — `CONFIRMED FROM ORIGINAL EXCEL`
3. Actual expenses are compared against planned budget, per category, monthly and annually. — `CONFIRMED FROM ORIGINAL EXCEL`
4. Fixed and variable expenses are strictly separated, explicitly to support break-even calculation. — `CONFIRMED FROM ORIGINAL EXCEL`
5. Branch comparison (Sayxun vs. Xalqlar do'stligi) is a required report. — `CONFIRMED FROM ORIGINAL EXCEL`
6. Reports must support both a single-branch view and a combined ("Barchasi") view. — `CONFIRMED FROM ORIGINAL EXCEL`
7. Budget history must be preserved once a month is planned/approved. — `CONFIRMED FROM ORIGINAL EXCEL`
8. Old monthly budgets must not be overwritten once entered. — `CONFIRMED FROM ORIGINAL EXCEL`
9. A budget is expected to be in an "approved" (tasdiqlangan) state by the time it is recorded in the budget-history record. — `CONFIRMED FROM ORIGINAL EXCEL` (label/state only — mechanism NOT VERIFIED, see §36 CONFLICT-E4)
10. New expense categories must be registered centrally (Sozlamalar) before use in budget planning. — `CONFIRMED FROM ORIGINAL EXCEL`
11. All monetary values are recorded in so'm as whole numbers (no sub-unit currency). — `CONFIRMED FROM ORIGINAL EXCEL`
12. Category type (Fixed/Variable) is a static property of the category, not chosen per transaction. — `CONFIRMED FROM ORIGINAL EXCEL`
13. Monthly closing/review is expected to occur early in the following month (1st–5th). — `CONFIRMED FROM ORIGINAL EXCEL` (informal habit, not a system-enforced gate)
14. Break-even calculation requires fixed/variable cost separation as an input. — `CONFIRMED FROM ORIGINAL EXCEL` (need); formula itself `NOT VERIFIED` from this source, `CONFIRMED FROM FIGMA` (BR-09).
15. There is currently **no per-expense approval workflow** — cashiers enter expenses directly with no pending/approved/rejected gate. — `CONFIRMED FROM ORIGINAL EXCEL` (by absence — no status field exists anywhere in `Jurnal`/cashier sheets). This directly conflicts with Figma's 3-state expense approval model — see §36 CONFLICT-E4.
16. There is currently **no income, tuition, student, or refund tracking anywhere** in the real process. — `CONFIRMED FROM ORIGINAL EXCEL` (by absence, across all 12 sheets). See §35.

## 30. Confirmed Entities

`CONFIRMED FROM ORIGINAL EXCEL` — 10 core entities evidenced by the workbook's actual structure:

1. **Organization** (IT Live Academy — 1 record currently)
2. **Branch** (Sayxun, Xalqlar do'stligi — 2 records currently)
3. **Staff/User** (3 named individuals currently: Madina, Maftuna, Abdulla)
4. **Role** (3: Moliya rahbari+kassir, Kassir, Direktor)
5. **Expense Category** (~25 named, see §11)
6. **Expense Type** (2 fixed values: Doimiy, O'zgaruvchan — a property of Category)
7. **Department** (7 named, see §14)
8. **Payment Method** (6 named, see §13)
9. **Expense Transaction** (the Jurnal/kassa row — the core recorded fact)
10. **Monthly Budget Line** (Branch × Category × Month × Year planned amount, from Budjet_tarixi)

Plus 5 **computed report/aggregation views** (not separately-stored entities, but confirmed as required outputs): Jurnal (aggregated log), Oylik_hisobot (monthly fact-vs-plan), Xulosa (dashboard), Filiallar_taqqoslash (branch comparison), 2_filial_bitta_jadval (combined branch table).

## 31. Confirmed Relationships

`CONFIRMED FROM ORIGINAL EXCEL`:
- Branch 1—N Expense Transaction (every transaction belongs to exactly one branch).
- Branch 1—N Monthly Budget Line (budget lines are branch-scoped).
- Staff N—1 Branch, for cashiers (branch-restricted); Director's scope is "all branches" (not a single FK — needs an "all-branch" access flag or role-based bypass, not literally represented as a join row in the source).
- Staff N—1 Role (though Madina's combined role suggests the platform may need to support either a composite role or multiple role-assignments per user — open question, §37).
- Expense Transaction N—1 Expense Category, N—1 Payment Method, N—1 Department.
- Expense Category 1—1 Expense Type (static, not per-transaction).
- Monthly Budget Line N—1 Expense Category, N—1 Branch, N—1 (Month, Year).

## 32. Confirmed Roles and Permissions

See §7–9 for the full extraction. Summary: **3 confirmed roles**, each with a confirmed branch scope and confirmed entry/view boundary. No permission below the sheet-access level (e.g., field-level or action-level permissions) is evidenced anywhere in the Excel — the workbook's access model is entirely "which sheets can you open/edit," which is a much coarser grain than Figma's screen-and-button-level RBAC implications (Phase 15 §D).

### Role Extraction Table (as requested)

| Role (ORIGINAL, verbatim) | Responsibilities | Data Entry Access | View Access | Branch Scope | Business Rules |
|---|---|---|---|---|---|
| **"Moliya rahbari + kassir"** | Plans org-wide budget; enters Sayxun's expenses | Sayxun_kassa, Budjet_tarixi, Sozlamalar | Jurnal + all reports | Sayxun | Responsible for Budget (both branches) and Sayxun expenses |
| **"Kassir"** | Enters assigned-branch expenses only | Xalqlar_kassa | Jurnal + permitted reports | Xalqlar do'stligi | Enters only Xalqlar do'stligi expenses |
| **"Direktor"** | Final oversight and approval | All pages | All pages | All (Barchasi) | Final control and approval |

**NORMALIZATION RECOMMENDATION — REQUIRES APPROVAL** (not applied; shown separately per instruction):
- `FinanceManager` (or `FinanceHead`) + `Cashier` as two distinct platform roles, with Madina assigned both — rather than inventing a single combined "FinanceManagerCashier" role, since a real second cashier-only user (Maftuna) already exists and a combined role would need special-casing.
- `Cashier` — direct rename of "Kassir," branch-scoped by design.
- `Director` — direct rename of "Direktor," all-branch scope, final approval authority.
- Figma's additional roles — **"Viewer (Ko'ruvchi)"** and the implied **"Administrator"** — have **no counterpart in the Excel's 3-role reality**. They may represent genuinely new roles needed for a broader digital platform (e.g., a read-only stakeholder, or a system administrator distinct from the Director), but this is `NOT VERIFIED` from the original source and should not be assumed necessary without a product decision. See §37.
- Figma's approval-stepper labels "Moliya Menejeri" and "Boshqaruvchi Direktor" (`1:2638`) are a close conceptual match to Excel's "Moliya rahbari" and "Direktor" respectively — `CONFIRMED FROM BOTH`, with wording variance noted, not silently unified.

## 33. Branch-Level Access Requirements

`CONFIRMED FROM ORIGINAL EXCEL`: restated precisely from §9 — cashiers are restricted to their own branch for **both entry and view of raw transactions**, though the "view access" column for cashiers references "ruxsat berilgan hisobotlar" (permitted reports) rather than "all reports," implying **some report-level access may be broader than raw-transaction access** even for cashiers — this nuance (which specific reports a Kassir may view beyond their own branch's raw data) is not itemized anywhere in the source. `NOT VERIFIED` beyond the general statement.

## 34. Requirements Missing From Original Excel

Gaps in what this source can answer — genuinely open, not filled in:
- Any income, revenue, tuition, student, or refund data or process. (§35)
- Any per-expense approval/status workflow (pending/approved/rejected). (§29 item 15, §36 CONFLICT-E4)
- Numeric spend threshold for "needs extra review" escalation (Figma BR-05) — Excel has no such concept at all.
- Audit-log schema, retention, or the checksum/immutability *mechanism* (Excel only shows the *intent* to preserve history, not a technical mechanism).
- Notification requirements (channel, triggers, content) — not addressed at all.
- PWA/offline requirements — not addressed at all (Excel is a desktop spreadsheet with no mobile/offline concept).
- Whether branches beyond the current 2 (e.g., Yunusobod, Chilonzor from Figma) are real, planned, or placeholder data.
- Target software architecture — Excel obviously carries no signal here.

## 35. Requirements Found Only in Figma

Confirmed as real UI/product concepts in the Figma audit, with **no corroboration (positive or negative) from the Excel**:
- Full Income/Student/Refund management (Phase 5) — entirely absent from the Excel's expense-only scope.
- Per-expense 3-state approval workflow (Tasdiqlandi/Kutilmoqda/Rad etildi) with document attachments and a review-threshold flag.
- Multi-step budget approval UI (stepper with named steps), beyond Excel's simple "already approved by the time it's recorded" state.
- SHA-256 checksum + actor/timestamp mechanism for closed periods.
- Reconciliation checklist gating month-end closing.
- "Viewer" and "Administrator" roles.
- Notification bell/badge affordance.
- Mobile app shell, PWA-adjacent responsive screens.
- QA Dashboard/edge-case tracking as an in-product feature.
- Break-even's literal formula and its "Margin of Safety" framing (the need is Excel-confirmed; the formula is not).

## 36. Conflicts Between Excel and Figma

**CONFLICT-E1 — Branch count.** Excel confirms exactly 2 branches (Sayxun, Xalqlar do'stligi) as the entire operating reality. Figma screenshots show at least 4 branch names (adds Yunusobod, Chilonzor). Impact: unclear whether Figma is showing sample/placeholder data or genuinely planned expansion. **Decision required**, not resolved here.

**CONFLICT-E2 — Payment methods.** Excel's canonical list (6 methods, §13) does not include "Uzum Bank," which appears in a Figma screenshot (`1:2331`). Excel does have a generic "Bank o'tkazmasi" and "Korporativ karta" that might subsume it. **Decision required.**

**CONFLICT-E3 — Role set.** Excel confirms exactly 3 roles; Figma implies up to 5 (adds Viewer, Administrator as either genuinely distinct or unconfirmed). Not a direct contradiction (Figma could simply be adding roles for a bigger platform) but a real gap between the confirmed-real role set and the platform's apparent design. **Decision required** (this is DECISION-02 in the Decision Register, now partially informed — see the register update).

**CONFLICT-E4 — Approval workflow granularity.** Excel shows **no per-expense approval gate at all** — expenses are entered directly by cashiers with no status field. Figma shows a full 3-state per-expense approval workflow with a review queue, document attachments, and a threshold-triggered escalation. This is the sharpest conflict found: Figma is proposing a materially stricter, more corporate control process than what IT Live Academy currently practices day-to-day. Only budget-level approval (as a pre-existing "already approved" label) is confirmed from Excel. **Decision required**: is per-expense approval a genuine business need being added, or over-engineering relative to the real process?

## 37. Open Decisions

Carried into the Decision Register (see update below) rather than resolved here:
- Which category list is authoritative — `Sozlamalar` or `Budjet_tarixi`'s slightly different template (§11)?
- Should Madina's combined role be modeled as one role or two role-assignments (§32)?
- Are Yunusobod/Chilonzor real planned branches or Figma placeholder data (CONFLICT-E1)?
- Is "Uzum Bank" a real payment integration or a Figma naming slip (CONFLICT-E2)?
- Should the Excel's 3-role reality be extended to Figma's implied 5-role model, and if so, on what basis (CONFLICT-E3)?
- Should per-expense approval (Figma) be built as specified, scaled back to match Excel's current no-gate reality, or made configurable (CONFLICT-E4)?
- Is there a separate income/revenue tracking source not yet found (needed to make the break-even formula computable)?

## 38. Assumption Register

Kept minimal, per the standing rule of preferring `NOT VERIFIED` over assumption:
- **ASSUMPTION-E1:** The current "Avgust 2026" active month in the workbook reflects the actual present at the time of extraction and is used throughout this document as the reference point for "currently populated" vs. "future/zeroed" data. Basis: it is the only month block with non-zero figures across all 24 in `Budjet_tarixi`, and matches `Jurnal`'s dated entries (01.08.2026–18.08.2026).
- **ASSUMPTION-E2:** "So'm" throughout this document refers to the Uzbekistani so'm (UZS), consistent with the Figma audit's currency observations. Not independently re-verified here beyond the currency symbol/context already established.

---

# EXCEL TO FIGMA TRACEABILITY MATRIX

| Excel Source | Requirement | Matching Figma Screen/Feature | Status |
|---|---|---|---|
| Rollar | 3 confirmed roles (Moliya rahbari+kassir, Kassir, Direktor) with branch scoping | Phase 15 §11.5 Role Matrix (Viewer confirmed, Moliya Menejeri/Boshqaruvchi Direktor inferred) | **PARTIALLY MATCHED** — Kassir and Direktor≈Boshqaruvchi Direktor align; Viewer/Administrator have no Excel counterpart |
| Sayxun_kassa / Xalqlar_kassa | Cashier can enter data only for their own branch | Kirish rad etildi (`3:410`) shows role-gated restriction (Viewer↛Admin) — a *different* restriction than branch-scoping | **NOT FOUND IN FIGMA** — no screen in the 15 screenshot-verified screens demonstrates branch-scoped data-entry restriction specifically |
| Budjet_tarixi | Budget history preserved; old months not overwritten | No screen shows a "budget history/archive" view with per-month locked records; "Yopilgan davrlar" (Closed periods, `1:7140`/`1:7374`) is conceptually adjacent but scoped to month-*closing*, not budget-*planning* history | **PARTIALLY MATCHED** |
| Oylik_hisobot | Budget vs. actual variance, per category/month/branch | Executive Dashboard's "Budjet Nazorati" table (`1:855`) shows Reja/Fakt/Bajarilish/Status per category — same concept, card/table form rather than Excel's full grid | **MATCHED** |
| Filiallar_taqqoslash | Branch comparison report | Executive Dashboard's "Filiallar Kesimida" panel (`1:855`); Reports Center lists "Filiallar taqqoslash" card (`1:5540`) with **no dedicated screen found** | **PARTIALLY MATCHED** |
| 2_filial_bitta_jadval | Combined branch view in one table | Oylik_hisobot / Xulosa "Barchasi" (All) selector concept implied by "Filiali: Barcha filiallar" filter on several Figma screens | **PARTIALLY MATCHED** |
| Xulosa | Management summary dashboard, chart-backed | Executive Dashboard (`1:855`) — KPI tiles + line chart + branch bars | **MATCHED** |
| Sozlamalar | Expense category master list, Fixed/Variable typed | Budget editor (`1:2638`) shows per-category rows; Breakeven screen (`1:5368`) uses Fixed/Variable split | **MATCHED** |
| Sozlamalar | Payment method list (6, no "Uzum Bank") | Income list (`1:2331`) shows "Click/Payme, Naqd pul, Uzum Bank" | **CONFLICT** — CONFLICT-E2 |
| Sozlamalar | Department list (7) | No screen in the 15 verified screens shows a Department field anywhere | **NOT FOUND IN FIGMA** |
| Jurnal / kassa sheets | No per-expense approval status exists today | Xarajatlar ro'yxati (`1:1704`) shows a 3-state status model (Tasdiqlandi/Kutilmoqda/Rad etildi); Tasdiq navbati (`1:4100`) shows a full approval-queue UI | **CONFLICT** — CONFLICT-E4 |
| Budjet_tarixi | Budget carries an "approved" (tasdiqlangan) label before being recorded | Budget editor's (`1:2638`) 2-step approval stepper (Moliya Menejeri → Boshqaruvchi Direktor) | **PARTIALLY MATCHED** — state concept matches; multi-step UI mechanism is Figma-only |
| Yoriqnoma | Fixed/Variable split exists "for required breakeven calculation" | Breakeven tahlili (`1:5368`) computes Margin of Safety from Fixed+Variable+Revenue | **MATCHED** (need) / **NOT FOUND IN EXCEL** (revenue data, formula) |
| Yoriqnoma | Recommended monthly closing cadence (1st–5th, review variance) | Oyni yopish (Month closing, `1:6791`) — reconciliation checklist + irreversibility + checksum | **PARTIALLY MATCHED** — concept matches, Figma's mechanism is substantially more elaborate than Excel's manual habit |
| Sozlamalar/Jurnal/etc. | Exactly 2 branches (Sayxun, Xalqlar do'stligi) | Screens reference Sayxun, Xalqlar do'stligi, Yunusobod, Chilonzor | **CONFLICT** — CONFLICT-E1 |
| — (absent) | Income/tuition/student/refund tracking | Daromadlar ro'yxati, O'quvchi profili, Yangi to'lov, Yangi qaytim (Phase 5, multiple screens) | **NOT FOUND IN EXCEL** — Figma-only, no Excel corroboration either way |

---

# DECISION-00 STATUS

## DECISION-00: **PARTIALLY RESOLVED**

### 1. What the Excel now confirms
A real business source now exists and has been fully read. It confirms: the real organization (IT Live Academy), the real branch count (2), 3 real roles with real branch-scoping and real responsibilities, a real expense-category taxonomy (25 categories, Fixed/Variable typed), a real payment-method list (6), a real department list (7), the full budget-history/immutability requirement (structurally, not just as a claim), the budget-vs-actual comparison requirement, the branch-comparison requirement, and the management-dashboard requirement. All 8 of the critical business rules explicitly called out for verification are now `CONFIRMED FROM ORIGINAL EXCEL`.

### 2. What still cannot be determined
The Excel is **expense-and-budget-only** — it contains zero income, student, refund, or revenue data, so it cannot confirm or deny anything about Phase 5, cannot supply the revenue-side input the break-even formula needs, and cannot corroborate Figma's per-expense approval workflow (which the Excel's actual process doesn't have at all). Architecture, API, database *schema* (as opposed to entity *concepts*, which are now confirmed), PWA scope, and prototype flows remain completely untouched by this source — those decisions are still exactly as open as before.

### 3. Which requirements can now safely be used for database design
The 10 confirmed entities (§30), their confirmed relationships (§31), the confirmed category/type/payment-method/department taxonomies (§11, §12, §13, §14), the confirmed 3-role branch-scoping model (§7–9), and the confirmed budget-history/immutability structure (§17–18) are now real, source-backed inputs — a meaningfully stronger foundation than Phase 15's "inferred from UI groupings only" entity list. They should replace the inferred entity list in Phase 15 §11.11 as the primary reference, with the explicit caveat that they cover expense/budget only, not the full platform Figma envisions.

### 4. Which decisions remain blockers
DECISION-01 (shell/brand) is **not resolved** — Excel never names the software, only the organization; it does, however, newly strengthen Shell B's tenant name ("IT Live Academy") as genuinely real, which the human deciding DECISION-01 should weigh. DECISION-02 (roles/permissions) is **partially informed, not resolved** — 3 real roles now exist as a floor, but whether Figma's Viewer/Administrator additions are legitimate remains open, and role-to-permission mapping (screen/action level) is still unconfirmed. DECISION-03 (architecture) is **untouched**. DECISION-04 (PWA), DECISION-05 (prototype), DECISION-06 (report screen scope), DECISION-07 (threshold value), DECISION-10 (state-machine gaps), DECISION-11 (audit schema) are **all still open** — none of these are addressed by an expense/budget spreadsheet, and CONFLICT-E4 in particular (no per-expense approval exists in reality) makes DECISION-01/02/06/10 collectively more consequential, not less, since it surfaces a real design question (is Figma over-scoping relative to the actual business?) that didn't exist before this source was found.

---

*End of PROJECT_REQUIREMENTS.md v1. Every item above is traceable to a specific worksheet/cell/row or explicitly marked NOT VERIFIED / CONFLICTING / INFERRED — nothing was invented.*
