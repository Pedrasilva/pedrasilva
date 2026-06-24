## Problem

The CRM (quotes) Gantt and the project Gantt are not actually the same component yet — they only share the leaf `GanttChart`. The CRM uses the richer `PlannerGantt` wrapper (`src/components/planner/planner-gantt.tsx`, exported as `QuoteGantt`) which adds:

- Toolbar: Add stage, Indent, Outdent, Reflow, Project-start date shifter
- Zoom modes: Week / Month / Quarter / Year / Fit (auto-fit container width)
- Outline collapse state (sessionStorage) + per-stage resources collapse
- `onReorderStage` (inline WBS edit)
- Inspector drawer + team pool toggle in one layout
- Synthetic "Project" summary row

The project route renders `GanttChart` directly with its own inline insert/delete handlers and a smaller `dayWidth` toolbar — so new features added to the CRM Gantt don't propagate.

## Plan

Make `PlannerGantt` mode-agnostic and reuse it in both routes.

### 1. `src/components/planner/planner-gantt.tsx` → make it dual-mode

- Add `mode: "quote" | "project"` and require either `quoteId` or `projectId`.
- Branch data sources by mode:
  - quote → existing hooks (`useQuoteStages`, `useQuoteAllocations`, `useQuotePlannerAdapter`, `useQuotePlanningPool`, `useQuotePaymentSchedule`)
  - project → `useProjectDetail`, `useResources`, `useProjectPlannerAdapter`, `useProjectInvoices`, `useStageBudgetControl`
- Replace the local quote-only `mappedStages/hierarchy` builder with a thin selector that calls `buildProjectGanttTree` in project mode and keeps the existing supplier-aware builder in quote mode.
- Branch mutations (insert/delete/rename/indent/outdent/reorder) onto `useCreateStage`/`useUpdateStage`/`useDeleteStage` in project mode. The handlers are otherwise identical.
- Honour the admin gate in project mode: hide Indent/Outdent/Reflow/Add/Insert/Delete affordances when `!isAdmin` (read-only adapter already blocks the writes).
- Hide quote-only chrome in project mode: project-start shifter (project has its own date), retainer phase button, payment-schedule-derived milestones (use `useProjectInvoices` instead).
- Inspector: render `ProjectPlannerInspector` in project mode, `QuotePlannerInspector` in quote mode.
- Pool: project mode uses `useResources()`; quote mode keeps `useQuotePlanningPool()`.

### 2. `src/routes/_app.projects.$projectId.tsx`

- Replace the inline `<GanttChart .../>` block in the Schedule tab with `<PlannerGantt mode="project" projectId={project.id} showCancelled={showCancelled} />`.
- Drop now-unused state: `dayWidth`, `collapsedOutline`, inline insert/delete handlers, the local `mappedStages/hierarchy` memo, ganttMilestones memo, and the `dayWidth` toolbar.
- Keep: tab switcher, header, status workflow, financial cards, ProjectPlannerInspector (now owned by PlannerGantt — remove from route).
- `selectedStageId` moves into PlannerGantt (already lives there for quote mode).

### 3. `src/routes/_app.projects.gantt.tsx` (all-projects Gantt)

- Out of scope for this pass: it's a cross-project view, not a single-project planner. Leave as-is.

### 4. Verification

- `bun run build` + visit a project → schedule tab → expect identical toolbar + inspector behaviour as `/crm/quotes/:id` planning tab.
- Confirm admin-only gating still hides edit affordances for non-admins.
- Spot-check WBS hierarchy, payment milestone diamonds (invoices), and zoom modes.

### Technical notes

- `buildProjectGanttTree` already produces the same `{ mappedStages, hierarchy }` shape PlannerGantt's `GanttChart` consumes, so the project branch is mostly wiring.
- `PlannerAdapter` already abstracts the mutation contract, so `GanttChart` itself needs no changes.
- Quote-mode behaviour is preserved by gating every quote-only block (`if (mode === "quote") {...}`).

## Out of scope

- All-projects `/projects/gantt` cross-project view.
- New features inside `GanttChart` itself — this is a wiring/unification change only.
