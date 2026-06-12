
# Merlin-style Gantt — Plan

## Goal
Turn the current flat row list into a real project-planning Gantt while keeping today's allocation/resource logic intact. Used by both quote planner and project planner; in project mode the supplier hierarchy is hidden so resource planning stays focused on architecture stages.

## Capabilities in this iteration
1. **Outline tree column** — collapsible parents, real indentation, WBS numbering (1, 1.1, 1.1.1), expand/collapse toggles, persisted per-session.
2. **Summary/rollup bars** — parent rows show a slim summary bar that spans min(child.start) → max(child.end), auto-recomputed when children move. Non-draggable.
3. **Dependency arrows** — render FS / SS / FF / SF links between bars with lag annotation; route around rows; arrowhead at successor. Read-only edits in this iteration (creation/edit stays in the existing dependency UI — out of scope to add edge-drag now to keep risk down).
4. **Keep existing behaviour** — drag-to-move and edge-resize on leaf stages, allocation sub-rows, resource pool drag-in, cost overlays, holiday shading, milestones, today line, baselines, cascade on architecture moves.

## Architecture

### New shared building blocks (`src/components/projects/gantt/`)
- `useGanttTree.ts` — pure function that turns `StageWithProject[]` + role/parent metadata into a tree `{ node, depth, wbs, children, collapsed }[]`. Mode flag `'quote' | 'project'`:
  - `quote` → architecture > supplier_group > supplier_phase
  - `project` → architecture only (supplier rows filtered out)
- `OutlineColumn.tsx` — sticky left column: chevron toggle, WBS code, name, dates. Width resizable, min 280 / max 520.
- `SummaryBar.tsx` — slim bracket-style bar for parent rows; derived from descendants.
- `DependencyArrows.tsx` — SVG overlay sibling to the bars layer; consumes the same `origin`/`dayWidth`/row-y map; supports FS/SS/FF/SF with lag label.

### Refactor of `gantt-chart.tsx`
- Replace the current flat `stages.map` with a `flattenVisible(tree)` driven by collapse state.
- Row renderer branches on `node.role`:
  - leaf architecture/supplier_phase → existing bar + allocations
  - parent (has visible children, or role=supplier_group, or architecture with children) → SummaryBar, no allocation sub-rows
- Row Y positions tracked in a `Map<stageId, {top, height}>` so the arrow overlay can resolve endpoints.
- Add `mode: 'quote' | 'project'` prop (default 'project'); plumbed from `QuoteGantt` (sets 'quote') and project Gantt callers (default 'project').
- Cascade & resize logic unchanged.

### Quote-side cleanup
- `quote-gantt.tsx`: remove the `▸` / `└─` name-prefix hack and the manual ordering — the new `useGanttTree('quote')` does this from real fields (`stage_role`, `parent_stage_id`, `sort_order`).
- Pass `mode="quote"` to `GanttChart`.

### Project-side
- Pass `mode="project"` (default). Filter discards `supplier_group`/`supplier_phase` so planners only see architecture rows for weekly allocation — matching the user's requirement.

## Data
No schema changes. Reads existing:
- `quote_stages` / `pm_stages`: `stage_role`, `parent_stage_id`, `sort_order`
- `quote_stage_dependencies` / `pm_stage_dependencies`: `predecessor_stage_id`, `successor_stage_id`, `type`, `lag_days`

## i18n (EN + PT-PT, same edit)
- `gantt.outline.expandAll` / `collapseAll`
- `gantt.outline.wbsHeader` ("#" / "Nº")
- `gantt.summary.rollup`
- `gantt.dep.fs/ss/ff/sf` + `gantt.dep.lagDays`

## Out of scope (next iterations)
- Creating dependencies by dragging from a bar edge (Merlin-style edge-link)
- Critical path highlighting
- Baseline variance ghost
- Drag-reorder across hierarchy / indent-outdent toolbar
- Resource leveling

## Risk & rollout
- Shared component touched — guard with `mode` prop so project Gantt's existing visuals are unaffected except for the new outline column and summary rollups (which are additive).
- Allocations, milestones, cascade, holiday shading: untouched.
- Verify in preview on both `/crm/quotes/:id` and a project planner route before closing.
