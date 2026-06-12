
## Goal

Make stage creation possible directly from the Gantt outline (today there is no way to add a stage from the planner UI). Mirror the Merlin pattern: right-click a row → Insert → Above / Below / Child / Milestone, plus a "+ Add stage" button in the toolbar for the empty/end case.

## Scope

- Quote planner only (project planner unchanged in this pass — same mechanism can be reused later).
- No schema changes. Uses existing `quote_stages` table and `useUpsertQuoteStage`.

## UX

1. **Toolbar "+ Add stage" button** in `QuoteGantt` header — appends a new top-level architecture stage at the end. Visible always, and the primary path when the list is empty.
2. **Right-click on any outline row** opens a context menu (shadcn `ContextMenu`):
   - **Insert ▸**
     - Stage above (same parent, same role, sort_order before target)
     - Stage below (same parent, same role, sort_order after target)
     - Child stage (parent = target, role demoted: architecture→supplier_group, supplier_group→supplier_phase; disabled if target is already supplier_phase)
     - Milestone (zero-duration stage below; flagged via `is_milestone` if column exists, else just 1-day)
   - **Delete stage** (existing `adapter.deleteStage`)
3. New row enters **inline rename mode immediately** (reuse existing `EditableName` editing state) with default name like "New stage" so user just types and presses Enter.
4. Inserted stage inherits dates from neighbour (above → copy target's start as both start/end+1d; below → start = target.end+1d, end = +5d; child → copy parent span).

## Technical

- **`gantt-outline-column.tsx`**: wrap each row in `<ContextMenu>` from `@/components/ui/context-menu`. Add new props:
  - `onInsertStage?: (anchorId: string, where: "above" | "below" | "child" | "milestone") => Promise<void> | void`
  - `onDeleteStage?: (id: string) => Promise<void> | void`
  - Gray out "Child" when role === "supplier_phase".
- **`gantt-chart.tsx`**: thread the two new callbacks through to `GanttOutlineColumn` (pure plumbing, no logic).
- **`quote-gantt.tsx`**:
  - Add `handleInsert(anchorId, where)` that:
    1. Reads target stage + its siblings (same `parent_stage_id` and `stage_role`).
    2. Computes new `sort_order` by splicing: above → targetSort - 5; below → targetSort + 5; child → max(child sort)+10 or 10. Then renumbers siblings in increments of 10 in a follow-up pass if collisions arise (rare).
    3. Computes new `parent_stage_id` and `stage_role` based on `where`.
    4. Computes dates per rule above.
    5. Calls `upsertStage.mutateAsync({ quote_id, name: t("crm:quotePlanner.newStage"), start_date, end_date, parent_stage_id, stage_role, sort_order })`.
    6. After insert, sets `selectedStageId` to the new id so the inspector reflects it.
  - Add `handleDelete(id)` wrapping `adapter.deleteStage`.
  - Add toolbar "+ Add stage" button → calls `handleInsert(lastTopLevelId ?? null, "below")` or first-row case.
- **i18n**: add keys in `en/crm.json` + `pt-PT/crm.json`:
  - `quotePlanner.addStage`, `quotePlanner.newStage`
  - `quotePlanner.insert.above|below|child|milestone|menu|delete`

## Out of scope

- Drag-to-reorder rows (renumbering via clicking WBS digit already exists).
- Promote/demote (indent/outdent) — can be added later by clicking WBS lead segments or via menu if requested.
- Project (pm_*) planner: same wiring can be applied next, but this plan keeps the change to the quote planner where the user is working.

Net change: ~150 LOC across 4 files, no DB/migration work.
