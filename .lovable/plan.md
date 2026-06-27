## Goal

Replace supplier "parent stages" in the Gantt with **supplier cost lines attached directly to architecture stages**. The client billing schedule then groups, per architecture milestone, the architecture fee + all supplier costs that fire on the same trigger — producing one merged invoice per milestone (matching the Mastercard PSA PDF).

## New data model

New table `quote_stage_supplier_costs` (one row per supplier × stage):

```text
id                uuid
quote_id          uuid
stage_id          uuid                 -- the ARCHITECTURE stage this cost lives under
supplier_id       uuid     nullable    -- pm_suppliers FK
supplier_label    text     nullable    -- free text when no supplier record yet
description       text     nullable    -- "Engenharia de estruturas — Concept"
amount            numeric              -- supplier cost (what the client pays us for this)
billing_trigger   text                 -- 'stage_start' | 'stage_end' | 'monthly' | 'custom_date'
custom_date       date     nullable
payment_terms     text     nullable    -- when we pay the supplier (outflow leg)
payment_offset_d  int      nullable    -- days after inflow before we pay supplier
sort_order        int
```

Mirror table on the PM side: `pm_stage_supplier_costs`. Both get RLS scoped to the parent project/quote (mirroring `quote_external_services` / `pm_materials` patterns).

`quote_external_services` stays for non-supplier external buys (printing, models, etc.); the new table is specifically for outsourced consultants billed under an architecture milestone.

## Gantt changes

- Drop supplier-role parent stages from the editable Gantt. New stage creation no longer offers "Supplier group / Supplier phase".
- Each architecture stage row gains a small affordance: badge `▦ 3 suppliers · €X` opening an inline editor (list of supplier cost lines for that stage).
- WBS / outline no longer shows supplier subtrees.
- Stage budget rollup simplifies: parent = sum of children architecture fees + sum of supplier cost lines on the stage and its descendants.

## Client billing schedule (the merged-invoice fix)

`generateByStageBilling` is rewritten to emit, per architecture stage trigger, **one invoice with multiple lines**:

```text
Invoice — Concept end (2026-06-30)
  Architecture · Concept .......... €10,000
  Mais Engenharia · Concept ....... €7,650
  Nulty · Concept .................   €X
  Total ........................... €X
```

Implementation: the inflow generator iterates stages, collects `{ trigger, date }` for the architecture fee, then appends all supplier-cost rows on that stage that share the same trigger. Multiple-line invoices are represented as schedule items sharing a new `invoice_group_id` (uuid generated per trigger). `PaymentScheduleProposalView` groups by `invoice_group_id` and renders one card per invoice with N lines.

Monthly-billed stages still split per calendar month; supplier cost lines with `billing_trigger='monthly'` ride along proportionally.

## Supplier outflows (unchanged grouping)

Outflow generator emits one row per supplier cost line, dated `inflow_date + payment_offset_days`. The proposal view keeps the per-supplier tables already in place.

## Migration of existing supplier parent stages

One-time SQL migration:

1. For each quote, find supplier-role parent stages (`stage_role in ('supplier_group','supplier_phase')`).
2. For each child of a supplier parent, try to match an architecture stage by **name** (case-insensitive, trimmed) within the same quote. If matched, insert a `quote_stage_supplier_costs` row: `stage_id = architecture stage`, `supplier_label = supplier parent name`, `amount = effectiveBillingAmount(child)`, `billing_trigger = stage_end` (default).
3. Unmatched children: insert with `stage_id = null` and flag for manual reassignment (UI surfaces "Unassigned supplier costs" list at the top of the quote).
4. After migration, soft-delete supplier parent stages (set `archived_at`) — keep rows for audit but exclude from queries.

Same migration runs for `pm_stages` mirrors.

## UI work

1. **New component** `StageSupplierCostsEditor` (inline list under each architecture stage in the planner inspector + Gantt row popover).
2. **PaymentScheduleProposalView** — group items by `invoice_group_id`; each invoice card shows lines + total + due date + payment terms.
3. **Quote planner inspector** — remove "stage role = supplier" UI; remove "Payment trigger / children bill independently" toggle (now obsolete).
4. **Unassigned supplier costs panel** — surfaces post-migration items needing a target stage.

## Out of scope (queued separately)

- Inline expense table redesign (already queued).
- Change-order workflow.
- Retroactive cleanup of historical payment schedule rows for archived supplier stages (handled by re-running "Update from Gantt").

## Risk / call-outs

- Schedule items currently keyed by `stage_id`. Adding `invoice_group_id` is additive; legacy rows without it render as standalone invoices.
- Name-matching during migration is fuzzy. The Mastercard quote uses consistent stage names across Architecture / Mais Eng / Nulty so it should match cleanly; I'll dry-run the match and show you the mapping before committing.
- Anything currently allocated to a supplier-role stage (timesheets, etc.) would be orphaned. A quick query before migrating will confirm there are none (suppliers have no allocations by design, so this should be zero — but worth verifying).

## Execution order

1. Migration: new tables + grants + RLS + soft-archive column on stages.
2. Dry-run match report for Mastercard quote (shown to you).
3. Data migration of supplier parent stages → cost lines.
4. Generator + schedule view updates.
5. Gantt + inspector UI updates.
6. Verify against Mastercard PSA PDF.
