## Goal

Make the two existing stage types behaviorally and visually distinct in the Gantt + Inspector:

- **Architecture stage** — unchanged. Resources can be allocated; bar shows as today.
- **Supplier stage** (covers existing `supplier_group` and `supplier_phase` roles) — no resource allocation UI at all; just a task name + cost. Visually different bar with the stage cost printed inside.

## Scope

### 1. Inspector (`src/components/quotes/quote-planner-inspector.tsx` and project equivalent)

When the selected stage's `stage_role` is `supplier_group` or `supplier_phase`:
- Hide the **Resources / Allocations** section entirely (picker, hours/day, % allocation, rate snapshots, "Add resource" button).
- Hide labor-cost derived readouts ("Calculated price from resources", labor cost line).
- Keep: name, dates, dependencies, supplier picker (self / company / placeholder), budget (single cost field, mode locked to "Fixed cost"), payment trigger toggle, notes.
- Replace the budget label "Budget" with "Supplier cost" for supplier stages.

When `stage_role = architecture`: no change.

### 2. Gantt bar rendering (`src/components/planner/planner-gantt.tsx` + any bar subcomponent)

Add a visual variant for supplier stages:
- Different fill: hatched / striped background using a CSS pattern, with a muted accent color (distinct from the architecture bar's solid color).
- Different border treatment (dashed) so it reads as "external work".
- Render the stage's rolled-up cost (formatted via `euros()`) **inside the bar**, centered, when the bar is wide enough; fall back to a tooltip / right-side label when too narrow.
- Architecture bars keep their current appearance (no cost shown inside — only on hover/inspector).
- Summary/parent rows: if every descendant is a supplier role, render with the supplier styling; mixed parents keep the architecture summary style.

### 3. WBS outline column

- Add a small badge / icon next to supplier rows ("Supplier" chip, lucide `Truck` or `Building2` icon) so the list view also distinguishes them at a glance.

### 4. Guard rails

- When a stage is switched from architecture → supplier in the inspector, prompt: "This will remove N existing resource allocations. Continue?" then delete via `useDeleteQuoteAllocation` (and `pm_allocations` equivalent for projects).
- When switched supplier → architecture, allocations area simply reappears empty.
- New stages created under a supplier parent already default to supplier role (existing logic in planner-gantt lines 660-695) — keep as is.

### 5. i18n

Add EN + PT keys in the same edit:
- `workspace.planning.supplierCost` / `Custo do fornecedor`
- `workspace.planning.supplierStageBadge` / `Fornecedor`
- `workspace.planning.switchToSupplierConfirm` (with allocation count)

## Out of scope

- No DB schema changes — `stage_role` column already exists and supports the three values.
- Payment trigger logic, supplier auto-inheritance, dependency defaults — all already shipped.
- Project module Gantt mirrors the quote Gantt via the shared `PlannerGantt`, so changes apply to both modules automatically. Project inspector (`project-planner-inspector.tsx`) gets the same hide-resources treatment.

## Technical notes

- Bar variant: extend the existing bar component with a `variant: "architecture" | "supplier"` prop derived from `stage_role`. Pattern fill via inline SVG `<pattern>` or a Tailwind `bg-[image:repeating-linear-gradient(...)]` utility tied to a CSS token in `styles.css` so it themes correctly.
- Cost-inside-bar: compute display width in px from existing day-width math (`gantt-utils.ts`); only render text when bar width ≥ ~64px.
- Reuse `rollupQuote` / `build-project-gantt-tree` budget rollups already in place for the displayed cost.
