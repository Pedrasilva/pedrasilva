# One Planner Gantt — unify CRM + Project module

## Current state

The low-level chart (`src/components/projects/gantt-chart.tsx`, ~1.8k lines) is **already shared** — both the project page and `QuoteGantt` render it via the `PlannerAdapter` contract. What differs is the **wrapper around it**:

- **CRM quotes** use `QuoteGantt` — rich wrapper with inspector drawer (edit stage details, deps, allocations), outline column with rename/insert/delete, payment-milestone overlay, team-pool sidebar, zoom presets (Week/Month/Quarter/Year/Fit), reflow button.
- **Project page** calls `GanttChart` directly with a thin toolbar (zoom in/out only) and a separate "show cancelled" toggle. No inspector — stage edits happen through other tabs/components.
- **Projects > Gantt overview** (multi-project page) calls `GanttChart` directly in compact mode.

So we already have one **engine**; we have two **wrappers**. Promoting the richer wrapper to be the single one is what delivers "edit once, updates everywhere" for the planner surface that users actually interact with.

## Plan

### 1. Extract a `PlannerGantt` component
Move `src/components/quotes/quote-gantt.tsx` → `src/components/planner/planner-gantt.tsx` and make it mode-agnostic by accepting the data hooks as props instead of hard-wiring quote_* hooks.

New prop shape:
```ts
interface PlannerGanttProps {
  scopeId: string;            // quoteId or projectId
  adapter: PlannerAdapter;    // already mode-aware
  stages: Stage[];            // fetched by the parent
  allocations: Allocation[];
  resources: Resource[];
  poolResources: Resource[];  // selectable drag pool
  rateMissing?: Set<string>;
  milestones?: PaymentMilestone[]; // optional payment overlay
  onAddRetainerPhase?: () => void;
  onReflow?: () => Promise<void>;  // optional — hidden when absent
  InspectorComponent: React.ComponentType<{ scopeId: string; stageId: string; onClose: () => void }>;
  // ... stage CRUD callbacks (rename/insert/delete/reorder) routed through adapter
}
```

### 2. Build a project-mode inspector
Create `src/components/projects/project-planner-inspector.tsx` mirroring `QuotePlannerInspector` but reading/writing `pm_stages` + `pm_allocations` + `pm_stage_dependencies`. Reuses existing project hooks (`useUpdateStageWithCascade`, `useStageDependencies`, allocation editor, etc.). Includes a **Cancel stage** action (the deferred item from the previous turn — natural home for it).

### 3. Wire both routes through PlannerGantt
- `src/components/quotes/quote-planning-tab.tsx` — switch to `PlannerGantt` with `QuotePlannerInspector` + quote hooks. Behaviour unchanged.
- `src/routes/_app.projects.$projectId.tsx` — replace the inline `<GanttChart …>` block in the Gantt tab with `<PlannerGantt …>` using `ProjectPlannerInspector` + project hooks. Drops the bespoke zoom toolbar in favour of the unified Week/Month/Quarter/Year/Fit presets and gains the inspector drawer + payment milestones overlay (driven by `pm_invoices`).
- `src/routes/_app.projects.gantt.tsx` (multi-project) — keep using `GanttChart` directly (compact, read-only-ish overview). No change.

### 4. Delete the duplicated wrapper
- Delete `src/components/quotes/quote-gantt.tsx` (its body becomes `planner-gantt.tsx`).
- Keep `GanttChart` as the rendering engine — it stays the shared core.

## Visible UI changes on the project page

- Same Gantt visuals, **plus**:
  - Click any stage bar → right-side inspector drawer (matches CRM behaviour).
  - Outline column shows WBS numbering + rename/insert/delete inline.
  - Toolbar gets Week/Month/Quarter/Year/Fit zoom presets (instead of bare +/−).
  - Payment milestones from `pm_invoices` render as diamonds on the timeline (read-only).
- The current "show cancelled stages" toggle and existing tabs are preserved.

## Project-only feature flags stay intact

`PROJECT_FEATURES` (baseline ghost, leave-overlap badges, overload ring, tentative/committed toggle, cross-project drag, holiday shading) continue to drive `GanttChart` rendering through the adapter — none of that is lost.

## Risks

- Project Gantt page gets a visibly different toolbar + an inspector drawer. If you prefer to keep the current toolbar layout and only adopt the inspector, say so and I will scope step 3 narrower.
- The project-mode inspector is net-new code (~300–400 lines). It reuses existing project hooks, so logic is thin, but it needs the same per-field edit affordances the quote inspector has.

## Out of scope (next turns)

- Auto-regenerating `pm_invoices` when PM stages move (still pending from earlier).
- Promoting `_app.projects.gantt.tsx` (multi-project read-only view) to the full PlannerGantt — only worthwhile if you want inspectors there too.
