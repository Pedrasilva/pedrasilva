# Finance multi-entity, Stage 2: separation and switcher

Builds on Stage 1 (32 tables carry `entity_id`, all rows = PSA). Done in the order below; each step is checked before the next. CRM, HR, projects and the shared clients/suppliers tables are not touched.

## One decision to confirm first

Four of the 32 tables are also used outside finance:
- `benefit_expenses` — staff submit their own benefit claims (HR).
- `pm_invoices`, `pm_payment_schedule_items` — project managers read/write them on project pages.
- `pm_suppliers` — used by project costs.

If every policy on these required entity membership, staff and project managers who are not finance members would lose their own claims and project invoices. Proposed rule: on these four tables the entity check is added to the **finance-access branches** of each policy (what finance users and admins see), while the existing **owner / project-team branches** stay as they are (a person still sees their own claim; a project manager still sees their project's invoices — those rows are always PSA today). All other 28 tables get the entity check on every policy, no exceptions. If you prefer the strict version on all 32 (which would break those HR and project screens for non-members), say so before approving.

## 1. Access per entity
- New `finance_entity_members (entity_id, user_id, created_at)`, unique pair, RLS: members read their own rows, admins manage.
- `has_entity_access(_entity uuid)` — SECURITY DEFINER, true for admins or members.
- `current_finance_entity` stored per user in a small `finance_entity_preferences (user_id, entity_id)` table.
- Seed: every user who passes today's finance access check (admin, `finance.dashboard` legacy or v2) becomes a PSA member.

## 2. Row-level security
- 32 entity tables: every SELECT/INSERT/UPDATE/DELETE (and ALL) policy rewritten as `existing condition AND has_entity_access(entity_id)` (USING and WITH CHECK), with the exception above.
- Child tables check the parent's entity through a SECURITY DEFINER helper: `financial_document_lines`, `financial_document_payments` (document), `bank_transaction_classifications` (transaction), `financial_expense_payments` (expense item), `financial_debt_payments` (debt), `benefit_expense_ocr_extractions`, `benefit_expense_events` (benefit expense).
- SECURITY DEFINER finance RPCs (reconciliation, settle, recebimentos, backfills, reports such as `bank_calculated_balances`, `finance_inconsistency_report`) get an explicit entity parameter or entity check so they cannot bypass the separation.

## 3. Uniqueness per entity
- `financial_classifications.code` → `(entity_id, code)`; `financial_periods (year, month)` → `(entity_id, year, month)`; `cost_categories.slug` → `(entity_id, slug)`.
- `pm_invoice_settings` and `finance_intake_settings`: one row per entity (unique `entity_id`); reads filter by entity.
- Every other unique constraint on the 32 tables is reviewed and listed in the report as changed or kept global (e.g. bank IBAN, file SHA-256 of the same email message stay global).

## 4. Entity switcher
- `useFinanceEntity()` hook + provider in the finance layout: loads the entities the user can access and their remembered choice (default PSA).
- Selector in the finance header bar, shown only with access to more than one entity. Switching clears finance caches.
- Every finance query (intake, review, documents, bank, classifications, payables, recebimentos, reports, cash flow, dashboard snapshot, duplicates, Drive archive) adds `.eq("entity_id", current)` and includes the entity in its cache key; server functions take the entity and verify access. Admins see the selector too (they reach every entity), but each screen still shows one entity only.

## 5. Every write sets entity_id
- All browser inserts/upserts, server functions, `/api/public` hooks (Gmail intake, Drive intake, CRM is excluded), DB functions and triggers that create finance rows set `entity_id` explicitly. Email/Drive intake writes PSA. Triggers creating finance rows from benefit expenses or project invoices copy the parent's entity.
- Then a migration drops the PSA default on all 32 tables. The rows the app creates in HR/project screens (benefit claims, project invoices, schedule items, suppliers) set PSA explicitly — a one-line addition at each insert, no other change to those screens.

## 6. Leak test
- Create Pedra Rioja (NIF 513789898), no members; insert one test document and one test bank line.
- DB checks as a non-admin finance user (simulated JWT in a rolled-back transaction): (a) PSA-scoped reads, report RPCs and cash-flow sources return no Pedra Rioja rows; (b) direct select of the two rows returns nothing; (c) after adding membership and switching preference, they appear and PSA rows are excluded from entity-filtered queries.
- Browser check of the switcher and PSA screens with the signed-in account.
- Delete the two test rows (and the temporary membership); keep the entity.

## Technical details
- Migrations, committed to `supabase/migrations`: `finance_entities_stage2_access` (members, helper, prefs, seed), `..._rls` (policies + child helpers), `..._unique` (constraints), `..._no_default` (last, after code is updated).
- Rule recorded in `src/lib/finance/AGENTS.md` (replacing the Stage 1 line).

## Report
Policies changed per table, constraints changed/kept, every write path updated, leak-test results, migration files.
