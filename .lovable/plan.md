## Hierarchical Gantt for quotes

Goal: on the quote Gantt, render supplier groups as parent rows with their phases indented underneath, and have supplier phases follow the architecture stage they shadow (move architecture → supplier phase moves with it).

### 1. Data flow (no schema changes — columns already exist)

Already on `quote_stages`: `parent_stage_id`, `stage_role` (`architecture` | `supplier_group` | `supplier_phase`), `supplier_company_id`, plus an existing dependency table `quote_stage_dependencies` we can reuse for SS=0 links.

`useQuoteStages` already returns all rows. Extend the row type pass-through in `QuoteGantt` so `parent_stage_id`, `stage_role`, `supplier_company_id` reach the chart.

### 2. Shared GanttChart (`src/components/projects/gantt-chart.tsx`)

Minimum invasive additions — no drag/drop math changes:

- Extend `StageWithProject` consumer to read optional `parent_stage_id`, `stage_role`, `supplier_company_id`.
- Build an ordered list: architecture stages in `sort_order`, then for each architecture stage append its linked supplier phases (children whose `linked_stage_id`/dependency points to it), grouped by supplier with a supplier-group header row.
- Render three row variants:
  - `architecture` — current full row (unchanged).
  - `supplier_group` — slim header row (28 px), shows supplier name + total fee badge + span bracket across its children. Non-draggable.
  - `supplier_phase` — compact row (44 px) with 24 px left indent, smaller bar, no allocations sub-rows.
- A small chevron on supplier groups to collapse/expand children (local UI state only).

### 3. Cascade (move architecture → move supplier phase)

Reuse `useUpdateStageWithCascade`. When an architecture stage is moved/resized, after persisting, fetch any `supplier_phase` stages whose `quote_stage_dependencies` row references it as predecessor with `dep_type='SS'` and `lag_days=0`, and apply the same start delta (preserve duration). Same path for resize when only end changes.

### 4. Editing supplier groups

New small panel in `quote-planning-tab.tsx` ("Consultants"):
- Add consultant → pick supplier company → creates a `supplier_group` row.
- Inside the group: pick architecture stages to shadow → creates `supplier_phase` rows with `parent_stage_id = group`, plus a SS=0 dependency to the architecture stage. Dates initialised from the architecture stage.
- Remove / rename actions.

No fee math here — payment amounts continue to come from the existing `generateArchitectureWithConsultants` generator on the payment-schedule tab.

### 5. Rollout

- Existing flat quotes keep working: rows without `parent_stage_id` render as architecture (current behaviour).
- Feature is additive — no migration needed in this step.
- i18n keys added to EN + PT in the same edit.

### Technical notes

- Sort key for ordered rendering: `(architectureSortOrder, supplierGroupName, phaseSortOrder)`.
- Indent purely visual — bar X / W still computed from real dates.
- Collapse state: `Map<groupId, boolean>` in `QuoteGantt` local state.
- Cascade trigger lives in the planner adapter's `updateStage`, behind a quote-only branch so project mode is unchanged.

### Out of scope for this turn

- Per-supplier % split override UI (separate next step).
- Cashflow insight card on project page (separate next step).
- Reorder by drag across the hierarchy.