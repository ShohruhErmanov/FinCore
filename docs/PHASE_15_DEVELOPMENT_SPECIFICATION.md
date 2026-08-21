# FINCORE — PHASE 15: FULL FIGMA AUDIT & DEVELOPMENT SPECIFICATION

**Generated:** 2026-08-19
**Source Figma file:** `FINCORE` — fileKey `OWVbR4UnwiYHCsz1QUInR6` — 1 page ("Page 1"), 53 top-level frames
**Prepared by:** Claude Code, via Figma MCP (read-only)

---

## 0. SOURCE-OF-TRUTH STATEMENT (READ FIRST)

The task instructions specify four source priorities: (1) FINCORE TZ/requirements, (2) Figma design, (3) prototype information, (4) QA/edge-case requirements. Before writing anything, the project directory (`d:\React js\FinCore`) was checked directly.

| Source | Status |
|---|---|
| 1. FINCORE TZ / requirements document | **NOT ACCESSIBLE** — project directory is empty. No TZ, PRD, spec, or requirements file of any kind exists locally, and none was supplied in conversation. |
| 2. Figma design | **ACCESSIBLE** — 53 screens, read-only, partially rate-limited (see §1.3). |
| 3. Prototype information | **NOT ACCESSIBLE** — no tool in the connected Figma MCP surface exposes prototype reactions/connections. |
| 4. QA / edge-case requirements document | **NOT ACCESSIBLE** — no document exists. A "QA Dashboard" and "Test tafsilotlari" *screen* exist inside Figma (Phase 14) and were partially inspected; this is design-mockup content, not a real test-management source. |

**Consequence:** This document's only verifiable source is the Figma file itself, plus what a small number of design-copy strings *inside* the mockups state about the intended system (e.g. "RBAC faol", "Audit log faol"). Anything Figma cannot express — API contracts, database schemas, real business rules, real role/permission logic, real QA results — is marked `NOT VERIFIED` throughout. This is not a gap in effort; it is a gap in available source material. Per the governing instruction, it is being surfaced, not hidden or invented.

---

## 1. METHODOLOGY & VERIFICATION DEPTH

### 1.1 What was actually done
- `get_metadata` pulled the full node tree for the page (1,124,116 characters / 6,285 frames / 2,341 text nodes / 930 vectors) and was parsed offline to enumerate all 53 top-level screens, their canvas coordinates, and their depth-2 layout sections.
- `get_libraries` and `search_design_system` were run to check for design-system components/styles/variables in use.
- `get_variable_defs` was run against the shell frame — returned empty.
- `get_screenshot` was run on **15 of 53 screens** (28%) before the Figma MCP **Starter-plan rate limit was hit** mid-audit (documented error: *"You've reached the Figma MCP tool call limit on the Starter plan"*). The remaining 7 planned screenshots (Foydalanuvchilar, Tizim sozlamalari, Audit log, Foydalanuvchi profili, Hisob bloklandi, Xarajat tafsilotlari, Tasdiq tarixi) could not be captured.
- No `use_figma`, `create_new_file`, or any write/mutation tool was called at any point. No screens, components, or prototype flows were invented.

### 1.2 Verification depth legend (used throughout this document)
| Label | Meaning |
|---|---|
| **CONFIRMED** | Directly observed in a Figma screenshot or explicit metadata field. |
| **INFERRED** | A reasonable reading of visible evidence (e.g. a nav label implies a route), but not literally stated anywhere. |
| **NOT VERIFIED** | No accessible source confirms or denies this. Not asserted either way. |
| **NOT ACCESSIBLE** | A source that could answer this exists in principle (e.g. prototype reactions) but the current toolset cannot reach it. |
| **NOT PRESENT IN FIGMA** | Actively checked and confirmed absent from the file (e.g. Phase 12/13 screens). |
| **CONFLICTING** | Two or more accessible sources disagree. |

### 1.3 Screens with visual (screenshot) verification — 15/53
`1:2` FINCORE Desktop Shell · `1:307` FINCORE Mobile Shell · `1:202` Kirish — Desktop (Login) · `3:410` Kirish rad etildi — Desktop (Access denied) · `1:855` Executive Dashboard — Desktop · `1:1704` Xarajatlar ro'yxati — Desktop (Expense list) · `1:2331` Daromadlar ro'yxati — Desktop (Income list) · `1:2638` Budjet tahriri — Desktop (Budget editor) · `1:4100` Tasdiq navbati — Desktop (Approval queue) · `1:5540` Hisobotlar markazi — Desktop (Reports center) · `1:5368` Breakeven tahlili — Desktop · `1:6791` Oyni yopish — Desktop (Month closing) · `1:7885` Administratsiya — Desktop · `1:8592` Muvaffaqiyatli yopildi — Desktop (Closing success) · `2:2` QA Dashboard — Desktop.

The remaining **38 screens** were verified only at the structural level (name, canvas size, node ID, and immediate layout-section names extracted from `get_metadata`). Their visual content, real text, and states are **NOT VERIFIED** and are marked as such in the inventory — nothing about them is fabricated below.

---

## 2. HEADLINE FINDING: NAVIGATION / SHELL IS NOT UNIFIED

This is the single most consequential audit finding and drives several conflicts and backlog items below. Across the 15 screenshot-verified screens, **six visibly different sidebar/shell systems** were observed, where a single design system would be expected. This is `CONFIRMED` — each is a direct screenshot observation, not an inference.

| # | Shell identity (as literally rendered) | Nav items shown | Seen on |
|---|---|---|---|
| A | "FINCORE / Financial Platform" (dark navy) | Dashboard, Xarajatlar, Daromadlar, Budjet, Tasdiqlash, Hisobotlar, Oyni yopish, Administratsiya, Sozlamalar, Chiqish | Desktop Shell (`1:2`), Xarajatlar ro'yxati (`1:1704`), Tasdiq navbati (`1:4100`), Kirish rad etildi (`3:410`) |
| B | "IT Live Academy — FINCORE Executive" | Bosh sahifa, Operatsiyalar, Hisobotlar, Budjet, Tasdiqlashlar, Filiallar, Oyni yopish, Profil, Chiqish | Executive Dashboard (`1:855`), Budjet tahriri (`1:2638`) |
| C | "FINCORE ERP — Financial Management" (English) | Dashboard, Income, Students, Refunds, Reports, Settings/Administratsiya, Support | Daromadlar ro'yxati (`1:2331`), Administratsiya (`1:7885`) |
| D | "FINCORE Systems — Financial Control" (English) | Dashboard, Expenses, Income, Budget, Approvals, Reports, Settings, Logout | Hisobotlar markazi (`1:5540`), Breakeven tahlili (`1:5368`) |
| E | "FINCORE ERP — Moliyaviy nazorat" (minimal) | Boshqaruv paneli, Moliya, Yopilish jarayoni, Audit, Arxiv | Oyni yopish (`1:6791`) |
| F | Mobile bottom bar (4 items only) | Dashboard, Xarajatlar, Daromadlar, Profil | FINCORE Mobile Shell (`1:307`) |

No two of A–E share an identical nav item set, label language (Uzbek vs. English is mixed inconsistently), or branding string. Variant B/C/D use different tenant/product names in the same file ("IT Live Academy", "FINCORE ERP", "FINCORE Systems"). This is filed as **CONFLICT-01** (§21) and is the top item in the development backlog (§V/24).

A secondary, lower-severity finding: several frame *layer names* inside the file contain leaked design-tool annotation text rather than clean component names, e.g. a child of "Reja–Fakt — Desktop" is literally named `JSON Component: SideNavBar`, and a child of "Oylik hisobot — Mobile" is named `Relevance Check: Navigation is active as "Hisobotlar" conceptually fits this destination flow if thi...` (truncated in the source file itself). This is `CONFIRMED` from metadata and indicates the file was produced with AI-assisted/generative design tooling and has not had a full manual design-QA naming pass. It correlates with, and likely explains, the shell inconsistency above. See §O (Figma Inconsistency Report).

---

## 3. PHASE GAP REGISTER

| PHASE | STATUS | FIGMA ACCESS | SCREEN COUNT | COMPONENT ACCESS | PROTOTYPE ACCESS | MOBILE ACCESS | GAPS | SEVERITY | ACTION REQUIRED |
|---|---|---|---|---|---|---|---|---|---|
| 1 — Design System + Shell | PARTIAL | ACCESSIBLE | 2 (Desktop Shell, Mobile Shell) | NOT ACCESSIBLE (0 native components) | NOT ACCESSIBLE | YES | No foundations/tokens page; shell is not unified (6 variants, §2) | **CRITICAL** | Unify shell into one canonical layout before any screen implementation begins |
| 2 — Authentication | COMPLETE (screens) | ACCESSIBLE | 5 (+1 shared with P14) | NOT ACCESSIBLE | NOT ACCESSIBLE | YES | Password-reset (non-first-login) flow not seen; 2FA/OTP resend not seen | MEDIUM | Confirm whether additional auth states exist outside this file |
| 3 — Dashboard | COMPLETE (screens) | ACCESSIBLE | 3 | NOT ACCESSIBLE | NOT ACCESSIBLE | YES | Only one loading state seen; no dashboard error/empty state found | MEDIUM | Verify empty/error dashboard states exist somewhere in file (not found in current pass) |
| 4 — Expenses | COMPLETE (screens) | ACCESSIBLE | 4 | NOT ACCESSIBLE | NOT ACCESSIBLE | YES | Expense edit/delete confirmation screens not found | MEDIUM | Confirm edit/delete flows are covered by a modal not captured in top-level frame list |
| 5 — Income & Students | COMPLETE (screens) | ACCESSIBLE | 4 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (1 mobile screen only) | Student list/detail (separate from profile) not found; only 1 mobile screen for whole phase | MEDIUM | Verify student list screen exists; expand mobile coverage |
| 6 — Budget | COMPLETE (screens) | ACCESSIBLE | 4 | NOT ACCESSIBLE | NOT ACCESSIBLE | YES | No budget-creation-from-scratch screen distinct from "edit" found | LOW | Confirm create vs. edit are the same screen by design |
| 7 — Approval | COMPLETE (screens) | ACCESSIBLE | 4 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (1 mobile screen only) | No rejection-reason-entry screen/modal found | MEDIUM | Verify reject flow UI exists |
| 8 — Reports | COMPLETE (screens) | ACCESSIBLE | 5 | NOT ACCESSIBLE | NOT ACCESSIBLE | YES | Filiallar taqqoslash, Yillik hisobot, Naqd oqim, Xarajatlar tahlili, Daromad tahlili are referenced as cards on Reports Center but have **no dedicated top-level screen found** | **HIGH** | Confirm whether these 5 report types are meant to open the same generic report screen or need dedicated screens |
| 9 — Break-even | COMPLETE (screens) | ACCESSIBLE | 3 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (Full variant only) | Base breakeven screen has no dedicated mobile variant (only the "Full" variant does) | LOW | Confirm base breakeven is desktop-only by design |
| 10 — Monthly Closing | COMPLETE (screens) | ACCESSIBLE | 8 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (2 of 4 sub-flows have mobile) | Archive and confirmation-modal screens are desktop-only | LOW | Confirm archive/confirm are intentionally desktop-only |
| 11 — Administration | COMPLETE (screens) | ACCESSIBLE | 6 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (1 mobile screen only) | Users, Settings, Audit log have no mobile variant | MEDIUM | Confirm admin is intentionally desktop-first |
| 12 — Mobile PWA | **MISSING** | NOT PRESENT IN FIGMA FILE | 0 dedicated | N/A | N/A | N/A | No install prompt, offline state, manifest/icon spec, or push-notification screen exists anywhere in the file | **CRITICAL** | See §4 PWA Gap Register |
| 13 — Prototype | **NOT ACCESSIBLE / NOT VERIFIED** | NOT ACCESSIBLE (no reactions-listing tool) | N/A | N/A | NOT ACCESSIBLE | N/A | Cannot confirm whether click-through prototype links exist in the Figma *file itself* (as opposed to the MCP's ability to read them) | **HIGH** | See §5 Prototype Gap Register — requires a human to check the Figma prototype tab directly |
| 14 — Edge Cases / QA | COMPLETE (screens) | ACCESSIBLE | 5 | NOT ACCESSIBLE | NOT ACCESSIBLE | PARTIAL (1 mobile screen only) | Only 1 of 8 QA-Dashboard tabs (Authentication) was visually inspected before rate-limit; other 7 tabs (Authorization, Branch Security, Expense, Income, Budget, Approval, Reports) NOT VERIFIED | MEDIUM | Re-inspect remaining QA tabs once Figma MCP quota resets |

Note on "COMPLETE (screens)": this means screens exist for the phase's core flow as named in the brief — it does **not** mean the phase is complete in the product sense (states, roles, and backend behavior are separately NOT VERIFIED per-screen in §6).

---

## 4. PWA GAP REGISTER (Phase 12)

Explicitly not designed here, per instruction. Documented only.

| Item | Status | Evidence |
|---|---|---|
| Dedicated PWA screens (install prompt, offline banner, update-available toast) | **NOT PRESENT IN FIGMA FILE** | Full 53-screen inventory scanned by name; none match |
| App manifest / icon set spec | **NOT PRESENT IN FIGMA FILE** | No frame named for icons/manifest found |
| Offline state per data-heavy screen (Dashboard, Reports, Expenses) | **NOT PRESENT IN FIGMA FILE** | Only one generic "Dashboard — Yuklanmoqda..." (loading) screen exists; no "offline" or "no connection" screen found |
| Push notification permission / settings screen | **NOT PRESENT IN FIGMA FILE** | Not found |
| Existing mobile screens that *could* inform PWA behavior | **CONFIRMED (partial)** | FINCORE Mobile Shell (`1:307`), and 13 other "— Mobile" screens exist and were catalogued (§6). These are responsive mobile web layouts, not PWA-specific states (install/offline/update) |
| Responsive breakpoints used | **INFERRED** | All mobile frames use a 390px canvas (iPhone-width); no tablet-width (e.g. 768px) frame was found anywhere in the 53 screens |
| Service worker / caching requirements | **NOT VERIFIED** | No source (Figma or TZ) can answer this |

**Conclusion:** Phase 12 cannot be scoped from Figma alone. It requires either (a) a TZ document that does not currently exist in this project, or (b) a product decision session. This is flagged as **IMPLEMENTATION DECISION-01** (§T).

---

## 5. PROTOTYPE GAP REGISTER (Phase 13)

| Item | Status |
|---|---|
| Tool capability to list prototype reactions/connections | **NOT ACCESSIBLE** — no such tool is exposed by the connected Figma MCP server (`get_metadata`, `get_design_context`, `get_screenshot`, `get_variable_defs`, `search_design_system`, `get_libraries` were all available; none return interaction/reaction data) |
| Whether the Figma file itself contains prototype links | **NOT VERIFIED** — could not be checked with available tools; must be checked by a human opening the file's Prototype tab in Figma directly |
| Screens that would **logically** need a transition (login → dashboard, expense form → expense list, approval action → queue update, month-close wizard steps) | **INFERRED, not CONFIRMED.** Listed below as candidates only |
| Success/error transition targets | **NOT VERIFIED** for all screens |

**Inferred (not confirmed) candidate flows**, based purely on screen names/adjacent canvas position — these must not be treated as requirements until a human confirms actual prototype wiring or a TZ specifies them:

- Kirish (Login) → Dashboard *[INFERRED]*
- Kirish → SMS Tasdiqlash → Dashboard *[INFERRED, 2FA path]*
- Kirish → Hisob bloklandi (if failed attempts exceeded) *[INFERRED]*
- Yangi xarajat (New expense form) → Xarajatlar ro'yxati (list) *[INFERRED]*
- Tasdiq navbati (Approval queue item) → Tasdiq tarixi (History) *[INFERRED]*
- Oyni yopish (Wizard) → Yopishni tasdiqlash (Confirm) → Muvaffaqiyatli yopildi (Success) *[INFERRED — this is the strongest candidate, as the three screens form a clear name-based sequence]*

No transition above is `CONFIRMED`. None should enter a sprint as a "prototype-verified" flow.

---

## 6. FIGMA SCREEN AUDIT / SCREEN INVENTORY (all 53 screens)

Columns match the requested audit fields where Figma can answer them. Fields Figma structurally cannot answer (Route, Role, Permission, API dependency, Database dependency, Business rules, Audit requirements, QA coverage) are addressed once, system-wide, in §7 rather than repeated as "NOT VERIFIED" 53 times per screen — the finding is identical for every screen: **none of those fields are accessible from Figma; a TZ document would be required and none exists.**

Legend: **SS** = screenshot-verified (visual content confirmed) · **MD** = metadata-only (name/layout-section structure confirmed, visual content NOT VERIFIED).

| # | Phase | Screen name | Node ID | Canvas | Verify | Layout sections (depth-2, CONFIRMED) |
|---|---|---|---|---|---|---|
| 1 | 1 | FINCORE Desktop Shell | 1:2 | 1280×1024 | **SS** | Nav - Left Sidebar / Main Content Wrapper |
| 2 | 2 | Hisob bloklandi — Desktop (Account blocked) | 1:166 | 1280×552 | MD | Main Container |
| 3 | 2 | Kirish — Desktop (Login) | 1:202 | 1280×600 | **SS** | Main |
| 4 | 2 | SMS Tasdiqlash — Desktop (SMS verify) | 1:262 | 1280×573 | MD | Container |
| 5 | 1 | FINCORE Mobile Shell | 1:307 | 390×696 | **SS** | BottomNavBar / FAB for Quick Expense / Header-TopNavBar / Main Content Canvas |
| 6 | 2 | Kirish — Mobile | 1:417 | 390×1061 | MD | Abstract Background Elements / Main Container |
| 7 | 2/11 | Foydalanuvchi profili — Desktop (User profile) | 1:462 | 1280×1024 | MD | Main Content Area / Nav-Desktop Sidebar |
| 8 | 2 | Parolni almashtirish (Birinchi kirish) (First-login password change) | 1:629 | 1280×684.5 | MD | Background+Border+Shadow |
| 9 | 3 | Kassir paneli — Mobile (Cashier panel) | 1:692 | 390×1015 | MD | BottomNavBar / Header-TopAppBar / Main |
| 10 | 3 | Executive Dashboard — Desktop | 1:855 | 1280×1244 | **SS** | Header-TopAppBar / Aside-SideNavBar / Container |
| 11 | 3 | Dashboard — Yuklanmoqda... (loading state) | 1:1209 | 1280×1058 | MD | SideNavBar / Main Content Wrapper |
| 12 | 4 | Yangi xarajat — Desktop (New expense) | 1:1411 | 1280×1144 | MD | Main Content Area / Aside-Desktop Sidebar |
| 13 | 4 | Xarajatlar ro'yxati — Desktop (Expense list) | 1:1704 | 1280×1024 | **SS** | Nav-Sidebar / Main Content Area |
| 14 | 4 | Yangi xarajat — Mobile | 1:2020 | 390×884 | MD | Sticky Bottom Action / Header-Top Navigation / Main Content Area |
| 15 | 4 | Xarajat tafsilotlari — Desktop (Expense detail) | 1:2129 | 1280×1024 | MD | Main Content Canvas / SideNavBar |
| 16 | 5 | Daromadlar ro'yxati — Desktop (Income list) | 1:2331 | 1280×1024 | **SS** | Main Content Area / Aside-SideNavBar |
| 17 | 6 | Budjet tahriri — Desktop (Budget editor) | 1:2638 | 1280×1024 | **SS** | Main Content Area / Sidebar (SideNavBar) |
| 18 | 6 | Budjet davrlari — Desktop (Budget periods) | 1:2897 | 1280×1024 | MD | Main Content Area / Desktop SideNavBar |
| 19 | 5 | Yangi to'lov — Mobile (New payment) | 1:3159 | 390×884 | MD | Main Form Content Area / Footer-Sticky Action / Header-TopAppBar |
| 20 | 5 | O'quvchi profili — Desktop (Student profile) | 1:3245 | 1280×1024 | MD | SideNavBar / Main Content Area |
| 21 | 6 | Reja–Fakt — Desktop (Plan vs. Fact) | 1:3497 | 1280×1024 | MD | Main Content Wrapper / "JSON Component: SideNavBar" *(see §2 naming finding)* |
| 22 | 6 | Budjet — Mobile | 1:3783 | 390×1287 | MD | Main / Mobile Header Replacement / Save Action FAB / BottomNavBar |
| 23 | 5 | Yangi qaytim — Desktop (New refund) | 1:3927 | 1280×1024 | MD | Main Content Area / Aside-SideNavBar |
| 24 | 7 | Tasdiq navbati — Desktop (Approval queue) | 1:4100 | 1280×1024 | **SS** | Container |
| 25 | 7 | Tasdiq navbati — Mobile | 1:4324 | 390×871 | MD | Bottom Navigation / Top Navigation-Header / Main Content Canvas |
| 26 | 7 | Budjet tasdig'i — Desktop (Budget approval) | 1:4449 | 1280×1311 | MD | Main Content Wrapper / Desktop Side Nav |
| 27 | 7 | Tasdiq tarixi — Desktop (Approval history) | 1:4794 | 1280×1024 | MD | Main Content Area / SideNavBar |
| 28 | 8 | Oylik hisobot — Mobile (Monthly report) | 1:5098 | 390×980 | MD | Contains truncated AI-annotation layer name (see §2) / TopAppBar / FAB(Export) / Main |
| 29 | 8 | Oylik hisobot — Desktop | 1:5258 | 1280×1024 | MD | Main Content Wrapper / Sidebar Navigation |
| 30 | 9 | Breakeven tahlili — Desktop | 1:5368 | 1280×1024 | **SS** | Main Content Area / SideNavBar |
| 31 | 8 | Hisobotlar markazi — Desktop (Reports center) | 1:5540 | 1280×1024 | **SS** | Main Content Area / SideNavBar |
| 32 | 8 | Oylik hisobot — Desktop (Full) | 1:5774 | 1280×1367 | MD | Main Content Wrapper / Sidebar Navigation |
| 33 | 8 | Oylik hisobot — Mobile (Full) | 1:6158 | 390×1779 | MD | BottomNavBar / TopAppBar / FAB(Export) / Main |
| 34 | 9 | Breakeven tahlili — Desktop (Full) | 1:6371 | 1280×1163 | MD | Main Content / Header-TopAppBar / SideNavBar |
| 35 | 9 | Breakeven tahlili — Mobile (Full) | 1:6621 | 390×1241 | MD | Bottom Nav Bar / Sticky Action Bar / Header-TopAppBar / Main |
| 36 | 10 | Oyni yopish — Desktop (Month closing) | 1:6791 | 1280×1024 | **SS** | Main Content Area / SideNavBar |
| 37 | 10 | Oyni yopish — Mobile | 1:6982 | 390×884 | MD | Top Nav Bar / Main Content Area / Sticky Footer Action / Bottom Nav Bar |
| 38 | 10 | Yopishni tasdiqlash — Desktop (Confirm closing, modal) | 1:7101 | 1280×488 | MD | Mock underlying page (dimmed) / Overlay & Modal Container — **this is a modal, not a route** |
| 39 | 10 | Yopilgan davrlar — Desktop (Closed periods) | 1:7140 | 1280×1024 | MD | Main Content Area / SideNavBar (Fixed) |
| 40 | 10 | Yopilgan davrlar — Desktop (Archive) | 1:7374 | 1280×1024 | MD | Main Content Area / Nav-Desktop Sidebar |
| 41 | 10 | Oyni yopish — Desktop (Wizard) | 1:7601 | 1280×1024 | MD | Main Content / Aside-SideNavBar |
| 42 | 11 | Administratsiya — Desktop | 1:7885 | 1280×1024 | **SS** | Main Content Area / SideNavBar |
| 43 | 11 | Foydalanuvchilar — Desktop (Users) | 1:8064 | 1280×1024 | MD | Main Content Area / Desktop Side Navigation |
| 44 | 10 | Oyni yopish — Mobile (Wizard) | 1:8297 | 390×1144 | MD | Sticky Bottom Action Bar / Header-Top Navigation / Main Content Canvas |
| 45 | 11 | Tizim sozlamalari — Desktop (System settings) | 1:8407 | 1280×911 | MD | Main Content Area / SideNavBar (Fixed) |
| 46 | 10 | Muvaffaqiyatli yopildi — Desktop (Closing success, modal) | 1:8592 | 1280×602 | **SS** | Main Content Area → Canvas Content — this is a **confirmation modal**, not a route |
| 47 | 11 | Audit log — Desktop | 1:8635 | 1280×1024 | MD | Aside-SideNavBar / Main Content Area |
| 48 | 11 | Administratsiya — Mobile | 1:8882 | 390×816 | MD | Bottom Navigation Bar / Header-TopAppBar / Main Content |
| 49 | 14 | QA Dashboard — Desktop | 2:2 | 1280×1024 | **SS** | Main Content Area / Aside-SideNavBar |
| 50 | 14 | Test tafsilotlari — Desktop (Test detail) | 2:243 | 1280×1024 | MD | Main Content Area / Aside-Desktop Sidebar |
| 51 | 2/14 | Kirish rad etildi — Desktop (Access denied) | 3:410 | 1280×1024 | **SS** | Main Content Area / Nav-Desktop Sidebar |
| 52 | 14 | Sinxronlash xatoligi — Mobile (Sync error) | 3:524 | 390×659 | MD | BottomNavBar / Mobile Top Header / Main Canvas |
| 53 | 14 | Hisobot farqi — Desktop (Report discrepancy) | 3:613 | 1280×1024 | MD | Main Content Wrapper / Aside-Desktop SideNavBar |

### 6.1 Deep-dive detail for the 15 screenshot-verified screens

For these 15 only, additional CONFIRMED content is documented below. All fields not listed (Route, Role, Permission, API, DB, Business rules, Audit, QA coverage) are **NOT VERIFIED** — see §7.

**`1:2` FINCORE Desktop Shell** — Sidebar variant A. Nav: Dashboard, Xarajatlar, Daromadlar, Budjet, Tasdiqlash, Hisobotlar, Oyni yopish, Administratsiya. Footer: Sozlamalar, Chiqish, user block "Azizbek Rahimov". Purpose: app chrome/shell. States: none visible beyond default. **Components: visual pattern only, not a reusable Figma component** (0 instances exist file-wide).

**`1:307` FINCORE Mobile Shell** — Header "FINCORE / Sayxun filiali" (branch name shown in header — INFERRED multi-branch awareness). Body: welcome card, "Kassa qoldig'i" (cash balance) 12,450,000 so'm, "Bugungi kirim" (today's income) +4,200,000 so'm, 3 quick-action cards (Yangi xarajat, Yangi daromad, Tasdiq kutilmoqda — badge "3"), FAB (+). Bottom nav: Dashboard, Xarajatlar, Daromadlar, Profil (4 items — **fewer than desktop's 8**, CONFLICT candidate, see §21).

**`1:202` Kirish — Desktop (Login)** — Split layout: left = brand panel "O'quv markazi moliyaviy boshqaruv platformasi" (education-center financial management platform — confirms **vertical: education/tutoring center finance**, not generic ERP); right = form with "Telefon raqami" (+998 phone format), "Parol" (password, masked, show/hide toggle), "Parolni unutdim?" link, "Kirish" submit button, footer "Hisobingiz bilan muammo bormi? Qo'llab-quvvatlash markazi" (support link). **Confirms phone-number-based login, not email.**

**`3:410` Kirish rad etildi — Desktop (Access denied)** — Sidebar variant A with "Administratsiya" item **visibly disabled/locked** (grey text + lock icon). Body: shield-alert icon, "Kirish taqiqlangan" (access forbidden), body text explaining the module is admin-only, a chip reading **"Joriy rol: Viewer (Ko'ruvchi)"** — this is the **only literal role name confirmed anywhere in the file** — plus "Bosh sahifaga qaytish" and "Administratorga murojaat qilish" buttons. **CONFIRMED: an RBAC concept with at least a "Viewer" role exists in the design intent.**

**`1:855` Executive Dashboard — Desktop** — Sidebar variant B, tenant "IT Live Academy / FINCORE Executive". Filters: Yil (2026), Oy (Avgust), Filiali (Barcha filiallar). KPI tiles: Oylik reja 197,726,000 so'm; Oylik fakt 23,178,400 so'm (Bajarilish 11.7%); Qolgan budjet 174,547,600 so'm (13 kun qoldi); Doimiy/O'zgaruvchan 65%/35%; Naqd ulushi 78.4% (warning icon); Tasdiq kutayotganlar 7 ta / 12,450,000 so'm; Breakeven Nuqta 92,000,000 so'm; Kiritilmagan kunlar Sayxun — 3 kun (error icon). Chart: "12 Oylik Moliyaviy Dinamika" (Reja vs Fakt line chart, Yan–Dek). Side panel "Filiallar Kesimida": Sayxun 45%, Xalqlar do'stligi 62% (branch comparison bars). Table "Budjet Nazorati": columns Xarajat Moddasi / Reja / Fakt / Bajarilish / Status, rows Ijara (100%, "Meyorda"), Marketing (90%, "Yaxshi"), Boshqa xarajatlar (1251%, "Oshib ketgan" — red). **Confirms multi-branch, plan-vs-actual, and budget-overrun-status as real product concepts.**

**`1:1704` Xarajatlar ro'yxati — Desktop (Expense list)** — Sidebar variant A. Search + filters: Sana oralig'i, Filial, Kategoriya, Holat (status), To'lov usuli. Table columns: # / Sana / Kategoriya / Tavsif / Filial / Summa / To'lov usuli / Holat. 5 sample rows with categories (Ijara va Kommunal, Xo'jalik mollari, Marketing, Oziq-ovqat, Transport), statuses **Tasdiqlandi (approved/green), Tasdiq kutilmoqda (pending/amber), Rad etildi (rejected/red)**. Footer: "Ko'rsatilmoqda: 1–5 / 142 ta yozuv", total 23,178,400 so'm, pagination (pages 1–29). Buttons: "Tez kiritish" (quick entry), "Yangi xarajat" (new expense). **Confirms a 3-state expense status model: approved / pending / rejected.**

**`1:2331` Daromadlar ro'yxati — Desktop (Income list)** — Sidebar variant C ("FINCORE ERP"), English labels: Dashboard, Income, Students, Refunds, Reports, Settings, Support. Button "+ New Payment", "Qaytimlar" (Refunds) link. KPI tiles: Bu oy daromadi 124,500,000 so'm; To'lovlar soni 186 ta; To'lov qilgan o'quvchilar 151 ta; O'rtacha to'lov 824,503 so'm; Qaytimlar 2 ta / 450,000 so'm; Faol o'quvchilar 320 ta. Table columns: Sana / O'quvchi (with avatar) / To'lov turi / Summa / To'lov usuli / Filial. Payment types seen: "O'qish to'lovi", "Qo'shimcha dars", "Kitoblar uchun". Payment methods: "Click/Payme", "Naqd pul", "Uzum Bank". **Confirms a per-student tuition-payment model tied to branches, and at least 3 payment method integrations referenced by name (Click, Payme, Uzum Bank) — these are real Uzbek payment providers, but their integration is a UI label only, not a confirmed backend integration.**

**`1:2638` Budjet tahriri — Desktop (Budget editor)** — Sidebar variant B, tenant "IT Live Academy". Header "Avgust 2026" + "Qoralama" (draft) badge, "Oldingi oydan nusxalash" / "Oldingi yildan nusxalash" (copy-from-previous) buttons, "Saqlash" (save). Editable table: Xarajat Moddasi / Sayxun Filiali (so'm) / Xalqlar Do'stligi (so'm) — rows Ijara, Mentorlar oyligi, Marketing, Ofis xarajatlari, with a computed "Jami" (total) row (72,500,000 / 126,700,000). Side panel "Budjet nazorati": "To'ldirilganlik holati 100%", warning "Marketing oshib ketdi" (Marketing over budget, +45% vs. plan), "Asosiy ko'rsatkichlar": Rejalashtirilgan Daromad 450M so'm, Kutilayotgan Foyda 250.8M so'm. "Tasdiqlash jarayoni" stepper: "Moliya Menejeri — Tahrirlamoqda (Siz)" (done/current) → "Boshqaruvchi Direktor — Kutilmoqda" (pending), button "Tasdiqqa yuborish" (submit for approval). **Confirms a per-branch budget line-item model and a 2-step approval chain: Finance Manager → Managing Director.**

**`1:4100` Tasdiq navbati — Desktop (Approval queue)** — Sidebar variant A. Left list panel tabbed "Xarajatlar / Budjetlar" (Expenses / Budgets), 2 sample items ("Texnika sotib olish" 18,500,000 so'm — badge "Direktor tasdig'i kerak"; "Marketing" 4,500,000 so'm — badge "Tasdiq kutilmoqda"). Right detail panel for the selected item: title, branch/date, badge "Tasdiq kutilmoqda", "So'ralayotgan summa" 18,500,000 so'm, warning box "E'tibor talab qiladi — bu summa limitdan yuqori bo'lgani sababli qo'shimcha tekshirish tavsiya etiladi" (**confirms a spend-limit / threshold escalation rule exists in design intent**), "Budjet holati" panel (Reja/Sarflangan/Ushbu xarajat/Qoladigan, progress bar 92.5% sarflandi), "Ilova qilingan hujjatlar" (attached documents, invoice_0826.pdf 2.4MB with preview/download icons), "Oxirgi o'xshash xarajatlar" (similar recent expenses) mini-table, footer buttons "Rad etish" (reject) / "Tasdiqlash" (approve). **Confirms: document attachment on expenses, a two-button approve/reject action, and a threshold-based "needs extra review" business rule — exact threshold value NOT VERIFIED.**

**`1:5540` Hisobotlar markazi — Desktop (Reports center)** — Sidebar variant D ("FINCORE Systems"). Filters: 2024, Barcha oylar, Barcha filiallar, "Qo'llash" (apply). 8 report cards, each with icon/title/description/"Ko'rish →" link: **Oylik hisobot** (monthly report), **Filiallar taqqoslash** (branch comparison), **Yillik hisobot** (annual report), **Breakeven**, **Naqd oqim** (cash flow), **Xarajatlar tahlili** (expense analysis), **Daromad tahlili** (income analysis), **Reja–fakt** (plan vs. actual). **Only 2 of these 8 report types (Oylik hisobot, Breakeven) have a confirmed dedicated top-level screen elsewhere in the file — the other 6 (Filiallar taqqoslash, Yillik hisobot, Naqd oqim, Xarajatlar tahlili, Daromad tahlili, and this screen's own Reja–fakt vs. the Budget-phase "Reja–Fakt" screen at `1:3497`) have no confirmed matching screen.** Filed as **MISSING SCREEN** candidates in §P.

**`1:5368` Breakeven tahlili — Desktop** — Sidebar variant D. Two-column KPI panel: "So'mda Breakeven" (Fixed Cost 50,000,000; Variable Cost 20,000,000; Revenue 120,000,000; **Breakeven Sum 60,000,000**; Margin of Safety 50%; formula shown: "(Revenue − Breakeven Sum) / Revenue") and "O'quvchilar sonida Breakeven" (Active Students 120; Average Check 1,000,000; Var Cost per Student 166,666; **Breakeven Student Count 60**), plus a callout "Hozirgi kunda markaz xarajatlarini qoplash uchun kamida 60 ta o'quvchi kerak. Hozirgi holat barqaror." Bar visualization "Breakeven vs Daromad" with a marked "Nol nuqta (60m)" and "Joriy daromad (120m)" split into red "Zarar hududi" / green "Foyda hududi" zones. **This is the only screen in the entire audit where a business formula is explicitly shown in the design — CONFIRMED, not inferred: `Margin of Safety = (Revenue − Breakeven Sum) / Revenue`.**

**`1:6791` Oyni yopish — Desktop (Month closing)** — Sidebar variant E ("FINCORE ERP / Moliyaviy nazorat"), nav: Boshqaruv paneli, Moliya, Yopilish jarayoni, Audit, Arxiv. Header "Oyni yopish" + period selector (2024 / Oktabr). KPI tiles: Jami Daromad 452,000,000 UZS; Jami Xarajat 218,500,000 UZS; Sof Foyda 233,500,000 UZS. Status card: lock icon, "DAVR OCHIQ" (period open), "Jarayonda" badge, warning "Oyni yopish amaliyoti ortga qaytarilmaydi. Barcha ma'lumotlar o'zgartirishsiz saqlanadi" (**CONFIRMED: closing is stated as irreversible in the design copy**), button "Oyni yopish". Checklist "Yopilish Nazorat Ro'yxati": "Barcha xarajatlar tasdiqlangan — 100%" (✓), "Daromadlar va qaytimlar mosligi — Tekshirildi" (✓), "Kassa qoldig'i tekshirilgan — Tasdiqlandi" (✓), **"Tafovutlar mavjud emas" — flagged red, "2 ta aniqlanmagan tranzaksiya mavjud" (2 unreconciled transactions), button "Ko'rib chiqish"** (blocking item), "Hujjatlarni tekshirish" (button "Tekshirish"), "Budjet og'ishlari" (button "Hisobot"). **Confirms month-close is gated behind a multi-item reconciliation checklist and can be blocked by unreconciled transactions.**

**`1:7885` Administratsiya — Desktop** — Sidebar variant C. Button "+ New Payment" (**inconsistent — this is an Income-phase action leaking into the Admin nav shell**, another shell-consistency defect). KPI tiles: Faol foydalanuvchilar 12; Faol filiallar 4; Faol kategoriyalar 24; Bugungi audit hodisalari 156 (+12%). Panel "Xavfsizlik holati": ✓ Audit log faol, ✓ RBAC faol, ✓ Filial cheklovlari faol, ✓ Audit yozuvlari o'zgartirilmaydi (immutable). "Tezkor amallar": Foydalanuvchi qo'shish, Kategoriya qo'shish, Filial qo'shish (enabled), Sozlamalarni ko'rish / Audit logni ko'rish (greyed/disabled in this mock). Empty-state placeholder: "Markazlashtirilgan boshqaruv — Tizimning barcha ma'lumotnomalari va xavfsizlik protokollari qat'iy nazorat ostida saqlanadi." **Confirms 4 literal claims baked into the design copy: audit logging is active, RBAC is active, branch-level restrictions are active, audit records are immutable. These are product requirements stated in the UI copy, not confirmed backend behavior — no code exists to verify against.**

**`1:8592` Muvaffaqiyatli yopildi — Desktop (Closing success, modal)** — Standalone card (no shell — confirms this is a **modal/overlay**, not a routed page): green check icon, "Moliyaviy davr yopildi" (Financial period closed), "Avgust 2026 davri yakunlandi va ma'lumotlar muzlatildi" (data frozen), detail rows "Yopgan: Alisher U." (closed by) / "Sana: 19.08.2026, 14:30", and **"Checksum: SHA-256 a84c98f7e2d1b5a6c4f3e8d9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f892ef"**, buttons "Yopilgan davrlar" / "Hisobotni ko'rish". **CONFIRMED, concrete business rule: closing a period is expected to produce an immutable record identified by actor, timestamp, and a SHA-256 checksum.** This is the strongest integrity-mechanism evidence found anywhere in the file.

**`2:2` QA Dashboard — Desktop** — Sidebar variant A, page title "Edge Cases / QA". KPI tiles: Test holatlari 128; Passed 121; Failed 0; Blocked 3; Needs review 4. Tabs: **Authentication** (active), Authorization, Branch Security, Expense, Income, Budget, Approval, Reports — **only the Authentication tab's content was visible/captured**; the other 7 are NOT VERIFIED. Authentication tab table (columns ID / Category / Test / Expected result / Status / Severity):

| ID | Category | Test | Expected result | Status | Severity |
|---|---|---|---|---|---|
| QA-AUTH-01 | Brute Force | 5 marta noto'g'ri parol kiritish | Hisob 15 daqiqaga bloklanishi kerak | Muvaffaqiyatli (Passed) | High |
| QA-AUTH-02 | Session Expiry | 30 daqiqa harakatsizlik | Avtomatik tizimdan chiqish (Logout) | Muvaffaqiyatli (Passed) | Medium |
| QA-AUTH-03 | Concurrent Login | Bitta akkauntga 2 xil qurilmadan kirish | Birinchi sessiya yopilishi kerak | Tekshiruv kerak (Needs review) | High |
| QA-AUTH-04 | 2FA Bypass | To'g'ridan-to'g'ri URL orqali o'tish | 403 Forbidden qaytarilishi kerak | Bloklangan (Blocked) | Critical |

**This table is the single clearest, most literal source of confirmed business rules in the entire file** (15-minute lockout after 5 failed attempts; 30-minute idle session timeout; single-session-per-account enforcement intended but flagged "needs review" i.e. **not confirmed as implemented even within the design's own QA tracking**; direct-URL 2FA bypass must return 403). These four rules are promoted into the Business Rule Registry (§I) as `CONFIRMED (design-stated intent)`.

---

## 7. DESIGN SYSTEM AUDIT

| Aspect | Status | Evidence |
|---|---|---|
| Colors | NOT ACCESSIBLE THROUGH CURRENT FIGMA MCP as tokens | No color styles/variables found via `search_design_system` (empty) or `get_variable_defs` (empty object). Colors are visually observable per-screenshot only (e.g. dark-navy sidebar, red/amber/green status colors) — no hex values extracted; extracting them would require per-node `get_design_context` calls, which were exhausted by the MCP rate limit. |
| Typography | NOT ACCESSIBLE THROUGH CURRENT FIGMA MCP as styles | No text styles found via `search_design_system`. Typeface/size not enumerated. |
| Spacing | NOT ACCESSIBLE THROUGH CURRENT FIGMA MCP as tokens | No spacing variables exist (`get_variable_defs` empty). |
| Radius / Borders / Shadows | NOT ACCESSIBLE THROUGH CURRENT FIGMA MCP as tokens | Same — no variables or styles registered. |
| Icons | NOT VERIFIED | 930 vector nodes exist file-wide (confirmed count) but are not organized as a named icon library/component set. |
| Buttons, Inputs, Tables, Cards, Badges, Navigation, Modal, Dropdown, Tabs | **VISUAL PATTERN ONLY — not a confirmed component** | All of these patterns are visible in screenshots (e.g. primary black button, status badges, data tables, KPI cards, a tab control on the QA Dashboard and the Approval queue). None exist as a Figma `component`/`instance` node anywhere in the file (file-wide tag census: 0 components, 0 instances). Every instance of what looks like a reusable button or badge was independently drawn with plain frames/text/vectors. |

**Overall design system status: NOT PRESENT AS TOKENS/COMPONENTS.** Six community UI-kit libraries (Material 3, Simple Design System, iOS/iPadOS 26 & 27, watchOS 26, visionOS 26, macOS 26/27) are attached to the file but confirmed **unused** (0 matching instances via `search_design_system`). No token values are stated anywhere in this document because none could be read — inventing hex codes or a spacing scale was explicitly avoided per the no-invention rule.

---

## 8. COMPONENT AUDIT

Per instruction, `CONFIRMED COMPONENT` is reserved for actual Figma component/instance nodes; everything else is `VISUAL PATTERN ONLY`.

| Candidate | Classification | Basis |
|---|---|---|
| Sidebar nav | VISUAL PATTERN ONLY (and inconsistent — 6 variants, §2) | Frame-built per screen, not a shared instance |
| KPI/stat card | VISUAL PATTERN ONLY | Recurs visually across Dashboard, Budget, Reports, Breakeven, Admin screens but each is an independently drawn frame |
| Status badge (Tasdiqlandi/Kutilmoqda/Rad etildi, Passed/Failed/Blocked) | VISUAL PATTERN ONLY | Recognizable color/shape convention (green/amber/red) but not a Figma component with variants |
| Data table | VISUAL PATTERN ONLY | Every table (Expenses, Income, Budget Nazorati, QA results) is a bespoke frame layout |
| Primary/secondary button | VISUAL PATTERN ONLY | Black-fill primary, outline secondary observed consistently in screenshots, but no component definition backs it |
| Modal/overlay (closing confirm, closing success) | VISUAL PATTERN ONLY | Confirmed as modals by their dimmed-background structure (§6.1) but not built as a reusable overlay component |

**CONFIRMED COMPONENT count: 0.** This means engineering cannot rely on Figma component variants/props to drive a component library — any component library must be authored from scratch based on the recurring *visual patterns* catalogued above, with design confirming the canonical version given the shell inconsistency in §2.

---

## 9. PROTOTYPE AUDIT

NOT ACCESSIBLE. Restated from §5: the connected Figma MCP toolset has no capability to read prototype reactions, connections, or interaction definitions. Nothing further can be said without a human opening the file's Prototype tab in the Figma desktop/web app directly.

---

## 10. RESPONSIVE AUDIT & RESPONSIVE GAP REGISTER

| Breakpoint | Evidence | Screens using it |
|---|---|---|
| Desktop (1280px wide, dominant) | CONFIRMED | 37 of 53 screens |
| Mobile (390px wide, iPhone-width) | CONFIRMED | 14 of 53 screens |
| Tablet (e.g. ~768px) | **NOT PRESENT IN FIGMA FILE** | 0 screens — no tablet-width frame exists anywhere |

**Responsive Gap Register:**

| Phase | Desktop screens | Mobile screens | Gap |
|---|---|---|---|
| 1 | 1 | 1 | None |
| 2 | 5 | 2 | Hisob bloklandi, SMS Tasdiqlash, Parolni almashtirish have no mobile variant |
| 3 | 2 | 1 | Dashboard loading state has no mobile variant |
| 4 | 2 | 2 | None |
| 5 | 3 | 1 | Daromadlar ro'yxati, O'quvchi profili, Yangi qaytim have no mobile variant |
| 6 | 3 | 1 | Budjet tahriri, Budjet davrlari, Reja–Fakt have no mobile variant |
| 7 | 3 | 1 | Budjet tasdig'i, Tasdiq tarixi have no mobile variant |
| 8 | 5 | 2 | Only the "Full" monthly report has a mobile pair; base report and Hisobotlar markazi do not |
| 9 | 2 | 1 | Base breakeven has no mobile pair (only "Full" does) |
| 10 | 6 | 2 | Confirm-modal, closed-periods, archive, success-modal have no mobile variant |
| 11 | 5 | 1 | Users, Settings, Audit log, Profile have no mobile variant |
| 14 | 4 | 1 | QA Dashboard, Test detail, Access denied have no mobile variant |

No tablet layout exists anywhere. This is a genuine gap, not an oversight in this audit — it was actively checked (all 53 canvas widths were parsed; only 390 and ~1280 values occur).

---

## 11. DEVELOPMENT SPECIFICATION

### 11.1 Product overview
**CONFIRMED (from design copy only):** FINCORE is a financial-management platform for what the login screen literally calls an *"o'quv markazi"* (education/tutoring center), with multi-branch operations (Sayxun, Xalqlar do'stligi, Yunusobod, Chilonzor branches all named in screenshots), covering expense tracking, student tuition income, budgeting with a 2-step approval chain, break-even analysis, monthly period closing with checksum-based integrity, and administration with RBAC. Everything beyond this literal reading (target market size, business model, pricing) is **NOT VERIFIED**.

### 11.2 Architecture overview
**NOT VERIFIED.** No TZ, no codebase, and Figma does not encode architecture. The project directory being empty means there is no existing frontend framework, backend, or hosting decision to document. This must be an **IMPLEMENTATION DECISION** (§T), not an assumption made here.

### 11.3 Screen inventory
See §6 (full 53-screen table) and §6.1 (15-screen deep dive).

### 11.4 Route map
**NOT VERIFIED / INFERRED ONLY.** Figma frame names are not URLs and no routing table exists. A plausible route slug is suggested per phase purely as an INFERRED naming convention for engineering discussion — **none of this is confirmed**:

| Phase | Inferred route (NOT CONFIRMED) |
|---|---|
| 2 | `/login`, `/login/sms-verify`, `/login/blocked`, `/login/set-password`, `/403` |
| 3 | `/dashboard` |
| 4 | `/expenses`, `/expenses/new`, `/expenses/:id` |
| 5 | `/income`, `/income/new`, `/students/:id`, `/refunds/new` |
| 6 | `/budget`, `/budget/periods`, `/budget/plan-vs-actual` |
| 7 | `/approvals`, `/approvals/history` |
| 8 | `/reports`, `/reports/monthly` |
| 9 | `/reports/breakeven` |
| 10 | `/closing`, `/closing/wizard`, `/closing/archive` |
| 11 | `/admin`, `/admin/users`, `/admin/settings`, `/admin/audit-log`, `/profile` |
| 14 | `/qa` (internal-only, likely excluded from production routing) |

### 11.5 Role matrix
**NOT VERIFIED**, with one exception. Only one role name is `CONFIRMED` anywhere in the file: **"Viewer (Ko'ruvchi)"** (seen on the Access-Denied screen, §6.1). Design copy also implies (not names) at least two more actors: a "Moliya Menejeri" (Finance Manager) and "Boshqaruvchi Direktor" (Managing Director) as steps in the budget-approval stepper (§6.1, Budjet tahriri) — these are **INFERRED role names** from a process-step label, not confirmed as system roles. A full role matrix cannot be built without a TZ.

| Role (status) | Evidence |
|---|---|
| Viewer / Ko'ruvchi | CONFIRMED — named explicitly, shown restricted from Administratsiya |
| Moliya Menejeri (Finance Manager) | INFERRED — named as a step label, not a system role |
| Boshqaruvchi Direktor (Managing Director) | INFERRED — named as a step label, not a system role |
| Administrator | INFERRED — Administratsiya module text says "faqatgina tizim administratorlari uchun mo'ljallangan" (admin-only), implying an "Administrator" role exists, but the role is never named as such |
| Kassir (Cashier) | INFERRED — from screen name "Kassir paneli — Mobile", implying a cashier-specific mobile view exists, but no role-gating evidence was seen for it |

### 11.6 Permission matrix
**NOT VERIFIED.** Only one permission fact is confirmed: the Viewer role cannot access the Administratsiya module (§6.1). No other screen-by-role permission boundary can be verified from Figma alone.

### 11.7 Component registry
See §8. **0 confirmed reusable components.** A registry of *visual patterns* (not components) is listed there and should be treated as the raw material for a real component library, to be authored during implementation — not as a pre-existing library to import.

### 11.8 Form registry
Two forms were visually confirmed in full: the Login form (`1:202`: phone number, password, submit) and the Budget editor (`1:2638`: per-category numeric inputs). All other forms referenced by screen name (Yangi xarajat, Yangi to'lov, Yangi qaytim, Foydalanuvchilar create) were **not screenshot-verified** — their field lists are **NOT VERIFIED**.

### 11.9 Validation registry
**NOT VERIFIED.** No validation rule (required fields, formats, min/max) is stated anywhere in any screenshot inspected. Phone number format `+998 (00) 000-00-00` is CONFIRMED as a display mask on the login screen only.

### 11.10 API registry
**NOT VERIFIED.** Figma contains no API information. No API registry can be produced without a TZ or backend design document, neither of which exists in this project.

### 11.11 Database entity map
**NOT VERIFIED**, with entities *inferable* (not confirmed) purely from on-screen data groupings: Users, Roles, Branches (Filiallar), Expenses (Xarajatlar), Expense Categories, Income/Payments (Daromadlar), Students (O'quvchilar), Refunds (Qaytimlar), Budgets (per branch, per category, per period), Approvals (polymorphic — attaches to Expenses and Budgets per the queue's tab structure), Closing Periods (with checksum/actor/timestamp), Audit Log entries. **These are INFERRED groupings from UI data display, not a confirmed schema** — field types, keys, and relationships are NOT VERIFIED.

### 11.12 Business rules
The only `CONFIRMED (design-stated intent)` business rules found in the entire audit:

1. Failed login: 5 wrong password attempts → account locked 15 minutes (QA-AUTH-01).
2. Idle session: 30 minutes inactivity → automatic logout (QA-AUTH-02).
3. Concurrent login: 2 devices, same account → first session should close (QA-AUTH-03) — **flagged "needs review" even within the design's own QA tracker, i.e. not confirmed as actually enforced.**
4. Direct URL access to a 2FA-gated route without completing 2FA → must return 403 Forbidden (QA-AUTH-04).
5. High-value expense requests trigger an "E'tibor talab qiladi" (needs extra review) flag when above an unstated threshold (Approval queue, `1:4100`) — **threshold value NOT VERIFIED.**
6. Budget approval requires 2 sequential sign-offs: Finance Manager, then Managing Director (Budget editor, `1:2638`).
7. Month-end closing is stated as irreversible once executed, and is gated by a reconciliation checklist that can hard-block on unresolved items (e.g., "2 unreconciled transactions") (`1:6791`).
8. A closed period produces an immutable record with actor, timestamp, and a SHA-256 checksum (`1:8592`).
9. Break-even margin of safety formula: `(Revenue − Breakeven Sum) / Revenue` (`1:5368`).
10. Expense status model: 3 states — Tasdiqlandi (approved) / Tasdiq kutilmoqda (pending) / Rad etildi (rejected) (`1:1704`).

Every other business rule that might exist (e.g. refund eligibility, student enrollment rules, budget-period locking, category management rules) is **NOT VERIFIED.**

### 11.13 State machines
Only one state machine has enough confirmed evidence to sketch, and only at a shallow level:

**Expense approval state (CONFIRMED states, INFERRED transitions):**
`Pending (Tasdiq kutilmoqda)` → `Approved (Tasdiqlandi)` | `Rejected (Rad etildi)`
— states are confirmed by the status badges in `1:1704`; the transition triggers (who can move it, whether rejection requires a reason) are **NOT VERIFIED.**

**Month-closing state (CONFIRMED states, INFERRED transitions):**
`Davr ochiq (Period open)` → `Yopilish jarayonida (Closing in progress, checklist gating)` → `Yopildi (Closed, checksum issued)`
— confirmed by `1:6791` and `1:8592`; whether a closed period can ever be reopened is **NOT VERIFIED** (design copy says "ortga qaytarilmaydi" / cannot be undone, which argues against a reopen path, but this is not conclusive for an "Arxiv" screen that also exists).

All other state machines (login/session, budget draft→submitted→approved, user account lifecycle) are **NOT VERIFIED** beyond the single QA-table facts already listed in §11.12 items 1–4.

### 11.14 Error handling
Confirmed error-oriented screens exist for: Access denied / 403 (`3:410`), Account blocked (`1:166`, not visually verified), Login rejected states generally, Sync error — mobile (`3:524`, not visually verified), Report discrepancy (`3:613`, not visually verified). Their exact copy/behavior beyond `3:410` is **NOT VERIFIED** (rate-limited before capture).

### 11.15 Notifications
**NOT VERIFIED** as a system. A bell/notification icon with an unread-count badge is visually present in the top bar of multiple screens (e.g. "3" badge on the Mobile Shell, a bell icon on Dashboard/Expenses/Reports headers) — this confirms a notification *affordance* exists in the design, but no notification content, triggers, or channels (push/email/SMS) are confirmed.

### 11.16 Audit requirements
Design copy on the Administratsiya screen explicitly states "Audit log faol" and "Audit yozuvlari o'zgartirilmaydi" (immutable), and a dedicated "Audit log — Desktop" screen exists (`1:8635`, not visually verified beyond its layout-section names). The month-closing checksum mechanism (§11.12 item 8) is the clearest concrete audit-trail requirement in the file. Beyond these UI copy claims, no audit log schema, retention policy, or event taxonomy is confirmed.

### 11.17 PWA requirements
See §4 PWA Gap Register. **NOT PRESENT IN FIGMA FILE.**

### 11.18 Offline requirements
**NOT VERIFIED / NOT PRESENT IN FIGMA FILE.** No offline state, sync-conflict screen, or offline-data-entry flow was found among the 53 screens, aside from the unrelated "Sinxronlash xatoligi — Mobile" (Sync error) edge-case screen in Phase 14, whose actual content is NOT VERIFIED (not screenshot-captured).

### 11.19 QA traceability
See §U.

### 11.20 Missing requirements
See §P and §Q.

### 11.21 Conflicts
See §R.

### 11.22 Assumptions
See §S. Per the governing rule, this section is intentionally short — assumptions were minimized in favor of NOT VERIFIED markers.

### 11.23 Implementation decisions
See §T.

### 11.24 Development backlog
See §V.

---

## 12. TRACEABILITY (sample chains for critical features)

Per instruction: every broken link is marked, not papered over.

**Feature: Expense approval**
Figma Screen (`1:4100` Tasdiq navbati, CONFIRMED) → UI Element (Approve/Reject buttons, CONFIRMED) → Route (`/approvals`, INFERRED) → Role (unnamed "approver" role, NOT VERIFIED which named role) → Permission (NOT VERIFIED) → Business Rule (3-state status model, CONFIRMED; threshold-triggered extra review, CONFIRMED existence / NOT VERIFIED threshold value) → API (NOT VERIFIED — none exists) → Database (Expenses + Approvals entities, INFERRED only) → Audit (NOT VERIFIED whether approval actions are logged) → QA (NOT VERIFIED — no QA-APPROVAL-* test rows were captured before rate limit).

**Feature: Month-end closing**
Figma Screen (`1:6791` → `1:7101` → `1:8592`, CONFIRMED as a 3-screen sequence by name/content, prototype linkage itself NOT ACCESSIBLE) → UI Element ("Oyni yopish" button, reconciliation checklist, CONFIRMED) → Route (`/closing`, INFERRED) → Role (NOT VERIFIED who may close a period) → Permission (NOT VERIFIED) → Business Rule (irreversible once closed; blocked by unreconciled transactions; checksum issued, all CONFIRMED as design intent) → API (NOT VERIFIED) → Database (Closing Periods entity, INFERRED) → Audit (checksum + actor + timestamp, CONFIRMED as a stated requirement) → QA (NOT VERIFIED — no QA-CLOSING-* test rows captured).

**Feature: Authentication / account lockout**
Figma Screen (`1:202` Kirish, `1:166` Hisob bloklandi [not visually verified], CONFIRMED to exist) → UI Element (phone+password form, CONFIRMED) → Route (`/login`, INFERRED) → Role (N/A, pre-auth) → Permission (N/A) → Business Rule (5 attempts → 15 min lock; 30 min idle → logout, CONFIRMED via QA-AUTH-01/02) → API (NOT VERIFIED) → Database (Users entity, INFERRED) → Audit (NOT VERIFIED whether lockouts are logged) → QA (CONFIRMED — QA-AUTH-01 through 04 exist and were read directly, §6.1).

Every other feature in the file has more broken links than confirmed ones and is not worth spelling out chain-by-chain here; the pattern is consistent: **Figma confirms UI and a handful of literal business-rule strings; everything downstream of "Route" is NOT VERIFIED file-wide** because no TZ or codebase exists.

---

## FINAL OUTPUT

### A. EXECUTIVE SUMMARY

FINCORE's Figma file is real, substantial, and readable: 53 screens across 12 of the 14 requested phases, with genuine financial-platform content (multi-branch education-center expense/income/budget/approval/closing workflows for what appears to be an Uzbekistan-market product, given phone-format, currency, and payment-provider details). Phases 12 (Mobile PWA) and 13 (Prototype) have no dedicated material in the file — Phase 12 is confirmed absent, Phase 13 is unreachable with current tools, not confirmed absent.

The single biggest structural risk is **not** a missing screen — it's that the file was evidently assembled non-linearly (AI-assisted generation artifacts are visible in layer names) and contains **six different, mutually inconsistent navigation shells** with three different product/tenant names ("FINCORE", "FINCORE ERP", "FINCORE Systems", "IT Live Academy"). No engineering team should start building screens against this file until design consolidates on one shell. This is CONFLICT-01 and the #1 backlog item.

The second biggest risk is that **this project currently has no requirements document at all.** Everything below "UI layout" — roles, permissions, APIs, database schema, business rules, audit policy — is either a literal string pulled from mockup copy (10 such rules were found and are listed in §11.12) or explicitly marked NOT VERIFIED. A real TZ is a prerequisite for implementation, not a nice-to-have; this document cannot substitute for one.

A Figma MCP Starter-plan rate limit was hit during the audit; 38 of 53 screens have structural (not visual) verification only. This should be re-run once quota resets, or on a higher Figma plan, before this document is treated as final.

### B. COMPLETE SCREEN INVENTORY
See §6.

### C. COMPLETE ROUTE MAP
See §11.4. All entries INFERRED, none CONFIRMED.

### D. ROLE/PERMISSION MATRIX
See §11.5–§11.6. 1 role CONFIRMED ("Viewer"), 4 more INFERRED, 0 permission boundaries CONFIRMED beyond Viewer↛Administration.

### E. COMPONENT REGISTRY
See §8. 0 CONFIRMED COMPONENTS; 6 recurring VISUAL PATTERNS catalogued.

### F. FORM/VALIDATION REGISTRY
See §11.8–§11.9. 2 forms visually confirmed; validation rules NOT VERIFIED file-wide except the login phone mask.

### G. API REGISTRY
NOT VERIFIED. No entries exist to register — Figma contains no API information and no backend/TZ document exists in this project.

### H. DATABASE ENTITY MAP
See §11.11. All entities INFERRED from UI groupings; no schema CONFIRMED.

### I. BUSINESS RULE REGISTRY
See §11.12 — 10 CONFIRMED (design-stated) rules, numbered. All others NOT VERIFIED.

### J. STATE MACHINES
See §11.13. 2 partial state machines with CONFIRMED states / INFERRED transitions; all others NOT VERIFIED.

### K. ERROR MATRIX
See §11.14. 5 error-purpose screens identified by name; only 1 (`3:410` Access denied) visually confirmed in detail.

### L. PWA GAP REGISTER
See §4. Phase 12 confirmed NOT PRESENT IN FIGMA FILE.

### M. PROTOTYPE GAP REGISTER
See §5. Phase 13 confirmed NOT ACCESSIBLE via current tooling; NOT VERIFIED whether it exists in the raw file.

### N. DESIGN SYSTEM GAP REGISTER
See §7. No tokens, no styles, no components anywhere in the file; 6 unused community libraries attached.

### O. FIGMA INCONSISTENCY REPORT
1. **Six incompatible navigation shells** across screens, three different product/tenant names (§2) — CONFIRMED, highest severity.
2. **Mixed language labeling** — some shells use Uzbek nav labels (Xarajatlar, Daromadlar), others use English (Income, Expenses, Settings) inconsistently within what should be one product — CONFIRMED.
3. **AI-generation artifacts leaked into layer names** — e.g. `JSON Component: SideNavBar`, a truncated `Relevance Check: ...` annotation string used as an actual frame name — CONFIRMED, indicates no manual design-QA naming pass occurred.
4. **"+ New Payment" button appears in the Administration screen's shell** (`1:7885`), which is an Income-phase action, not an admin action — CONFIRMED, likely a shell-template copy/paste error.
5. **Mobile bottom nav has only 4 items** (Dashboard, Xarajatlar, Daromadlar, Profil) vs. desktop's 8 — CONFIRMED; unclear if the missing 4 (Budjet, Tasdiqlash, Hisobotlar, Oyni yopish, Administratsiya) are reachable another way on mobile (e.g. a "more" menu) — NOT VERIFIED, no such menu was observed in the one mobile shell screenshot taken.
6. **Reports Center advertises 8 report types; only 2 have a confirmed dedicated screen** (§P) — CONFIRMED gap.

### P. MISSING SCREEN REPORT
The following are referenced by name/label inside a confirmed screen but have **no matching top-level screen found in the 53-screen inventory**:
- Filiallar taqqoslash (Branch comparison report)
- Yillik hisobot (Annual report)
- Naqd oqim (Cash flow report)
- Xarajatlar tahlili (Expense analysis report)
- Daromad tahlili (Income analysis report)
— all six referenced as cards on Hisobotlar markazi (`1:5540`), only "Oylik hisobot" and "Breakeven" of the 8 resolve to a confirmed screen elsewhere in the file. Also missing: a standalone Student list screen (only a Student *profile* screen, `1:3245`, was found), and a Notifications screen/panel (only a bell icon affordance was observed, no panel content).

Note: it is possible these open into a shared generic "report viewer" screen not distinctly named — this is **NOT VERIFIED** either way and should be confirmed with design before treating it as a missing-screen defect.

### Q. MISSING STATE REPORT
- No empty-state or error-state variant found for: Dashboard (beyond the one loading state), Expense list, Income list, Reports.
- No confirmed "reject reason" entry UI for the Approval flow (a reject button exists; what happens after clicking it is NOT VERIFIED).
- No tablet breakpoint anywhere (§10).
- No offline/PWA states anywhere (§4).
- 7 of 8 QA Dashboard tabs have unknown content (§6.1).

### R. CONFLICT REGISTER

**CONFLICT-01**
- Source A: FINCORE Desktop Shell (`1:2`) and 3 other screens use nav Shell Variant A with Uzbek labels and product name "FINCORE / Financial Platform."
- Source B: Executive Dashboard (`1:855`) and Budget editor (`1:2638`) use Shell Variant B branded "IT Live Academy / FINCORE Executive."
- Conflict: Two more variants (C, D — §2) also exist, each with a different nav item set and different product name, all within the same single Figma file.
- Impact: Engineering cannot determine the canonical app shell, nav taxonomy, or even product name to build against. Any implementation choice risks being wrong for 4 of the file's 6 shell variants.
- Recommended resolution: Design to designate one shell as canonical and re-skin all screens to match before handoff; alternatively, if these represent genuinely different roles/tenants by design, that must be stated explicitly (currently NOT VERIFIED).
- Decision required: **Product/Design — which shell (or role-based set of shells) is canonical?**

**CONFLICT-02**
- Source A: Budget editor approval stepper (`1:2638`) implies a 2-step role chain: "Moliya Menejeri" → "Boshqaruvchi Direktor."
- Source B: The only literally-named role anywhere in the file is "Viewer (Ko'ruvchi)" (`3:410`).
- Conflict: No source confirms whether "Moliya Menejeri" and "Boshqaruvchi Direktor" are real system roles, job-title labels, or simply the *current* two users' display titles.
- Impact: Role matrix (§11.5) cannot be built with confidence.
- Recommended resolution: Confirm with product/design whether these are system roles.
- Decision required: **Product — formal role list.**

**CONFLICT-03**
- Source A: Reports Center (`1:5540`) advertises 8 distinct report types as navigable cards.
- Source B: Screen inventory (§6) confirms dedicated screens for only 2 of the 8.
- Conflict: Unknown whether the other 6 share one generic report-viewer screen (not distinctly Figma-named) or are simply missing from the file.
- Impact: Reports phase (8) scope is ambiguous — could be 2 screens or 8.
- Recommended resolution: Confirm with design.
- Decision required: **Design — are the other 6 reports separate screens or a shared template?**

### S. ASSUMPTION REGISTER
Kept intentionally minimal per the governing rule (prefer NOT VERIFIED over assumption). The only assumption made anywhere in this document:
- **ASSUMPTION-01:** The 6 y-band row groupings visible in the Figma canvas (used to help organize the 53 screens into the 14 requested phases) reflect the designer's actual phase groupings. This is a layout-coordinate inference, not a confirmed phase tag — Figma has no native "phase" concept and no Sections were used to make this explicit. If wrong, some screens in §6 could be mis-assigned to the wrong phase number (the screen content/name itself is still accurately reported regardless).

### T. IMPLEMENTATION DECISION REGISTER
Decisions that must be made by the user/product owner before development can proceed — none were made silently by this document.

| ID | Decision needed | Why it can't be made here |
|---|---|---|
| DECISION-01 | Which of the 6 shell variants (or what unified shell) is canonical | No design authority reachable from Figma data alone; see CONFLICT-01 |
| DECISION-02 | Formal role list and permission matrix | No TZ exists; only 1 role is literally named in the file |
| DECISION-03 | Target architecture (frontend framework, backend, hosting) | Project directory is empty; no prior technical decision exists to read |
| DECISION-04 | Scope of Phase 12 (Mobile PWA) | No screens exist to scope from; requires a fresh product decision |
| DECISION-05 | Whether Phase 13 prototype flows exist in the raw Figma file | Requires a human to open Figma's Prototype tab directly — outside current tool capability |
| DECISION-06 | Whether the 6 un-matched report types (§P) are separate screens or a shared template | Ambiguous from the Reports Center screen alone |
| DECISION-07 | Numeric threshold for "needs extra review" expense flag | Shown as a triggered state (`1:4100`) but the number itself is never displayed |

### U. QA TRACEABILITY MATRIX

| QA ID | Feature | Figma screen | Business rule tested | Verified in this audit |
|---|---|---|---|---|
| QA-AUTH-01 | Login lockout | Kirish (`1:202`), Hisob bloklandi (`1:166`, not visually confirmed) | 5 failed attempts → 15 min lock | YES — read directly from QA Dashboard table |
| QA-AUTH-02 | Session timeout | N/A (system-level) | 30 min idle → logout | YES |
| QA-AUTH-03 | Concurrent session | N/A (system-level) | 2nd device login should close 1st session | YES (status: itself flagged "needs review") |
| QA-AUTH-04 | 2FA bypass via direct URL | SMS Tasdiqlash (`1:262`, not visually confirmed) | Direct URL access must 403 | YES |
| QA-AUTHZ-* | Authorization | Kirish rad etildi (`3:410`) | Role-gated module access | **NOT VERIFIED** — Authorization tab content not captured before rate limit |
| QA-BRANCH-* | Branch security | — | Branch-level data isolation | **NOT VERIFIED** — tab not captured |
| QA-EXP-* | Expense edge cases | — | — | **NOT VERIFIED** — tab not captured |
| QA-INC-* | Income edge cases | — | — | **NOT VERIFIED** — tab not captured |
| QA-BUD-* | Budget edge cases | — | — | **NOT VERIFIED** — tab not captured |
| QA-APPR-* | Approval edge cases | — | — | **NOT VERIFIED** — tab not captured |
| QA-REP-* | Report edge cases | — | — | **NOT VERIFIED** — tab not captured |

7 of 8 QA categories are completely unverified. The 128-test, 121-passed/0-failed/3-blocked/4-needs-review summary tile total (CONFIRMED as displayed) cannot be reconciled against category detail beyond Authentication (which alone would need to account for exactly 4 of the 128 — the other 124 are unaccounted for in this audit).

### V. DEVELOPMENT BACKLOG
Ordered by what blocks everything else:

1. **[BLOCKER] Resolve CONFLICT-01** — get design to commit to one canonical shell before any screen is implemented.
2. **[BLOCKER] Obtain or write a real TZ/requirements document** — this project has none; §G, §H, most of §I/§J/§D are empty without one.
3. Re-run this Figma audit for the 38 metadata-only screens once the MCP rate limit resets (or on a paid plan), with priority on: Foydalanuvchilar (Users/RBAC), Tizim sozlamalari (Settings), Audit log, Hisob bloklandi, SMS Tasdiqlash, Xarajat tafsilotlari, Tasdiq tarixi.
4. Have a human check the Figma file's Prototype tab directly and report back what navigation logic actually exists (resolves DECISION-05).
5. Confirm role list and permission matrix with product (resolves DECISION-02).
6. Confirm the 6 unmatched report types in §P (resolves DECISION-06).
7. Confirm the numeric expense-review threshold (resolves DECISION-07).
8. Decide Phase 12 (PWA) scope from scratch (resolves DECISION-04) — nothing in Figma to build from.
9. Decide target architecture (resolves DECISION-03).
10. Only after 1–9: begin building a real component library from the visual patterns in §8, informed by whichever shell wins DECISION-01.

### W. FINAL DEVELOPER HANDOFF

This document is **not** a build-ready spec — it is an honest map of what is and is not currently knowable about FINCORE. A developer picking this up should read it as: *"53 real screens exist and are inventoried; 15 have real observed content; a handful of real business rules are confirmed word-for-word from the design; the navigation shell is unresolved and must not be built against as-is; almost nothing about roles, APIs, or data model is confirmed; Phases 12 and 13 have nothing to build from yet."* No code, migration, controller, or new UI was created in the process of producing this document, per instruction. The next action is human decisions (§T), not engineering.

---

*End of Phase 15 document. All findings above are traceable to specific Figma node IDs or explicitly marked as NOT VERIFIED / NOT ACCESSIBLE / INFERRED — nothing was silently assumed.*
