## Goal

Make the left "WBS · Stage" panel behave like the reference screenshot in **both** the CRM quote planner and the Project plan view (single shared component — Gantt is one source of truth).

```text
| # | Milestones & Tasks      | Dur. | Start      | Due        | Budget    | Time | Dep. |◀━━┃━━▶  Gantt
| 1 | ▼ 2521 BCG Offices      | 323  | 17/11/2025 | 10/02/2027 | €110,000  |      |      |
| 2 |   0 - Gestão e contracto| 1    | 17/11/2025 | 17/11/2025 |           |      |      |
| 3 |   1 - Programme...      | 28   | 17/11/2025 | 24/12/2025 | €22,550   |      | 2FS  |
| + | Insert new stage…       |      |            |            |           |      |      |
```

## Scope

1. **Spreadsheet WBS** — replace the current single-cell row with a proper grid of columns: `#`, `Milestones & Tasks`, `Dur.`, `Start`, `Due`, `Budget`, `Time`, `Dep.`. All cells inline-editable (already wired for name/WBS; add date, duration, budget, dep).
2. **Draggable splitter** — vertical handle between WBS panel and Gantt canvas; drag to resize the WBS width (clamped 280–900 px). Persist per-user in `localStorage` so it survives reloads.
3. **Trailing insert row** — a permanent "+ Insert new stage…" row at the bottom of the table (and an inline `+` on hover at the end of each parent's children block) that calls the existing `onInsertStage` plumbing.
4. **FS auto-cascade on inline edits** — when the user edits `Dur.` or `Due` in the WBS, run the same `computeCascade` that drag-on-Gantt already uses, so any FS successor shifts forward/back automatically. Already implemented for Gantt drag; just route inline edits through the same mutation (`useUpdateStageWithCascade` / `useUpdateQuoteStageWithCascade`).

## Files to change

- `src/components/projects/gantt-outline-column.tsx` — main rewrite into a table grid; add new editable cells (`DurationCell`, `DateCell`, `BudgetCell`, `DepCell`); add insert row; add new optional props (`onUpdateStageBounds`, `onUpdateStageBudget`, dependency list + handlers).
- `src/components/projects/gantt-chart.tsx` — replace the static `outlineWidth` with a controlled prop driven by the splitter; render the drag handle between outline column and canvas; pass the new mutation handlers through.
- `src/components/planner/planner-gantt.tsx` — store outline width in state (seeded from `localStorage`), wire `onUpdateStageBounds` to the existing cascade hook for both quote-mode and project-mode adapters.
- `src/lib/projects/planner-adapter.ts` (and the two adapter hooks) — already expose `updateStage`; just confirm both wrappers route through `computeCascade`. No new fields needed.

## Behavior details

- **Dur.** is computed `differenceInCalendarDays(end, start) + 1`. Editing Dur. keeps `start_date` and shifts `end_date`. Editing `Due` keeps start; editing `Start` keeps duration. All three commits go through the cascade mutation.
- **Dep.** cell shows e.g. `2FS`, `3FS+2d`. Click to open a small popover listing siblings + type (FS/SS/FF/SF) + lag. Uses existing `createDependency` / `updateDependency` / `deleteDependency` from the adapter.
- **Budget** is read-only on parents (rollup), editable on leaves; updates `quote_stages.budget` / `pm_stages.budget`.
- **Time / Dep.** columns are narrow and right-aligned, tabular-nums, matching the screenshot.
- **Splitter** is a 4 px hit area, 1 px visible line, `cursor-col-resize`, with pointer capture; drag updates width on `pointermove`, writes `localStorage` on `pointerup`.
- **Insert row** dispatches `onInsertStage(lastVisibleId, "below")`; when the tree is empty, it dispatches a new "create root" path (already supported by both adapters).

## Non-goals

- No backend / schema changes.
- No change to the Gantt timeline rendering itself.
- No new column types beyond the 8 in the screenshot.

## Validation

- `tsgo` clean.
- Manual: in the quote planner, drag the splitter, edit a Dur. on stage 3, confirm stage 4 (FS) slides; verify the same on `/projects/$projectId`.
