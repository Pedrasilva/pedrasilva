
# Focused Gantt Dependency Pass

Unify dependency cascade behavior between project and quote Gantt views, add drag-to-link with automatic FS/SS/FF/SF type detection, support negative lag (lead time), label dependency arrows, and route success toasts through i18n. **No schema changes. No proposal/baseline/pricing/conversion changes.**

---

## 1. Project-mode allocation cascade parity

**File**: `src/lib/projects/use-planner.ts` — `useUpdateStageWithCascade`

Today the project-mode mutation applies the cascade to stage rows but only shifts allocations for the **user-edited stage**. Quote mode already shifts allocations for every cascaded successor (per-stage delta loop). I'll port that pattern over:

1. After `computeCascade(...)` returns the map of `{ stageId → newStart, newEnd }`, compute a per-stage `start_delta` (in days) by comparing against the original stage bounds.
2. For every stage whose `start_delta === end_delta` (i.e. pure shift, no resize), fetch its allocations and apply the same day delta to `start_date` / `end_date`.
3. Stages that were resized (delta differs) leave allocations in place — same rule quote mode uses.
4. Return `{ updatedStages: number, dependentCount: number }` from `mutationFn` so the adapter can show a toast.
5. **Remove** the existing inline `toast(...)` from this hook (it stays silent now; the adapter owns UX).

Also remove the inline `toast(...)` currently in `useUpdateQuoteStageWithCascade` (`src/lib/quotes/use-quote-planner.ts`) and have it return the same `{ dependentCount }` shape for symmetry.

## 2. Toast moves to the adapter layer

**Files**: `src/lib/projects/use-project-planner-adapter.ts`, `src/lib/quotes/use-quote-planner-adapter.ts`

Both adapters already wrap `updateStage`. I'll wrap the `mutateAsync` call so that after success:

```ts
updateStage: async (a) => {
  const res = await updateStageCascade.mutateAsync(a);
  if (res?.dependentCount > 0) {
    toast.success(t("projects:gantt.dependency.cascadeToast", { count: res.dependentCount }));
  }
  return res;
},
```

Adapters import `useTranslation()` from `react-i18next` (cheap; both adapters are React hooks already). Toast text uses pluralized i18n keys (`_one` / `_other`).

## 3. Drag-to-link with FS/SS/FF/SF inference

**File**: `src/components/projects/gantt-chart.tsx`

The scaffolding (`startLinkDrag`, `commitLinkDrag`, dashed preview line) already exists but only emits FS. I'll:

1. **Add visible handles**: on hover of a stage row, render two small grip dots — one at the bar's left edge (`side: "start"`) and one at the right edge (`side: "end"`). Use `pointer-events: auto` only on the dots; keep the bar drag intact.
2. **Track `fromSide`** in the existing link-drag state (already partially there).
3. **Detect `toSide`** in `onPointerMove` while a link drag is active: when the pointer is over a target stage's bar, classify the closer half (left third = `start`, right third = `end`, middle = ignore / show no preview).
4. **Inference matrix** in `commitLinkDrag`:

   | from \ to | start | end |
   |-----------|-------|-----|
   | **end**   | FS    | FF  |
   | **start** | SS    | SF  |

5. Call `adapter.createDependency({ predecessor_id, successor_id, type, lag_days: 0 })` with the inferred type.
6. Show a transient hint near the cursor while dragging: `t("projects:gantt.dependency.linkHint", { type })`.

## 4. Dependency arrow labels

**File**: `src/components/projects/gantt-chart.tsx` (SVG layer for `visibleDeps`)

For each rendered dependency arrow:

1. Compute the midpoint of the path.
2. Render an SVG `<g>` with a small rounded `<rect>` background and a `<text>` showing the label:
   - Lag 0: just the type — `FS`, `SS`, `FF`, `SF`
   - Lag positive: `FS +2d`
   - Lag negative: `SS −1d` (use the unicode minus `−` for clarity)
3. **Color-code** the arrow stroke by type via CSS variables on the existing line element (kept subtle to match the design system; no new tokens added — reusing `text-muted-foreground`, `text-primary`, `text-warning`, `text-accent`).
4. Hovering the label highlights both connected stage rows (add a class on hover; existing rows already have stable IDs).

The labels themselves come from `t("projects:gantt.dependency.types.FS")`, `.SS`, `.FF`, `.SF` so future locales can rename them if needed (PT-PT will use `FS/SS/FF/SF` too — these are industry-standard).

## 5. Negative lag UX

**File**: `src/components/projects/stage-dependency-editor.tsx`

1. Lag input: drop the `min={0}` constraint, allow integers in any range.
2. Relabel the input from "Lag (dias)" to `t("projects:gantt.dependency.lagWorkingDays")` ("Lag (working days)" / "Lag (dias úteis)").
3. Add a one-line hint below the input: `t("projects:gantt.dependency.lagHint")` ("Negative values create lead time — the successor can start before the predecessor finishes.").
4. The TYPE_LABELS map currently hardcodes Portuguese → swap to `t("projects:gantt.dependency.typeDescriptions.FS")` etc. so EN users see English descriptions.

## 6. i18n keys (EN + PT-PT)

**Files**: `src/i18n/locales/en/projects.json`, `src/i18n/locales/pt-PT/projects.json`

Add under `gantt.dependency`:

```json
"dependency": {
  "types": { "FS": "FS", "SS": "SS", "FF": "FF", "SF": "SF" },
  "typeDescriptions": {
    "FS": "Finish → Start",
    "SS": "Start → Start",
    "FF": "Finish → Finish",
    "SF": "Start → Finish"
  },
  "lagWorkingDays": "Lag (working days)",
  "lagHint": "Negative values create lead time — the successor can start before the predecessor finishes.",
  "linkHint": "Release to create {{type}} dependency",
  "cascadeToast_one": "Updated {{count}} dependent stage",
  "cascadeToast_other": "Updated {{count}} dependent stages",
  "addPredecessor": "Add predecessor",
  "noDependencies": "No incoming dependencies"
}
```

PT-PT mirror with: "FS → Fim para Início", "Lag (dias úteis)", "Valores negativos criam tempo de antecipação — a etapa sucessora pode começar antes da predecessora terminar.", "Atualizadas {{count}} etapas dependentes", etc.

Both files updated in the same edit so `node scripts/check-i18n-parity.mjs` stays green.

## 7. No schema changes

`pm_stage_dependencies` and `quote_stage_dependencies` already store `type` (text) and `lag_days` (integer, signed). Negative lag is already storable today — this pass only exposes it.

---

## Files changed

1. `src/lib/projects/use-planner.ts` — port allocation-shift loop into `useUpdateStageWithCascade`, return `{ dependentCount }`, drop inline toast.
2. `src/lib/quotes/use-quote-planner.ts` — drop inline toast, return `{ dependentCount }`.
3. `src/lib/projects/use-project-planner-adapter.ts` — wrap `updateStage` to fire i18n toast.
4. `src/lib/quotes/use-quote-planner-adapter.ts` — wrap `updateStage` to fire i18n toast.
5. `src/components/projects/gantt-chart.tsx` — visible handles, target-side detection, type inference, arrow labels, color coding, hover highlights.
6. `src/components/projects/stage-dependency-editor.tsx` — allow negative lag, i18n labels + hint.
7. `src/i18n/locales/en/projects.json` — add `gantt.dependency` block.
8. `src/i18n/locales/pt-PT/projects.json` — mirror PT-PT block.

## Validation

- `bunx tsc --noEmit`
- `node scripts/check-i18n-parity.mjs`

## Manual test checklist

In **both quote mode** (`/crm/quotes/:id` planning tab) **and project mode** (`/projects/:id` schedule tab + global Gantt):

1. **FS**: Drag from end of A onto start of B → arrow labeled `FS` appears. Move A right by 3 days → B shifts right by 3 days, B's allocations move with it. Toast: "Updated 1 dependent stage".
2. **SS**: Drag from start of A onto start of B → arrow labeled `SS`. Move A → B's start tracks A's start.
3. **FF**: Drag from end of A onto end of B → arrow labeled `FF`. Move A → B's end tracks A's end (start adjusts to preserve duration).
4. **SF**: Drag from start of A onto end of B → arrow labeled `SF`. Verified semantics (rare but supported).
5. **Negative lag**: Open dependency editor on B, set lag to `-2` → arrow label updates to `FS −2d`, B can now start 2 working days before A finishes. Drag A → B follows with the offset preserved.
6. **Chained cascade**: Build A → B → C with FS links. Move A right by 5 days → B and C both shift, all allocations on all three stages move, single toast: "Updated 2 dependent stages".
7. **Quote ↔ project parity**: Same scenarios produce identical visual + cascade behavior in both modes (only difference: status toggle and baseline ghost remain hidden in quote mode per `QUOTE_FEATURES`).

## Out of scope (untouched)

- `pm_projects` schema, `sold_*` columns, baseline guard trigger
- Proposal blocks, payment schedules
- Pricing rollups, fee calculation
- Quote → project conversion
- Approval / convert workflow (only verified by smoke test, not modified)
