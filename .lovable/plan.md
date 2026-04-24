# Phase A — Quote-Owned Planning: Database Foundation

**Scope:** Schema only. No UI, no Gantt changes, no conversion logic, no proposal document. Purely additive — existing `fee_proposals`, `pm_*`, `crm_*` data is preserved untouched.

---

## 1. New ENUM types

To mirror the `pm_*` patterns and keep type safety strict (vs. text + check constraints), create:

- `quote_dep_type` → `'FS' | 'SS' | 'FF' | 'SF'` (mirrors `pm_dep_type`)
- `quote_external_service_status` → `'draft' | 'pending' | 'invoiced' | 'paid' | 'cancelled'` (mirrors `pm_external_service_status`)
- `quote_markup_type` → `'percent' | 'fixed'` (mirrors `pm_markup_type`)
- `quote_payment_trigger` → `'project_start' | 'stage_start' | 'stage_end' | 'manual_date' | 'monthly'`
- `quote_payment_amount_type` → `'fixed' | 'percent'`

Rationale: Reuse Postgres enum machinery already in place; UI selects map cleanly; prevents bad values without runtime triggers.

---

## 2. New tables

### `quote_stages`
Mirrors `pm_stages`, owned by `fee_proposals`.
```
id              uuid PK default gen_random_uuid()
quote_id        uuid NOT NULL REFERENCES fee_proposals(id) ON DELETE CASCADE
name            text NOT NULL
description     text
start_date      date NOT NULL
end_date        date NOT NULL
sort_order      int  NOT NULL default 0
color           text NOT NULL default '#22c55e'
budget          numeric NOT NULL default 0   -- planned fee value for stage
external_id     text
created_at / updated_at
CHECK (end_date >= start_date)
```
Index: `(quote_id, sort_order)`.

### `quote_stage_dependencies`
Mirrors `pm_stage_dependencies`. Adds `quote_id` for fast scoping + safer cycle checks.
```
id                    uuid PK
quote_id              uuid NOT NULL REFERENCES fee_proposals(id) ON DELETE CASCADE
predecessor_stage_id  uuid NOT NULL REFERENCES quote_stages(id) ON DELETE CASCADE
successor_stage_id    uuid NOT NULL REFERENCES quote_stages(id) ON DELETE CASCADE
type                  quote_dep_type NOT NULL default 'FS'
lag_days              int NOT NULL default 0
created_at / updated_at
UNIQUE (predecessor_stage_id, successor_stage_id)
CHECK (predecessor_stage_id <> successor_stage_id)
```
**Trigger:** `quote_check_stage_dependency_cycle()` — clone of `pm_check_stage_dependency_cycle()` but scoped to `quote_stage_dependencies`. Prevents cycles within a quote's DAG.

### `quote_allocations`
Mirrors `pm_allocations` with rate snapshots so historical revisions stay correct.
```
id                  uuid PK
quote_id            uuid NOT NULL REFERENCES fee_proposals(id) ON DELETE CASCADE
stage_id            uuid NOT NULL REFERENCES quote_stages(id) ON DELETE CASCADE
resource_id         uuid NOT NULL REFERENCES pm_resources(id) ON DELETE RESTRICT
start_date          date NOT NULL
end_date            date NOT NULL
hours_per_day       numeric NOT NULL default 8
allocation_percentage numeric  -- nullable; 0..100 if used
cost_rate_snapshot  numeric NOT NULL default 0   -- € / hour at quote time
sale_rate_snapshot  numeric NOT NULL default 0
notes               text
created_at / updated_at
CHECK (end_date >= start_date)
CHECK (allocation_percentage IS NULL OR (allocation_percentage >= 0 AND allocation_percentage <= 100))
CHECK (hours_per_day >= 0 AND hours_per_day <= 24)
```
Reuses `pm_resources` directly — no duplicate resource directory. `effective*Rate` helpers in `use-default-rates.ts` will be used at allocation creation time to populate the snapshots.

### `quote_external_services`
Mirrors `pm_materials` behaviour for consultants/subcontracts on a quote.
```
id              uuid PK
quote_id        uuid NOT NULL REFERENCES fee_proposals(id) ON DELETE CASCADE
stage_id        uuid REFERENCES quote_stages(id) ON DELETE SET NULL
supplier_id     uuid REFERENCES pm_suppliers(id) ON DELETE SET NULL
description     text NOT NULL
quantity        numeric NOT NULL default 1
unit_cost       numeric NOT NULL default 0
purchase_price  numeric NOT NULL default 0   -- kept for parity w/ pm_materials trigger
markup_type     quote_markup_type NOT NULL default 'percent'
markup_value    numeric NOT NULL default 0
sale_price      numeric NOT NULL default 0
sale_price_manual boolean NOT NULL default false
status          quote_external_service_status NOT NULL default 'draft'
notes           text
created_at / updated_at
```
**Trigger:** `quote_materials_compute_sale_price()` — exact clone of `pm_materials_compute_sale_price()`. Same maths, same edge cases — keeps the two systems behaving identically.

### `quote_payment_schedule_items`
Planned (forecast) payments. Not invoices.
```
id                      uuid PK
quote_id                uuid NOT NULL REFERENCES fee_proposals(id) ON DELETE CASCADE
stage_id                uuid REFERENCES quote_stages(id) ON DELETE SET NULL
label                   text NOT NULL
trigger_type            quote_payment_trigger NOT NULL
amount_type             quote_payment_amount_type NOT NULL
amount_value            numeric NOT NULL default 0
expected_invoice_date   date
expected_payment_date   date
sort_order              int NOT NULL default 0
notes                   text
created_at / updated_at
CHECK (amount_value >= 0)
CHECK (
  (trigger_type IN ('stage_start','stage_end') AND stage_id IS NOT NULL)
  OR trigger_type NOT IN ('stage_start','stage_end')
)
CHECK (
  (trigger_type = 'manual_date' AND expected_invoice_date IS NOT NULL)
  OR trigger_type <> 'manual_date'
)
```

---

## 3. Column additions to existing tables

### `fee_proposals` (additive only — no data risk)
```
construction_cost     numeric                       -- nullable
fee_percentage        numeric                       -- nullable, 0..100 (CHECK)
pricing_multiplier    numeric NOT NULL default 1
revision_number       int     NOT NULL default 1
parent_quote_id       uuid REFERENCES fee_proposals(id) ON DELETE SET NULL
proposal_description  text
quote_mode_ready      boolean NOT NULL default false
```
`CHECK (fee_percentage IS NULL OR (fee_percentage >= 0 AND fee_percentage <= 100))`
`CHECK (pricing_multiplier > 0)`

### `crm_opportunities`
```
project_brief  text     -- long-form description distinct from existing notas
```

---

## 4. RLS — mirrors existing `pm_*` pattern

For every new table:
- `ENABLE ROW LEVEL SECURITY`
- Policy `Authenticated read` → `SELECT` `USING (true)` for `authenticated`
- Policy `Admins insert` → `INSERT` `WITH CHECK (has_role(auth.uid(), 'admin'))`
- Policy `Admins update` → `UPDATE` `USING (has_role(auth.uid(), 'admin'))`
- Policy `Admins delete` → `DELETE` `USING (has_role(auth.uid(), 'admin'))`

Identical surface to `pm_stages`, `pm_allocations`, etc. — no new permission concepts introduced.

---

## 5. Triggers (reused logic, cloned to quote_*)

| Trigger | Source | Purpose |
|---|---|---|
| `update_updated_at_column` | existing fn | Touch `updated_at` on UPDATE for all 5 new tables |
| `quote_check_stage_dependency_cycle` | clone of `pm_check_stage_dependency_cycle` | Prevent dependency cycles per quote |
| `quote_materials_compute_sale_price` | clone of `pm_materials_compute_sale_price` | Auto-compute `sale_price` from cost × markup unless `sale_price_manual` |

No triggers added to `auth/storage/realtime/vault` schemas.

---

## 6. Migration plan (single migration file)

One migration file: `<timestamp>_quote_planning_foundation.sql`, ordered:
1. Create enums (5)
2. Create `quote_stages`
3. Create `quote_stage_dependencies` (+ cycle trigger)
4. Create `quote_allocations`
5. Create `quote_external_services` (+ sale price trigger)
6. Create `quote_payment_schedule_items`
7. Add columns to `fee_proposals` and `crm_opportunities`
8. Enable RLS + add policies for all new tables
9. Add `updated_at` triggers
10. Indexes: `(quote_id, sort_order)`, `(quote_id)`, `(stage_id)`, `(resource_id)`

---

## 7. TypeScript impact

- `src/integrations/supabase/types.ts` regenerates automatically after migration — no manual edit.
- Add a small types file `src/lib/quotes/types.ts` exporting:
  - `QuoteStage`, `QuoteAllocation`, `QuoteExternalService`, `QuoteStageDependency`, `QuotePaymentScheduleItem` derived from generated types
  - Enum aliases (`QuotePaymentTrigger`, etc.)
  - Display constants for triggers/amount_types (label maps)

**No hooks added in Phase A.** Hooks land in Phase B alongside the Gantt mode change. This keeps Phase A strictly schema-shaped.

---

## 8. What is NOT in this phase (deferred)

- ❌ Gantt UI changes / mode prop
- ❌ React hooks (`useQuoteStages`, `useQuoteAllocations`, …)
- ❌ Conversion routine `quote_* → pm_*`
- ❌ Fee reference widget (% of construction cost)
- ❌ Proposal document UI / template
- ❌ Cash flow forecast wiring

---

## 9. Risks & follow-ups

| Risk | Mitigation |
|---|---|
| Rate snapshot drift if `pm_resources` deleted | `ON DELETE RESTRICT` on `quote_allocations.resource_id` blocks the delete; admins must reassign first |
| Cycle trigger performance on large quotes | Same recursive CTE pattern as `pm_*` — proven OK; stages per quote << project scale |
| Existing `fee_proposals.valor` vs new `construction_cost`/`fee_percentage` | Both kept; `valor` remains the headline fee total. Phase B will introduce a derived total from stages + externals when `quote_mode_ready = true` |
| `pm_projects` already has `quote_id` (audited) | Good — conversion in Phase D can populate it without schema change |
| `pm_suppliers` reuse | Confirmed table exists with admin-only writes; no new supplier directory needed |

---

## Deliverable on approval

1. **One migration file** with all enums, tables, columns, triggers, RLS, indexes
2. **One small types file** `src/lib/quotes/types.ts` re-exporting generated row types + enum label maps
3. Report-back with the exact list of objects created and any linter warnings

Nothing else. UI work waits for Phase B sign-off.
