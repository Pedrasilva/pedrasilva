# Quote ↔ Project Unification

Four workstreams, sequenced. Each is independently shippable.

## 1. Universalize the Mastercard dashboard

All project dashboards (existing and future) inherit the layout we built for Mastercard.

Already in `src/routes/_app.projects.$projectId.tsx`, scoped project-wide:
- Tabs: Overview, Insights, **A&P**, Schedule, Allocations, Tasks (no Planning, Billing, Financial, Materials)
- Insights: Services = `total_internal_fee` (Architecture only), Suppliers = `total_external_fee`; no External services card, no Expenses card
- A&P tab hosts `ProjectForecastCard` + `BudgetControlPanel` (architecture-only filter via `is_self !== false`)
- Milestones table: hierarchical (parent stages as section headers, children indented, rollup totals, hierarchical numbering)
- Planned hours fallback: budget ÷ avg sale rate when no allocations
- Schedule tab renders `QuotePlanningTab` when `sourceQuoteId` exists (single Gantt source of truth)

Action: nothing to migrate — these changes already apply to every project rendered through this route. Verify no other route (`_app.projects.gantt.tsx`, `_app.projects.financials.tsx`, etc.) re-exposes the hidden tabs; remove stale entry points from nav configs if found.

## 2. Quote ↔ Project conversion audit

Deliverable: `/mnt/documents/quote-project-parity-audit.md` covering every quote table and where each field lands (or doesn't) in the project.

Audit pairs:

```text
quote_stages              → pm_stages
quote_stage_dependencies  → pm_stage_dependencies
quote_allocations         → pm_allocations
quote_external_services   → pm_stage_supplier_costs / pm_suppliers
quote_payment_schedule_items → pm_payment_schedule_items
quote_stage_supplier_costs → pm_stage_supplier_costs
fee_proposals (header)    → pm_projects + pm_project_commercial_baselines
```

For each: column-by-column mapping, conversion code location, gaps, drift risk. Output as markdown artifact for review.

## 3. Fix known conversion gaps

Driven by audit findings, but baseline known issues:
- `parent_stage_id` for retainer + monthly + standard stages (partially fixed; verify all branches in `src/routes/_app.crm.quotes.$quoteId.tsx` conversion mutation)
- `is_self` flag propagation (internal vs supplier)
- `stage_kind`, `billing_model`, retainer fields (`retainer_anchor_month`, `retainer_months`, `retainer_capacity_hours_per_month`)
- `sort_order` consistency
- `children_bill_independently` flag
- Supplier external services → `pm_suppliers` + `pm_stage_supplier_costs` rows linked back to the right parent stage
- Payment schedule items including invoice status, trigger metadata, billing dates

## 4. Live sync (quote → project mirror)

Auto-sync direction: **quote is source of truth**, project mirrors. Edits to quote propagate; project remains read-mostly for synced fields.

Implementation:
- DB triggers on `quote_stages`, `quote_stage_dependencies`, `quote_allocations`, `quote_external_services`, `quote_payment_schedule_items`: when row changes AND a `pm_projects` row references the parent quote via `source_quote_id`, upsert/delete the mirrored `pm_*` row.
- Mirror by stable key: store `source_quote_stage_id` (already partly present) on `pm_stages`; same for allocations, dependencies, externals, payment items. Add columns where missing.
- Sync metadata: `pm_projects.last_synced_at`, `pm_projects.sync_status` (`live` | `paused` | `diverged`).
- UI sync indicator: badge in project header — "Live-synced from quote · last sync HH:mm" with a "Pause sync" button (sets status to `paused`, disables trigger via row flag).
- Variance shown only when user has manually edited a mirrored row while sync is paused.

## 5. Unify planner UI components

`QuoteGantt` and `ProjectGantt` already share `GanttChart` via the planner adapter pattern (`useQuotePlannerAdapter` / project equivalent). Extend the same pattern to:
- Financial summary (one component, two adapters)
- Hierarchical milestones table (extract from `_app.projects.$projectId.tsx` into shared `<HierarchicalStagesTable>`, used in both quote financial summary and project A&P)
- Insights tiles (shared `<ContractTotalsStrip>`)

Goal: any UI improvement made in one module automatically benefits the other.

## Sequencing

1. Write audit (`/mnt/documents/quote-project-parity-audit.md`) — read-only investigation, produces the gap list.
2. Apply migration to add missing `source_quote_*_id` mirror columns + sync metadata columns.
3. Add DB triggers for live sync.
4. Wire conversion code to populate mirror keys for new conversions; backfill existing projects.
5. Add sync-status badge component in project header.
6. Refactor hierarchical milestones table + financial summary into shared components.

## Technical notes (for reference)

- Existing column `pm_stages.source_quote_stage_id` may already exist — audit confirms.
- Triggers must be SECURITY DEFINER + careful with recursion (mirror writes must not re-trigger).
- Conversion code lives in `src/routes/_app.crm.quotes.$quoteId.tsx` (mutation) and `src/lib/project-bootstrap/` (newer bootstrap path).
- Backfill done via one-off migration script matching by `(name, sort_order, parent path)` similar to the parent_stage_id backfill we ran last turn.

## Out of scope (deferred)

- Freezing the quote at conversion (per user: revisit once stable)
- Project-side edits propagating back to quote
- Multi-project from one quote (one-to-many sync)
