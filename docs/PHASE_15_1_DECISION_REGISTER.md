# PHASE 15.1 — Decision Register

**Source:** `docs/PHASE_15_DEVELOPMENT_SPECIFICATION.md` (full document re-read in its entirety for this extraction)
**Purpose:** Convert every CONFLICT / NOT VERIFIED / NOT ACCESSIBLE / ASSUMPTION / IMPLEMENTATION DECISION / MISSING / GAP / BLOCKER item found in Phase 15 into a decision the user can approve. **No decision below has been made. Every "Recommendation" is a suggestion for the human to weigh, not a resolution.**

---

## Executive Summary

Phase 15 produced 53 catalogued Figma screens but confirmed almost nothing below the UI-layout level, because two source documents that should exist (a TZ/requirements doc and a QA source) do not exist anywhere in this project. This register extracts **20 discrete decisions** from that gap: **4 P0** (block all development), **6 P1** (block database/backend), **7 P2** (block frontend), **3 P3** (deferrable). It also expands the three most consequential conflicts already flagged in Phase 15 — product/brand name, the six incompatible navigation shells, and the ambiguous Reports-phase scope — with full option sets, per instruction, without choosing between them.

Nothing in this document is a resolution. Every item ends in `Status: OPEN`.

---

## 1. DECISION REGISTER

### P0 — BLOCKS DEVELOPMENT

#### DECISION-00
**Problem:** No FINCORE TZ/requirements document exists anywhere in this project. The project directory was empty at the start of Phase 15.
**Source:** Phase 15 §0 (Source-of-Truth Statement).
**Conflict:** None (absence, not disagreement) — but its absence is why almost every other decision below cannot be resolved from Figma alone.
**Available Options:**
- **Option A:** Author a formal TZ now, using Phase 15's confirmed findings (10 business rules, screen inventory, role hints) as a starting skeleton, then fill gaps with product/stakeholder input.
- **Option B:** Locate an existing TZ that exists outside this project directory (e.g., in a wiki, shared drive, or with a stakeholder) and import it.
- **Option C:** Proceed without a formal TZ and make requirements decisions incrementally, screen-by-screen, as implementation reaches each one — accepting higher rework risk.
**Impact:** Every downstream registry in Phase 15 (API, Database, Roles, Business Rules beyond the 10 confirmed ones) is empty without this. This is the single largest lever in the whole project.
**Recommendation:** Option B first (cheap to check), falling back to Option A (Phase 15 already gives a usable skeleton). Option C is workable but should be a deliberate choice, not a default.
**Decision Required:** Product owner — does a TZ exist elsewhere, and if not, who authors one?
**Status: PARTIALLY RESOLVED (2026-08-20)** — a real original business source (Excel workbook) was found and fully analyzed. It is not a formal TZ, but it is a genuine primary business artifact and now serves as one. See "DECISION-00 UPDATE (2026-08-20)" at the end of this document for exactly what it does and does not resolve, and `docs/PROJECT_REQUIREMENTS.md` for the full extraction. Original entry above preserved unmodified as history.

#### DECISION-01
**Problem:** Six mutually incompatible navigation shells exist across the 15 screenshot-verified screens, using three different product/tenant names, two languages, and (newly confirmed while re-checking this register, see §4B note) at least two different color schemes.
**Source:** Phase 15 §2 (Headline Finding), §6.1, CONFLICT-01.
**Conflict:** Shell A ("FINCORE / Financial Platform," dark navy, Uzbek labels) vs. Shell B ("IT Live Academy / FINCORE Executive," dark navy) vs. Shell C ("FINCORE ERP / Financial Management," dark navy, English labels) vs. Shell D ("FINCORE Systems / Financial Control," dark navy, English labels) vs. Shell E ("FINCORE ERP / Moliyaviy nazorat," **light sidebar** — a color-scheme deviation, not just a label deviation) vs. Shell F (mobile, 4 nav items only).
**Available Options:**
- **Option A:** Pick one shell (e.g., Shell A, the most-used variant at 4 screens) as canonical and re-skin the other 9 verified + 38 unverified screens to match.
- **Option B:** Treat the variants as intentional — i.e., FINCORE is multi-tenant/role-based software where the shell legitimately changes per tenant (IT Live Academy) or per role (Executive vs. Cashier vs. Finance Manager) — and formalize *which* variant maps to *which* tenant/role, keeping several shells by design.
- **Option C:** Design a new seventh, unified shell from scratch, informed by all six, and discard all of them.
**Impact:** This blocks literally every screen — the app shell is the one piece of UI every route shares. Full analysis with screen-by-screen mapping in §4B below.
**Recommendation:** Determine first whether Option B's premise is even plausible (i.e., was "IT Live Academy" simply sample tenant data typed into a multi-tenant SaaS mockup, or a genuine second product?) — this single fact determines whether Option A or Option B is the right frame. Cannot be determined from Figma; needs a human who was involved in creating the file.
**Decision Required:** Product/Design — see full option analysis in §4B.
**Status: OPEN — new evidence added (2026-08-20).** "IT Live Academy" is now `CONFIRMED FROM ORIGINAL EXCEL` as the real, actual organization (not sample data) — see `docs/PROJECT_REQUIREMENTS.md` §1. This strengthens Shell B's credibility (it's the only shell whose tenant string is independently confirmed real) but does **not** resolve which shell/brand is canonical — the "FINCORE"/"FINCORE ERP"/"FINCORE Systems" product-name variants remain entirely unconfirmed, since the Excel never names the software at all. Decision remains OPEN; weight of evidence shifted, choice not made.

#### DECISION-02
**Problem:** Only one role is literally named anywhere in the file ("Viewer / Ko'ruvchi"). No formal role list or permission matrix exists.
**Source:** Phase 15 §6.1 (`3:410`), §11.5–§11.6, CONFLICT-02.
**Conflict:** The Budget editor's approval stepper (`1:2638`) shows "Moliya Menejeri" → "Boshqaruvchi Direktor" as process steps, which *could* be role names or could just be the display titles of the two people who happened to be logged in during that mockup.
**Available Options:**
- **Option A:** Treat every distinct actor implied anywhere in the file (Viewer, Moliya Menejeri, Boshqaruvchi Direktor, Administrator, Kassir) as a formal role, and build RBAC around exactly these five.
- **Option B:** Design a smaller, generic role set (e.g., Viewer / Editor / Approver / Admin) and map the Figma-implied actors onto it as job titles rather than system roles.
- **Option C:** Defer role modeling entirely until DECISION-00 (TZ) resolves, since role design without a TZ is guesswork.
**Impact:** Blocks the entire authorization layer — database schema (users/roles/permissions tables), API authorization middleware, and every "who can see this screen/button" decision in the frontend.
**Recommendation:** Option C is safest but slowest; if speed matters, Option B with the five Figma-implied actors as illustrative examples (not final) is a reasonable starting skeleton — full analysis in §4C.
**Decision Required:** Product — formal role list and permission matrix.
**Status: OPEN — new evidence added (2026-08-20).** The real current-state role list is now `CONFIRMED FROM ORIGINAL EXCEL`: exactly 3 roles (Moliya rahbari+kassir, Kassir, Direktor), each with a confirmed branch scope — see `docs/PROJECT_REQUIREMENTS.md` §7–9, §32. This gives Option B a concrete, evidence-backed floor instead of a purely Figma-inferred skeleton. It does **not** resolve whether Figma's additional "Viewer" and "Administrator" roles should be adopted — those remain unconfirmed against the real process. Decision remains OPEN; the choice of A/B/C is now better informed, not made.

#### DECISION-03
**Problem:** No target architecture (frontend framework, backend, hosting) is documented anywhere in this project.
**Source:** Phase 15 §11.2.
**Conflict:** None — pure absence.
**Available Options:**
- **Option A:** Choose a stack now, independent of the shell/role decisions, so scaffolding can begin in parallel.
- **Option B:** Defer stack choice until DECISION-00/01/02 land, since role/permission model and shell complexity could influence framework choice (e.g., multi-tenant theming needs from DECISION-01 Option B).
- **Option C:** Adopt a stack implied by nothing in Figma (Figma carries zero architecture signal either way) — i.e., this is a fully open technical decision with no design-derived constraint.
**Impact:** No line of application code can be written without this.
**Recommendation:** Can be decided in parallel with DECISION-00–02; it doesn't structurally depend on them, though the multi-tenant question in DECISION-01 Option B could matter for a multi-tenant-capable framework/DB choice.
**Decision Required:** Engineering/product — target architecture.
**Status: OPEN**

---

### P1 — REQUIRED BEFORE BACKEND/DATABASE

#### DECISION-06
**Problem:** The Reports Center (`1:5540`) advertises 8 report types as navigable cards; only 2 (Oylik hisobot, Breakeven) resolve to a confirmed dedicated screen in the 53-screen inventory.
**Source:** Phase 15 §6.1, §P (Missing Screen Report), CONFLICT-03.
**Conflict:** Unknown whether the other 6 (Filiallar taqqoslash, Yillik hisobot, Naqd oqim, Xarajatlar tahlili, Daromad tahlili, and a second "Reja–fakt" distinct from the Budget-phase Reja–Fakt screen at `1:3497`) open a shared generic report-viewer, or are simply un-designed.
**Available Options:**
- **Option A:** Assume a shared generic report-viewer template handles all 8 report types with different data bindings — minimizes screen count, but the template itself doesn't exist in Figma and would need to be designed.
- **Option B:** Treat the 6 missing report types as un-designed screens that need their own dedicated Figma work before backend contracts can be finalized for them.
- **Option C:** Descope the 6 missing report types from the current build entirely and ship only the 2 confirmed reports.
**Impact:** Directly determines the shape of the reporting API/DB queries — a generic template implies a flexible query-builder backend; 6 bespoke screens imply 6 bespoke endpoints/queries.
**Recommendation:** Confirm with design before committing either way — this is unresolvable from Figma alone.
**Decision Required:** Design/Product.
**Status: OPEN**

#### DECISION-07
**Problem:** The Approval queue (`1:4100`) shows a triggered "needs extra review" warning for high-value expenses, referencing a spend threshold, but the numeric threshold value is never displayed anywhere in the file.
**Source:** Phase 15 §6.1, §11.12 (Business Rule 5), §T (original DECISION-07).
**Conflict:** None — pure gap.
**Available Options:**
- **Option A:** Set a hardcoded platform-wide threshold value (needs a number from product).
- **Option B:** Make the threshold configurable per branch/tenant in Admin settings (ties to the Tizim sozlamalari screen, `1:8407`, not yet visually verified).
- **Option C:** Make it configurable per expense category rather than a single flat number.
**Impact:** Backend validation logic and the Admin settings schema both depend on this.
**Recommendation:** Option B is consistent with the file's confirmed multi-branch model, but the number itself and whether it's configurable at all needs a product answer.
**Decision Required:** Product/Finance stakeholder — exact threshold value and whether it's configurable.
**Status: OPEN**

#### DECISION-09
**Problem:** The entire database entity list in Phase 15 §11.11 (Users, Roles, Branches, Expenses, Expense Categories, Income/Payments, Students, Refunds, Budgets, Approvals, Closing Periods, Audit Log) is **INFERRED** from on-screen data groupings, not confirmed against any schema or TZ.
**Source:** Phase 15 §11.11, §H.
**Conflict:** None directly, but every inferred entity risks being wrong, incomplete, or wrongly related (e.g., is "Approval" its own entity or a status field on Expense/Budget?).
**Available Options:**
- **Option A:** Accept the inferred entity list as a first-draft ER model and refine it during backend design, accepting rework risk.
- **Option B:** Hold entity/schema design until DECISION-00 (TZ) and the remaining 38 unverified screens (DECISION-08) are resolved, to avoid designing against incomplete information.
**Impact:** Directly blocks Phase 16 (Database Architecture) — this is likely the single most load-bearing item for that phase.
**Recommendation:** Option B is lower-risk given how much of the file is still unverified.
**Decision Required:** Engineering — accept inferred entities as draft, or wait.
**Status: OPEN**

#### DECISION-10
**Problem:** Three state-machine gaps: (1) whether a closed month-end period can ever be reopened (an "Arxiv"/archive screen exists at `1:7374`, which could imply a reopen path, but the closing screen's own copy says the action "cannot be undone" — these two facts are in tension); (2) whether rejecting an approval requires a reason to be entered (a "Rad etish" button exists at `1:4100`, but what happens after clicking it is unverified); (3) whether the concurrent-single-session rule (QA-AUTH-03) is actually meant to be enforced, given the design's own QA tracker flags it "needs review" rather than "passed."
**Source:** Phase 15 §11.13, §6.1 (`1:6791`, `1:4100`, `2:2`).
**Conflict:** Item (1) is a direct internal tension between two screens in the same file (`1:6791` copy vs. existence of `1:7374`).
**Available Options (per sub-item):**
- Reopen: **A)** Never reopenable, "Arxiv" is read-only history. **B)** Reopenable only by a specific role (e.g., Admin) with a full audit trail. **C)** Reopenable only within a grace window (e.g., 24h) before being permanently locked.
- Rejection reason: **A)** Required free-text reason. **B)** Required reason from a fixed dropdown. **C)** Optional.
- Concurrent session: **A)** Enforce (kill first session on second login). **B)** Allow concurrent sessions, drop the rule. **C)** Allow but flag/notify.
**Impact:** All three affect core state machines that the database and API must encode; item (1) also affects the checksum/immutability guarantee in Business Rule 8 — a reopen path would need to define what happens to a previously-issued SHA-256 checksum.
**Recommendation:** None offered — these are genuine product policy calls, not technical ones.
**Decision Required:** Product/Finance policy owner.
**Status: OPEN**

#### DECISION-11
**Problem:** Design copy claims "Audit log faol" (audit log active) and "Audit yozuvlari o'zgartirilmaydi" (audit records immutable), and a closed period is claimed to carry a SHA-256 checksum — but no schema, retention policy, event taxonomy, or definition of *what exactly gets hashed* into the checksum is specified anywhere.
**Source:** Phase 15 §11.16, §6.1 (`1:7885`, `1:8592`).
**Conflict:** None — the *intent* is clearly and consistently stated in the design copy; the *mechanism* is entirely unspecified.
**Available Options:**
- **Option A:** Design a general-purpose audit log (event type, actor, timestamp, before/after payload) covering all mutating actions platform-wide.
- **Option B:** Design a narrow audit mechanism scoped only to month-end closing (matching the one place a checksum is actually shown), and decide separately later whether to generalize it.
**Impact:** Affects database schema size/shape and every write-path in the backend (Option A touches every mutation; Option B touches only the closing flow).
**Recommendation:** Option B first, matching what's actually evidenced, with Option A explicitly left open as a later expansion rather than assumed now.
**Decision Required:** Engineering/Product.
**Status: OPEN**

#### DECISION-08
**Problem:** The Phase 15 audit hit a Figma MCP Starter-plan rate limit after 15 of 53 screens; 38 screens have structural (name/layout-section) verification only, and 7 of the 8 QA Dashboard tabs (Authorization, Branch Security, Expense, Income, Budget, Approval, Reports — 124 of 128 claimed test cases) were never inspected.
**Source:** Phase 15 §1.3, §6.1, §U.
**Conflict:** None — a tooling constraint, not a design conflict.
**Available Options:**
- **Option A:** Upgrade the Figma MCP/account plan and complete the remaining 38-screen + 7-tab audit before finalizing database/API scope.
- **Option B:** Wait for the Starter-plan quota to reset naturally and resume later.
- **Option C:** Proceed to database/backend design now on the 15 verified screens + inventory-level knowledge of the other 38, accepting that unseen screens may surface new entities/fields/rules requiring rework.
**Impact:** Directly affects confidence in DECISION-09 (entity list) and the completeness of the Business Rule Registry (only 4 of a claimed 128 QA test cases have been read).
**Recommendation:** Option A or B before Phase 16 begins, specifically prioritizing: Foydalanuvchilar (Users/RBAC), Tizim sozlamalari (Settings — relevant to DECISION-07's configurability question), Audit log, and the 7 unread QA tabs.
**Decision Required:** User — how to proceed given the rate limit.
**Status: OPEN**

---

### P2 — REQUIRED BEFORE FRONTEND IMPLEMENTATION

#### DECISION-04
**Problem:** Phase 12 (Mobile PWA) has zero dedicated screens anywhere in the 53-screen file — no install prompt, offline state, manifest/icon spec, or push-notification screen.
**Source:** Phase 15 §4 (PWA Gap Register), §L.
**Conflict:** None — confirmed absence, not a disagreement.
**Available Options:**
- **Option A:** Scope Phase 12 from scratch as a fresh design+build effort, independent of the existing 53 screens.
- **Option B:** Treat the 14 existing "— Mobile" responsive screens as sufficient for a "mobile web" experience and explicitly descope true PWA behavior (install/offline/push) from this project.
- **Option C:** Descope Phase 12 entirely for now, revisit later.
**Impact:** Determines whether service worker, manifest, and offline-sync work is ever built, and whether the database needs offline-conflict-resolution design (e.g., sync tokens) — see DECISION-09 interaction.
**Recommendation:** None offered — full gap list in §4G.
**Decision Required:** Product — is Phase 12 in scope, and at what fidelity?
**Status: OPEN**

#### DECISION-05
**Problem:** The connected Figma MCP toolset has no capability to read prototype reactions/connections. Whether the Figma file itself contains any click-through prototype wiring is unknown.
**Source:** Phase 15 §5 (Prototype Gap Register), §9, §M.
**Conflict:** None — a tool capability gap, not a design conflict.
**Available Options:**
- **Option A:** A human opens the FINCORE file's Prototype tab in the Figma desktop/web app directly and reports what connections exist.
- **Option B:** Skip prototype verification entirely and have engineering define navigation/transition logic directly from a TZ (once DECISION-00 resolves) rather than from Figma.
**Impact:** Determines whether the 6 INFERRED candidate flows in Phase 15 §5 are real or need to be designed from scratch.
**Recommendation:** Option A is low-effort (one person, a few minutes) and should happen regardless of which path is chosen long-term — full list in §4H.
**Decision Required:** User — designate someone to check Figma directly.
**Status: OPEN**

#### DECISION-12
**Problem:** A notification bell icon with unread-count badges appears on multiple screens, confirming a notification *affordance* exists in the design, but no notification content, trigger conditions, or delivery channel (in-app/push/email/SMS) is specified anywhere.
**Source:** Phase 15 §11.15.
**Conflict:** None — pure gap.
**Available Options:**
- **Option A:** In-app notification center only (no push/email/SMS).
- **Option B:** In-app + push (PWA-dependent, ties to DECISION-04).
- **Option C:** In-app + SMS (plausible given the phone-number-based login model already confirmed) and/or email.
**Impact:** Affects both backend (notification service/queue) and frontend (notification center UI, which currently has no confirmed screen design).
**Recommendation:** None offered.
**Decision Required:** Product.
**Status: OPEN**

#### DECISION-14
**Problem:** Zero native Figma components exist; six community UI-kit libraries (Material 3, Simple Design System, iOS/iPadOS 26 & 27, watchOS 26, visionOS 26, macOS 26/27) are attached to the file but confirmed unused.
**Source:** Phase 15 §7, §8.
**Conflict:** None.
**Available Options:**
- **Option A:** Build a bespoke component library from scratch, using the recurring visual patterns catalogued in Phase 15 §8 (buttons, cards, badges, tables, nav, modals) as the reference.
- **Option B:** Adopt one of the six already-attached community libraries (most plausibly Material 3 or Simple Design System, given they're web/cross-platform-oriented vs. the three Apple-platform kits which don't fit a financial web app) and re-implement FINCORE's screens against it.
- **Option C:** Adopt an existing component library the engineering team already uses elsewhere (not evidenced in Figma at all — a pure engineering-side choice).
**Impact:** Determines the entire frontend build strategy and timeline for every screen.
**Recommendation:** None offered — this is a real design-direction choice, not something inferable from the file.
**Decision Required:** Design/Engineering.
**Status: OPEN**

#### DECISION-15
**Problem:** No color, typography, spacing, radius, border, or shadow tokens exist in the file (`get_variable_defs` returned empty; `search_design_system` returned empty for styles).
**Source:** Phase 15 §7, §N.
**Conflict:** None directly, though see the new color-scheme finding in §4F below (Shell E uses a light sidebar vs. dark navy everywhere else — an unexplained, unresolved deviation).
**Available Options:**
- **Option A:** Extract token values by inspecting each screenshot pixel-by-pixel / via further `get_design_context` calls once the MCP rate limit resets, and codify them as a token set.
- **Option B:** Design a fresh token set from scratch, informed by but not extracted from the existing screens.
**Impact:** Blocks any component library work (DECISION-14) from having concrete values to build with.
**Recommendation:** Option A once DECISION-08 (rate limit) is resolved — extracting real values is strictly better than guessing, since a working system already exists in the screenshots.
**Decision Required:** Design.
**Status: OPEN**

#### DECISION-16
**Problem:** The mobile bottom nav (Shell F) has only 4 items (Dashboard, Xarajatlar, Daromadlar, Profil) versus the desktop shell's 8. No "more" menu or overflow mechanism was observed in the one mobile shell screenshot captured.
**Source:** Phase 15 §6.1 (`1:307`), §O item 5.
**Conflict:** None directly — an unverified gap, not a disagreement.
**Available Options:**
- **Option A:** Design a "more" overflow menu for the missing 4 items (Budjet, Tasdiqlash, Hisobotlar, Oyni yopish, Administratsiya — 5 actually, if Administratsiya is included).
- **Option B:** Confirm the 4-item nav is intentional — i.e., those 4/5 modules are genuinely desktop-only by design (consistent with the Responsive Gap Register in §10 showing Admin, Reports-center, and several Budget/Approval screens have no mobile variant at all).
**Impact:** Affects mobile IA and whether additional mobile screens need to be designed.
**Recommendation:** Option B is plausible given the Responsive Gap Register already shows these modules skew desktop-only — but this is NOT VERIFIED, only pattern-consistent.
**Decision Required:** Design.
**Status: OPEN**

#### DECISION-17
**Problem:** No tablet-width (e.g., ~768px) frame exists anywhere among the 53 screens — confirmed by parsing all 53 canvas widths, which cluster only at 390px (mobile) and ~1280px (desktop).
**Source:** Phase 15 §10 (Responsive Audit).
**Conflict:** None — confirmed absence.
**Available Options:**
- **Option A:** Explicitly descope tablet as a supported breakpoint; desktop layout scales down or mobile layout scales up at the CSS level with no dedicated design.
- **Option B:** Commission tablet-specific designs before frontend work begins.
**Impact:** Affects frontend responsive-design effort and QA test matrix breadth.
**Recommendation:** None offered.
**Decision Required:** Product/Design.
**Status: OPEN**

---

### P3 — CAN BE DECIDED LATER

#### DECISION-18
**Problem:** The Administratsiya — Desktop screen (`1:7885`, Shell C) shows a "+ New Payment" button in its header — an Income-phase action that doesn't belong in an Admin context.
**Source:** Phase 15 §6.1, §O item 4.
**Conflict:** None — a likely copy/paste template defect, not a genuine disagreement.
**Available Options:**
- **Option A:** Remove the button from the Admin shell during the shell-unification work already required by DECISION-01.
- **Option B:** Leave as-is if a legitimate reason for it surfaces later (none currently evidenced).
**Impact:** Cosmetic/low severity — naturally resolved as a side effect of DECISION-01.
**Recommendation:** Fold into DECISION-01's shell-unification pass rather than tracking separately.
**Decision Required:** Design (low urgency).
**Status: OPEN**

#### DECISION-19
**Problem:** All route slugs in Phase 15 §11.4 (Route Map) are INFERRED naming suggestions, not confirmed against any routing convention.
**Source:** Phase 15 §11.4, §C.
**Conflict:** None.
**Available Options:**
- **Option A:** Adopt the Phase 15 INFERRED route map as-is.
- **Option B:** Design routes independently once DECISION-03 (architecture/framework) is chosen, since framework conventions (e.g., Next.js file-based routing vs. a custom router) may dictate naming differently.
**Impact:** Low — routes are cheap to rename later.
**Recommendation:** Defer to whoever owns DECISION-03.
**Decision Required:** Engineering (low urgency).
**Status: OPEN**

#### DECISION-20
**Problem:** The mapping of all 53 screens to the 14 requested phases (Phase 15 §6) relies on one stated assumption (ASSUMPTION-01): that the 6 y-band row groupings visible on the Figma canvas reflect the designer's actual phase intent. Figma has no native "phase" concept and no Sections were used to make this explicit.
**Source:** Phase 15 §S (Assumption Register).
**Conflict:** None — a single acknowledged assumption, not a disagreement.
**Available Options:**
- **Option A:** Accept the phase groupings as-is; if a screen turns out to be mis-phased, its content/name (which is accurately reported regardless) is what actually matters for implementation, not the phase label.
- **Option B:** Have a human re-verify phase groupings against a TZ or product roadmap once DECISION-00 resolves.
**Impact:** Low — organizational only, does not change what any individual screen contains.
**Recommendation:** Option A; revisit only if DECISION-00 surfaces a conflicting phase plan.
**Decision Required:** None urgent — informational.
**Status: OPEN**

---

## 2. FOCUSED CONFLICT ANALYSIS (as requested)

### A. PRODUCT / BRAND NAME

Exact appearances, pulled directly from Phase 15 §2 and §6.1 — nothing added:

| Variant | Exact string shown | Screens where confirmed | Node IDs |
|---|---|---|---|
| "FINCORE" alone / "FINCORE / Financial Platform" | Header logo + tagline | Desktop Shell, Mobile Shell, Xarajatlar ro'yxati, Tasdiq navbati, Kirish rad etildi, Kirish (login left panel shows plain "FINCORE" logo, no ERP/Systems suffix) | `1:2`, `1:307`, `1:1704`, `1:4100`, `3:410`, `1:202` |
| "IT Live Academy" (tenant name) + "FINCORE Executive" (product sub-brand) | Sidebar top block: tenant name large, "FINCORE Executive" small beneath | Executive Dashboard, Budjet tahriri | `1:855`, `1:2638` |
| "FINCORE ERP" + "Financial Management" | Header logo + tagline | Daromadlar ro'yxati, Administratsiya — Desktop | `1:2331`, `1:7885` |
| "FINCORE ERP" + "Moliyaviy nazorat" | Header logo + tagline (different tagline from the row above despite identical "FINCORE ERP" name) | Oyni yopish — Desktop | `1:6791` |
| "FINCORE Systems" + "Financial Control" | Header logo + tagline | Hisobotlar markazi, Breakeven tahlili | `1:5540`, `1:5368` |

**Note on nuance not previously surfaced in Phase 15:** "FINCORE ERP" appears twice with two *different* taglines ("Financial Management" on Income/Admin vs. "Moliyaviy nazorat" on Month-closing) — meaning there are arguably **5 distinct brand-string variants**, not the 4 originally listed, once taglines are counted separately from the base name.

**Alternatives (presented, not chosen):**
- **Alternative 1 — Single global brand "FINCORE."** Simplest for users and for engineering (one set of strings to localize/maintain). Requires discarding "ERP," "Systems," "Executive" as product-line qualifiers and "IT Live Academy" as anything other than sample/seed data.
- **Alternative 2 — "FINCORE" as platform brand, tenant name shown alongside it.** Consistent with a multi-tenant SaaS pattern (the way Slack shows "Workspace Name" next to "Slack"). "IT Live Academy" would then be legitimate sample data for *a* tenant, not a naming conflict — but this reframes "Executive," "ERP," "Systems" as needing explanation too, since they don't look like tenant names.
- **Alternative 3 — Distinct product tiers/modules under one brand** (e.g., "FINCORE Executive" = a dashboard-only view for leadership, "FINCORE ERP" = the full operational suite) — would explain *some* of the variance but not why the same tier ("FINCORE ERP") shows two different taglines.
- **Alternative 4 — The variance is simply unintentional inconsistency from non-linear/AI-assisted file assembly** (consistent with the leaked AI-annotation layer names already found in Phase 15 §2) with no product meaning at all.

**Impact of each:** Alternative 1 is cheapest to build and message; Alternative 2 has real product merit (multi-tenancy is already evidenced by branch-level data in the file) but needs a human to confirm it was intended, not retrofitted; Alternative 3 requires defining what "tiers" mean, which nothing in Figma supports; Alternative 4 means the file needs a straightforward cleanup pass with no deeper meaning to preserve.

**No name is chosen here.** See DECISION-01.

---

### B. NAVIGATION SHELL

| Shell ID | Product name shown | Navigation items | Differences from Shell A | Screens using it | Conflicts | Recommended canonical shell | Decision required |
|---|---|---|---|---|---|---|---|
| A | FINCORE / Financial Platform | Dashboard, Xarajatlar, Daromadlar, Budjet, Tasdiqlash, Hisobotlar, Oyni yopish, Administratsiya (+ Sozlamalar, Chiqish) | — (baseline) | Desktop Shell (`1:2`), Xarajatlar ro'yxati (`1:1704`), Tasdiq navbati (`1:4100`), Kirish rad etildi (`3:410`) | Baseline against which B–F are compared | *Not chosen here* | — |
| B | IT Live Academy / FINCORE Executive | Bosh sahifa, Operatsiyalar, Hisobotlar, Budjet, Tasdiqlashlar, Filiallar, Oyni yopish (+ Profil, Chiqish) | Different item names for equivalent concepts (Bosh sahifa≈Dashboard, Operatsiyalar≈Xarajatlar/Daromadlar merged); adds "Filiallar" (Branches) as a top-level item not present in A; drops "Administratsiya" and "Hisobotlar"→renamed | Executive Dashboard (`1:855`), Budjet tahriri (`1:2638`) | Different tenant/product name; different IA (7 vs. 8 items); no Administratsiya item at all | *Not chosen here* | — |
| C | FINCORE ERP / Financial Management | Dashboard, Income, Students, Refunds, Reports, Settings/Administratsiya, Support | English labels vs. A's Uzbek; adds "Students," "Refunds," "Support" as top-level (not present in A); no Xarajatlar/Budjet/Tasdiqlash/Oyni yopish items visible | Daromadlar ro'yxati (`1:2331`), Administratsiya (`1:7885`) | Language switch; missing Expenses/Budget/Approval/Closing from nav entirely; carries the stray "+ New Payment" button onto the Admin screen (§4F, §O item 4) | *Not chosen here* | — |
| D | FINCORE Systems / Financial Control | Dashboard, Expenses, Income, Budget, Approvals, Reports, Settings, Logout | English labels; closest item-count match to A (7 vs. 8) but still renames every label and drops Oyni yopish/Administratsiya entirely | Hisobotlar markazi (`1:5540`), Breakeven tahlili (`1:5368`) | Third distinct product name; missing Closing/Admin from nav | *Not chosen here* | — |
| E | FINCORE ERP / Moliyaviy nazorat | Boshqaruv paneli, Moliya, Yopilish jarayoni, Audit, Arxiv | Minimal 5-item nav, most reduced of all variants; **also uses a light-colored sidebar background, unlike the dark-navy sidebar in every other variant** — a color-scheme deviation not previously flagged as such in Phase 15 | Oyni yopish (`1:6791`) | Fourth tagline variant of "FINCORE ERP"; smallest nav surface; only variant with a different color scheme entirely | *Not chosen here* | — |
| F | (mobile, no product name shown in nav itself — header shows "FINCORE / [branch name]") | Dashboard, Xarajatlar, Daromadlar, Profil | Only 4 items (mobile bottom-bar constraint) — see DECISION-16 for whether this is intentional or missing an overflow menu | FINCORE Mobile Shell (`1:307`) | Fewer items than any desktop variant; unclear if reachable via overflow (NOT VERIFIED) | *Not chosen here* | — |

**Recommended canonical shell:** Deliberately left blank per instruction — do not silently choose one. See DECISION-01 for the options (adopt A as-is, formalize B–E as legitimate role/tenant-based shells, or design a new seventh unified shell).

---

### C. ROLE SYSTEM

| Role/persona | Classification | Evidence |
|---|---|---|
| Viewer (Ko'ruvchi) | **CONFIRMED** | Literal chip text "Joriy rol: Viewer (Ko'ruvchi)" on Kirish rad etildi (`3:410`); shown restricted from the Administratsiya nav item. |
| Moliya Menejeri (Finance Manager) | **INFERRED** | Named as a step label in the Budget approval stepper (`1:2638`), current-user-labeled "Siz" (you) at that step — could be a system role or just this mockup's logged-in user's job title. |
| Boshqaruvchi Direktor (Managing Director) | **INFERRED** | Second step in the same stepper (`1:2638`); same caveat as above. |
| Administrator | **INFERRED** | Administratsiya screen body copy states the module is "faqatgina tizim administratorlari uchun mo'ljallangan" (admin-only) — implies an Administrator actor exists, but the word "Administrator" is never shown as a role label anywhere (unlike "Viewer," which is shown explicitly). |
| Kassir (Cashier) | **INFERRED** | Purely from the screen *name* "Kassir paneli — Mobile" (`1:692`) — no role-gating, badge, or access-control evidence was observed on or around this screen. |
| Any other role (e.g., Accountant, Branch Manager, Auditor) | **NOT VERIFIED** | Nothing in the 15 screenshot-verified screens names or implies any further role. The 38 unverified screens (esp. Foydalanuvchilar/Users, `1:8064`) may contain more — unknown until DECISION-08 resolves. |

**Do not invent roles beyond this table.** See DECISION-02.

---

### D. PERMISSIONS

| Permission fact | Classification | Evidence |
|---|---|---|
| Viewer role cannot access the Administratsiya module | **CONFIRMED** | Kirish rad etildi (`3:410`) shows the Administratsiya nav item disabled/locked specifically while the "Viewer" role chip is displayed, with an explicit "access forbidden, admin-only" message. |
| Any other role→screen or role→action permission boundary | **NOT VERIFIED** | No other screen shows a role-gated restriction. The Administratsiya screen's own "Tezkor amallar" panel shows some actions greyed out (Sozlamalarni ko'rish, Audit logni ko'rish) versus others enabled (Foydalanuvchi/Kategoriya/Filial qo'shish) in the same screenshot (`1:7885`) — this is a genuine additional data point suggesting a finer-grained *action-level* permission model may exist even within the Admin role, but which role(s) see this exact enabled/disabled split is **NOT VERIFIED** (could be Viewer-vs-Admin, could be a different, unnamed permission tier, could simply be an unfinished mockup state). |
| Field-level or record-level permissions (e.g., branch-scoped data access) | **NOT VERIFIED** | The Admin screen's "Filial cheklovlari faol" (branch restrictions active) is a design-copy *claim*, not an observed behavior — no screen was seen demonstrating a branch-scoped restriction in action. |

**Do not build a permission model from this table alone.** See DECISION-02.

---

### E. BUSINESS RULES (the 10 confirmed rules, unchanged in meaning)

| Rule ID | Exact source | Rule | Affected module | Implementation impact | Status |
|---|---|---|---|---|---|
| BR-01 | QA-AUTH-01, QA Dashboard (`2:2`) | 5 wrong password attempts → account locked 15 minutes | Authentication | Requires attempt-counter + timed-lockout logic server-side | CONFIRMED (design-stated intent) |
| BR-02 | QA-AUTH-02, QA Dashboard (`2:2`) | 30 minutes inactivity → automatic logout | Authentication / Session management | Requires session TTL / idle-tracking middleware | CONFIRMED (design-stated intent) |
| BR-03 | QA-AUTH-03, QA Dashboard (`2:2`) | 2 devices, same account → first session should close | Authentication / Session management | Requires session-invalidation-on-new-login logic | CONFIRMED that the rule is *intended* — but the QA table itself flags this test "Tekshiruv kerak" (needs review), so it is explicitly **not confirmed as actually enforced**, even within the design's own tracking |
| BR-04 | QA-AUTH-04, QA Dashboard (`2:2`) | Direct URL access to a 2FA-gated route without completing 2FA → must return 403 Forbidden | Authentication / Authorization middleware | Requires server-side route guards checking 2FA-completion state, not just client-side routing | CONFIRMED (design-stated intent, status shown as "Bloklangan"/Blocked) |
| BR-05 | Approval queue, `1:4100` | High-value expense requests trigger an "E'tibor talab qiladi" (needs extra review) flag above an unstated threshold | Expenses / Approvals | Requires a configurable threshold value in validation/business logic — value itself is DECISION-07 | CONFIRMED existence of the rule; threshold value NOT VERIFIED |
| BR-06 | Budget editor, `1:2638` | Budget approval requires 2 sequential sign-offs: Finance Manager, then Managing Director | Budget / Approvals | Requires a multi-step approval workflow, not a single approve/reject action | CONFIRMED (design-stated intent); the two role names themselves are INFERRED, not confirmed as formal system roles (CONFLICT-02 / DECISION-02) |
| BR-07 | Month closing, `1:6791` | Closing a period is irreversible once executed, and is gated by a reconciliation checklist that can hard-block on unresolved items (e.g., "2 unreconciled transactions") | Monthly Closing | Requires a pre-close validation/checklist engine and a state transition with no built-in rollback | CONFIRMED (design-stated intent) — but see DECISION-10 for the unresolved tension with the "Arxiv" screen's implication of a reopen path |
| BR-08 | Closing success modal, `1:8592` | A closed period produces an immutable record identified by actor, timestamp, and a SHA-256 checksum | Monthly Closing / Audit | Requires checksum-generation logic and immutable storage design; *what exactly gets hashed* is unspecified (DECISION-11) | CONFIRMED (design-stated intent) |
| BR-09 | Breakeven analysis, `1:5368` | Margin of Safety = (Revenue − Breakeven Sum) / Revenue | Reports / Break-even | Direct calculation formula for the reporting/calculation engine — the only literal formula found anywhere in the file | CONFIRMED (literal, shown on-screen) |
| BR-10 | Expense list, `1:1704` | Expense status model has exactly 3 states: Tasdiqlandi (approved) / Tasdiq kutilmoqda (pending) / Rad etildi (rejected) | Expenses | Defines the minimum enum for the expense status field | CONFIRMED (literal, shown on-screen) |

No rule's meaning has been altered from Phase 15 §11.12.

---

### F. DESIGN SYSTEM

| Item | Classification | Detail |
|---|---|---|
| Missing native components | **CONFIRMED** | File-wide tag census: 0 `component`/`instance` nodes across 6,285 frames, 2,341 text nodes, 930 vectors. |
| Missing variables | **CONFIRMED** | `get_variable_defs` returned an empty object. |
| Missing styles | **CONFIRMED** | `search_design_system` returned empty for styles (and components, and variables) across all 6 attached community libraries. |
| Recurring visual patterns not backed by reusable definitions ("duplicate" patterns, more precisely: independently redrawn per screen) | **CONFIRMED** | Sidebar nav, KPI/stat cards, status badges, data tables, primary/secondary buttons, and modal overlays all recur visually across multiple screens but are each a bespoke frame — no shared source. |
| Inconsistent buttons (exact colors/radii/sizing) | **NOT ACCESSIBLE** | Pattern-level reuse failure is CONFIRMED (no shared component); whether the *rendered* buttons are pixel-inconsistent across screens was never measured — token/style extraction was exhausted by the MCP rate limit before this could be checked. |
| Inconsistent cards | **NOT ACCESSIBLE** | Same caveat as buttons — structurally unreused, but exact visual variance unmeasured. |
| Inconsistent badges | **PARTIALLY CONFIRMED, and notably better than expected** — the green/amber/red status-badge color convention was observed to be visually *consistent* between the two tables actually inspected (Expense list `1:1704` and QA Dashboard `2:2`), despite neither sharing a component definition. This is a genuine positive finding, not just a gap. | Confirmed only for these 2 of many possible badge instances; the remaining ~51 screens' badges are unmeasured. |
| Inconsistent navigation | **CONFIRMED** | This is §2/§4B in full — the most severe, most evidenced inconsistency in the file. |
| Typography inconsistencies | **NOT ACCESSIBLE** | No text styles registered at all; whether fonts/sizes vary screen-to-screen was never measured. |
| Color inconsistencies | **CONFIRMED (partially, newly surfaced in this register)** | Shell E (`1:6791`, Oyni yopish) uses a light-colored sidebar background, while Shells A–D (and the mobile shell) all use a dark-navy sidebar — a genuine confirmed color-scheme deviation, not merely a labeling difference. Beyond this one confirmed case, exact hex-level consistency across the other 14 screenshot-verified screens is NOT ACCESSIBLE (no tokens to compare against). |

See DECISION-14 and DECISION-15.

---

### G. PHASE 12 — MOBILE PWA: PWA DECISION/GAP LIST

Nothing designed here, per instruction. Exact gap list, restated from Phase 15 §4:

- [ ] Install prompt screen/flow — **NOT PRESENT IN FIGMA FILE**
- [ ] Offline banner / offline state per data-heavy screen (Dashboard, Reports, Expenses) — **NOT PRESENT IN FIGMA FILE**
- [ ] Update-available toast/flow — **NOT PRESENT IN FIGMA FILE**
- [ ] App manifest / icon set spec — **NOT PRESENT IN FIGMA FILE**
- [ ] Push notification permission/settings screen — **NOT PRESENT IN FIGMA FILE**
- [ ] Service worker / caching strategy — **NOT VERIFIED** (no source, Figma or TZ, can answer this)
- [ ] Whether the 14 existing "— Mobile" screens are meant as the PWA's actual screens, or PWA is a separate unscoped effort — **DECISION REQUIRED**, see DECISION-04

---

### H. PHASE 13 — PROTOTYPE: PROTOTYPE HUMAN VERIFICATION LIST

Nothing invented here. Exact list of what a human must check directly in Figma (Prototype tab), per instruction:

- [ ] Does Kirish (Login, `1:202`) have a confirmed prototype link to Executive Dashboard or Dashboard (`1:855`/other)?
- [ ] Does Kirish have a confirmed branch to SMS Tasdiqlash (`1:262`) for a 2FA path?
- [ ] Does Kirish have a confirmed branch to Hisob bloklandi (`1:166`) after failed attempts?
- [ ] Does Yangi xarajat (New expense, `1:1411`/`1:2020`) link back to Xarajatlar ro'yxati (`1:1704`) on submit?
- [ ] Does a Tasdiq navbati (Approval queue, `1:4100`) item link to Tasdiq tarixi (History, `1:4794`)?
- [ ] Does the Oyni yopish (Wizard, `1:7601`) → Yopishni tasdiqlash (Confirm, `1:7101`) → Muvaffaqiyatli yopildi (Success, `1:8592`) sequence have real prototype wiring, or is the adjacency purely coincidental canvas placement?
- [ ] Do any of the 6 shell variants (§4B) link to each other at all, or are they entirely disconnected sub-files glued into one page?
- [ ] Does the mobile shell's bottom nav (`1:307`) have a hidden/overflow "more" menu reachable via prototype interaction that wasn't visible in the static screenshot?

Every item above is currently **NOT ACCESSIBLE** through the connected Figma MCP tools and **NOT VERIFIED** as to whether it exists in the raw file. See DECISION-05.

---

## DEVELOPMENT BLOCKERS

Only decisions that must resolve before each stage — with the reason stated plainly.

### 1. Database Architecture (Phase 16) — blocked by:
- **DECISION-00** (TZ) — there is no requirements source to design a schema against.
- **DECISION-02** (roles/permissions) — the users/roles/permissions table structure cannot be designed without a role list.
- **DECISION-09** (entity confirmation) — the entire entity list is currently inferred, not confirmed; designing tables against unconfirmed entities risks a full schema rewrite.
- **DECISION-06** (report scope) — determines whether reporting needs dedicated tables/materialized views or a generic query layer.
- **DECISION-07** (threshold value/configurability) — determines whether a config/rules table is needed at all.
- **DECISION-10** (state machine gaps) — status enums and the closing/reopen state machine cannot be finalized with open questions.
- **DECISION-11** (audit schema) — the audit log table shape depends on scope (platform-wide vs. closing-only).
- **DECISION-08** (incomplete Figma verification) — 38 of 53 screens are unverified; they may reveal entities/fields not yet in the inferred list, directly risking schema rework if skipped.

### 2. Backend API — blocked by:
- **DECISION-00** (TZ) — no API contract exists in any form today.
- **DECISION-02** (roles/permissions) — authorization middleware cannot be built without a role/permission model.
- **DECISION-03** (architecture) — the framework/language choice itself.
- **DECISION-06, DECISION-07, DECISION-10, DECISION-11** — each defines specific business logic the API must enforce.
- **DECISION-01** (shell/brand) — determines what modules/endpoints even exist (e.g., does the API need to serve 6 different nav configurations, or 1?).

### 3. Frontend Implementation — blocked by:
- **DECISION-01** (shell/brand) — the app chrome is shared by every screen; cannot start building routed pages without it.
- **DECISION-03** (architecture) — framework choice.
- **DECISION-14** (component library sourcing) — build-from-scratch vs. adopt an existing kit changes the entire frontend workplan.
- **DECISION-15** (design tokens) — no component can be styled correctly without real color/spacing/type values.
- **DECISION-04** (PWA scope) — determines whether service worker/manifest work is in scope at all.
- **DECISION-16** (mobile nav parity) — determines mobile IA scope.
- **DECISION-17** (tablet breakpoint) — determines whether a third responsive layout must be designed and built.

---

## FINAL DECISION CHECKLIST

- [ ] Final product/brand name — DECISION-01 / §4A (5 variants found; none chosen)
- [ ] Canonical navigation shell — DECISION-01 / §4B (6 variants found; none chosen)
- [ ] Final role list — DECISION-02 / §4C (1 confirmed, 4 inferred; none finalized)
- [ ] Final permission model — DECISION-02 / §4D (1 confirmed boundary only)
- [ ] Confirmed business rules — §4E (10 confirmed, listed; none require re-decision, only implementation)
- [ ] Authentication rules — BR-01–BR-04, plus DECISION-10 sub-item on concurrent session enforcement (unresolved even in design's own QA tracker)
- [ ] Financial rules — BR-05, BR-06, BR-09, BR-10, plus DECISION-07 (threshold value)
- [ ] Approval rules — BR-05, BR-06, plus DECISION-10 sub-item on rejection-reason requirement
- [ ] Monthly closing rules — BR-07, BR-08, plus DECISION-10 sub-item on reopen path and DECISION-11 (audit/checksum scope)
- [ ] Break-even rules — BR-09 (formula confirmed; no open decision beyond implementation)
- [ ] PWA requirements — DECISION-04 / §4G (entirely undesigned; scope decision needed)
- [ ] Prototype flows — DECISION-05 / §4H (requires human verification directly in Figma)
- [ ] Design system direction — DECISION-14, DECISION-15 (build vs. adopt; token extraction)
- [ ] Other P0/P1 blockers — DECISION-00 (TZ), DECISION-03 (architecture), DECISION-08 (rate limit/incomplete audit), DECISION-09 (entity confirmation)

---

## DECISION-00 UPDATE (2026-08-20)

This section is an addition, not a rewrite — everything above this point is preserved exactly as originally written on 2026-08-19.

**What happened:** The user supplied a Google Sheets workbook (ID `1OWIABt9nsVXcwhVh9ZfUTOtHjDgaF-9K6mcVvvbm8so`) identified as the real, currently-used manual financial process that FINCORE is meant to digitize. It was downloaded read-only, all 12 worksheets were fully parsed and analyzed, and the results were written to `docs/PROJECT_REQUIREMENTS.md`. Nothing was invented; every extracted fact is traceable to a specific sheet/row.

**DECISION-00 is now PARTIALLY RESOLVED**, not fully resolved — the Excel is a genuine primary business source (arguably better than a typical TZ, since it's the *actual operating artifact* rather than a description of intent), but it only covers the expense-and-budget side of the business. It cannot speak to architecture, APIs, income/students, PWA, or prototype flows.

### Exactly what is now resolved by the original Excel source

- **8 of 8** explicitly-flagged critical business rules are now `CONFIRMED FROM ORIGINAL EXCEL` (branch-scoped cashier entry, director all-branch access, budget-vs-actual comparison, fixed/variable separation, branch comparison, combined+individual report views, budget history preservation, no-overwrite-old-months rule). Previously these existed only as Figma-inferred or QA-table-implied signals.
- **DECISION-02's factual floor**: 3 real roles, real branch scoping, real responsibilities — no longer purely Figma-inferred (§4C of this register, and `PROJECT_REQUIREMENTS.md` §7–9, §32). The decision itself (final role list, whether to add Viewer/Administrator) is still open — see below.
- **DECISION-09 (entity confirmation)**: 10 core entities and their relationships are now `CONFIRMED FROM ORIGINAL EXCEL` rather than inferred from Figma UI groupings alone (`PROJECT_REQUIREMENTS.md` §30–31). This directly de-risks the item DEVELOPMENT BLOCKERS §1 flagged as the most load-bearing gap for Phase 16.
- **DECISION-01's evidence weight shifted** (not resolved): "IT Live Academy" is now confirmed as the real organization, strengthening Shell B's real-world grounding relative to the other 5 shells — but no product/software name is confirmed, and the shell itself is still not chosen.
- A concrete transaction-volume baseline (~500 records/year, ~40–45/month across 2 branches) is now available for capacity/pagination planning — previously not available from Figma at all.

### 4 new conflicts surfaced (not previously visible from Figma alone)

- **CONFLICT-E1**: Excel confirms exactly 2 branches; Figma shows 4+ branch names. Relates to but is distinct from anything in the original CONFLICT-01/02/03.
- **CONFLICT-E2**: Excel's payment-method list (6, no "Uzum Bank") vs. Figma's Income screen showing "Uzum Bank."
- **CONFLICT-E3**: Excel's 3-role reality vs. Figma's implied 5-role model (adds Viewer, Administrator).
- **CONFLICT-E4 (most significant)**: Excel shows **no per-expense approval workflow exists in the real process today** — cashiers enter expenses directly, no pending/approved/rejected gate anywhere. Figma proposes a full 3-state approval workflow with a review queue and threshold escalation. This directly bears on DECISION-01, DECISION-02, DECISION-06, and DECISION-10 — it raises the question of whether Figma's approval/closing elaborateness reflects real, newly-desired business process, or design over-scoping relative to what IT Live Academy actually does. **This question is not answered here — it is surfaced for a human decision**, and is added as a new consideration under DECISION-02 and DECISION-10 rather than a standalone new decision, since it modifies the *content* of those existing open decisions rather than introducing an independent blocker.

Full detail on both the confirmations and the 4 conflicts: `docs/PROJECT_REQUIREMENTS.md` §29 (confirmed rules), §36 (conflicts), and the Excel-to-Figma Traceability Matrix in that same document.

### What still cannot be determined — unrelated decisions were NOT auto-resolved

DECISION-03 (architecture), DECISION-04 (PWA scope), DECISION-05 (prototype), DECISION-06 (report screen scope), DECISION-07 (threshold value), DECISION-08 (rate-limit re-audit), DECISION-11 through DECISION-20 are **all untouched by this update** — an expense/budget spreadsheet has no bearing on any of them, and none were resolved as a side effect of this work.

### Revised blocker picture

Database Architecture (Phase 16) is measurably closer to ready than before this update — DECISION-09's entity list is now source-backed rather than inferred — but is **still not ready**: DECISION-00 is only partially resolved (no income/student/refund data exists in any source yet), DECISION-02's final role list is still open, and DECISION-06/07/10/11 remain fully open. Phase 16 has not been started, per instruction.

---

*End of Phase 15.1, updated 2026-08-20. No conflict was resolved. No requirement was invented. Items marked OPEN above remain OPEN; only their supporting evidence changed.*
