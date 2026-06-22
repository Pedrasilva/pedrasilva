# Quote ↔ Project model: contract baseline + live delivery

## Principles

- **Quote is editable until conversion.** No freeze on Approve. Edits in CRM update `quote_stages` / `quote_allocations` / `quote_payment_schedule_items` as today.
- **At "Convert to project"** (one-shot handoff):
  - Snapshot the quote as the **contract baseline** (immutable, for reference only).
  - Copy stages / allocations / dependencies / payment schedule into `pm_*` as the **live plan** (this already happens — we keep it).
  - Lock the CRM quote Gantt to read-only after conversion; all editing moves to the project module.
- **After conversion**, the **project Gantt is the single source of truth**. Any change to stage dates, scope, additions, or cancellations in PM **automatically updates the payment schedule** (re-runs the existing generators against current `pm_stages`).
- **Contract reference**: a small read-only panel inside the project (and on the quote header) shows what was originally agreed — stage list, dates, amounts, total — sourced from the baseline snapshot. Purely informational, no diff workflow yet.
- **Change orders**: deferred. Not built now.
- **Cancelled stages**: hidden everywhere by default (Gantt, payment schedule, financials), with an "Show cancelled" toggle for audit.

## What changes

### 1. Contract baseline snapshot (new)

Two new tables capturing the state at conversion time:

- `pm_project_contract_baseline` — header: project_id (FK + unique), quote_id, snapshot_at, currency, total_fee, total_expenses, notes.
- `pm_project_contract_baseline_stages` — line items: baseline_id, name, start_date, end_date, fee, billing_model, sort_order, parent_name. Plain rows, no FK to live `pm_stages` (so renaming/deleting a live stage doesn't break the reference).
- `pm_project_contract_baseline_payments` — original planned invoices: baseline_id, label, trigger_type, expected_invoice_date, amount, stage_name.

Written once, in the existing convert-to-project transaction in `_app.crm.quotes.$quoteId.tsx`. Never updated afterwards.

### 2. Lock the quote after conversion

In `quote-gantt.tsx`, `quote-planner-inspector.tsx`, and the payment schedule UI: when `quote.pm_project_id` is set, render in read-only mode with a banner "Converted to project · open project plan →". The mutation hooks already exist; we just gate the UI.

### 3. Live payment schedule on the project

Today `pm_invoices` are generated at conversion and then drift. Change:
- Add a "Regenerate from plan" action on the project's payments tab (calls the same generator logic used on the quote, but against `pm_stages`).
- Auto-trigger that regeneration whenever a stage's dates / fee / billing_model change in PM, **for items not yet invoiced** (preserve `manual_override` and rows where `status != 'draft'`).
- Items already invoiced/paid stay frozen.

Generator already exists in `src/lib/quotes/payment-generators.ts` — we wrap it for `pm_stages` input.

### 4. Contract reference panel

A new collapsible card on the project page header: "Contractual baseline" → shows snapshot date, original total, original end date, stage table, original payment dates. Pure read.

On the CRM quote (post-conversion), the same data is what's now displayed — the quote itself is the baseline.

### 5. Hide cancelled stages

`pm_stages` already has a `status` field. Add value `cancelled` if missing.
- Gantt, allocations table, payment generators, financial rollups: filter out `status = 'cancelled'` by default.
- Add a "Show cancelled" toggle in the Gantt toolbar (off by default).
- Cancelled stage's draft payment items are removed from the schedule; invoiced ones stay (with a "stage cancelled" marker).

## Technical notes

- New migration: 3 baseline tables + GRANTs + RLS (project members read; service_role write).
- Snapshot writer: extend the existing convert handler in `_app.crm.quotes.$quoteId.tsx` (~line 198).
- Payment regen on PM edits: hook into `useUpdateStageWithCascade` `onSuccess` to re-run the generator for that project (debounced, draft-only).
- Quote read-only gate: add `isLocked = !!quote.pm_project_id` and thread through `quote-planner-inspector`, `quote-gantt`, payment schedule editor.
- Cancelled filter: central helper `filterActiveStages(stages, { includeCancelled })` used in the project planner adapter and rollup queries.

## Out of scope (for now)

- Change-order workflow / amendment log.
- Diff view (contract vs live).
- Quote versioning post-conversion.
- Re-opening a converted quote.

## Open question

For payment regeneration after a PM stage slips: should the **invoice date** slip with the stage end date automatically, or stay on the original contractual date until someone explicitly regenerates? My recommendation: **auto-slip draft items only**, leave issued/paid alone. Confirm before I build.