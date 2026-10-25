# Translation batch 2 — Projects components and Planner

Checker: **537 → 43** candidates in scoped components. 493 resolved signatures pruned; no baseline additions.

## Verification
- `npm run test:i18n`: 9 AST tests, 12-namespace parity and baseline ratchet passed.
- Detail, global Gantt and weekly planning checked in EN/PT in an authenticated browser. No runtime errors or raw translation keys after final pass.
- Detail uses a browser-only disposable response copy of existing project/stages; no persisted fixture, no live record writes. Global Gantt and weekly planning read-only; no action that saves/approves/deletes was exercised.
- Existing fixture response has unavailable actuals shown as NaN: retained for evidence, no calculation changes in this translation-only batch.

## Changes
- Text-only changes under `src/components/projects/` and `src/components/planner/`; shared/common/glossary keys reused, remaining component UI in projects namespace.
- PT projects/common corrected for AO90, valor/hora, RH and avença grammar; interpolation variable names preserved.
- Status maps translate at rendering; contract diff and shifted-stage counts use plurals. Dates and number presentation follow active UI language; stored ISO dates, enums and input values stay unchanged.
- One batch-1 leftover fixed in `src/routes/_app.projects.gantt.tsx`: translate the existing status/zoom keys at display.
- No Finance module, backend, migrations or operational data changed.
- AGENTS.md translation rule extended to component UI.

## Screenshots
- [detail · pt-PT](i18n-batch2/detail-pt-PT.png)
- [detail · en](i18n-batch2/detail-en.png)
- [gantt · pt-PT](i18n-batch2/gantt-pt-PT.png)
- [gantt · en](i18n-batch2/gantt-en.png)
- [weekly-plan · pt-PT](i18n-batch2/weekly-plan-pt-PT.png)
- [weekly-plan · en](i18n-batch2/weekly-plan-en.png)

## Per-file checker counts
| File | Before | After |
|---|---:|---:|
| `src/components/planner/gantt-print-button.tsx` | 31 | 5 |
| `src/components/planner/planner-gantt.tsx` | 22 | 0 |
| `src/components/projects/allocation-editor.tsx` | 47 | 1 |
| `src/components/projects/approvals-panel.tsx` | 1 | 0 |
| `src/components/projects/budget-control-panel.tsx` | 4 | 0 |
| `src/components/projects/contract-baseline-card.tsx` | 16 | 0 |
| `src/components/projects/contract-diff-card.tsx` | 22 | 1 |
| `src/components/projects/create-project-direct-dialog.tsx` | 31 | 0 |
| `src/components/projects/create-stage-task-dialog.tsx` | 48 | 0 |
| `src/components/projects/dashboard/financial-kpi-strip.tsx` | 1 | 0 |
| `src/components/projects/dashboard/hours-kpi-strip.tsx` | 4 | 0 |
| `src/components/projects/dashboard/kpi-strip.tsx` | 6 | 0 |
| `src/components/projects/dashboard/performance-table.tsx` | 10 | 0 |
| `src/components/projects/dashboard/project-effort-table.tsx` | 3 | 0 |
| `src/components/projects/dashboard/project-health-table.tsx` | 5 | 0 |
| `src/components/projects/dashboard/project-scorecard.tsx` | 15 | 0 |
| `src/components/projects/dashboard/project-value-chart.tsx` | 5 | 0 |
| `src/components/projects/dashboard/stage-hours-breakdown.tsx` | 3 | 0 |
| `src/components/projects/dashboard/team-performance.tsx` | 2 | 0 |
| `src/components/projects/gantt-actuals-layer.tsx` | 6 | 0 |
| `src/components/projects/gantt-chart.tsx` | 24 | 5 |
| `src/components/projects/gantt-outline-column.tsx` | 26 | 1 |
| `src/components/projects/log-retainer-hours-dialog.tsx` | 15 | 0 |
| `src/components/projects/my-week-card.tsx` | 7 | 7 |
| `src/components/projects/new-project-dialog.tsx` | 10 | 0 |
| `src/components/projects/new-retainer-stage-dialog.tsx` | 11 | 0 |
| `src/components/projects/new-stage-dialog.tsx` | 11 | 0 |
| `src/components/projects/notes/notes-list.tsx` | 1 | 1 |
| `src/components/projects/project-expense-dialog.tsx` | 2 | 2 |
| `src/components/projects/project-expenses-section.tsx` | 5 | 5 |
| `src/components/projects/project-financial-tab.tsx` | 23 | 0 |
| `src/components/projects/project-planner-inspector.tsx` | 2 | 0 |
| `src/components/projects/project-pursuit-card.tsx` | 1 | 1 |
| `src/components/projects/project-sync-status-badge.tsx` | 5 | 0 |
| `src/components/projects/project-team-card.tsx` | 1 | 0 |
| `src/components/projects/resource-pool.tsx` | 15 | 0 |
| `src/components/projects/retainer-monitor-panel.tsx` | 25 | 0 |
| `src/components/projects/stage-baseline-dialog.tsx` | 28 | 0 |
| `src/components/projects/stage-dependency-editor.tsx` | 2 | 0 |
| `src/components/projects/stage-row-actions.tsx` | 20 | 0 |
| `src/components/projects/timesheet-activity-cell.tsx` | 1 | 1 |
| `src/components/projects/timesheet-assistant-sheet.tsx` | 4 | 4 |
| `src/components/projects/timesheet-retainer-stages.tsx` | 4 | 0 |
| `src/components/projects/week-draft-editor.tsx` | 3 | 2 |
| `src/components/projects/week-planning-board.tsx` | 4 | 3 |
| `src/components/projects/week-project-notes.tsx` | 4 | 4 |
| `src/components/projects/week-publication-dialog.tsx` | 1 | 0 |

## Deliberately retained checker candidates
Technical units/format labels A4, A3, PDF, px, financial initials R/F, invoice-number example FT 2026/12345 and 0h00; the rest are stored/internal enums and expression literals, not visible untranslated labels. Stored names, imported notes, backend exception messages and client/document prose remain unchanged.

- `src/components/planner/gantt-print-button.tsx:222` — `PDF` (jsxText)
- `src/components/planner/gantt-print-button.tsx:244` — `A4` (jsxText)
- `src/components/planner/gantt-print-button.tsx:248` — `A3` (jsxText)
- `src/components/planner/gantt-print-button.tsx:350` — `px` (jsxText)
- `src/components/planner/gantt-print-button.tsx:353` — `px` (jsxText)
- `src/components/projects/allocation-editor.tsx:259` — `project` (jsxExpression)
- `src/components/projects/contract-diff-card.tsx:135` — `name` (jsxExpression)
- `src/components/projects/gantt-chart.tsx:980` — `monthDay` (jsxExpression)
- `src/components/projects/gantt-chart.tsx:1018` — `quarterMonth` (jsxExpression)
- `src/components/projects/gantt-chart.tsx:1044` — `yearQuarter` (jsxExpression)
- `src/components/projects/gantt-chart.tsx:1536` — `R` (jsxText)
- `src/components/projects/gantt-chart.tsx:1543` — `· F` (jsxText)
- `src/components/projects/gantt-outline-column.tsx:442` — `resources` (jsxExpression)
- `src/components/projects/my-week-card.tsx:107` — `submitted` (jsxExpression)
- `src/components/projects/my-week-card.tsx:107` — `approved` (jsxExpression)
- `src/components/projects/my-week-card.tsx:163` — `returned` (jsxExpression)
- `src/components/projects/my-week-card.tsx:169` — `approved` (jsxExpression)
- `src/components/projects/my-week-card.tsx:187` — `approved` (jsxExpression)
- `src/components/projects/my-week-card.tsx:190` — `submitted` (jsxExpression)
- `src/components/projects/my-week-card.tsx:225` — `Error` (toast)
- `src/components/projects/notes/notes-list.tsx:147` — `voice` (jsxExpression)
- `src/components/projects/project-expense-dialog.tsx:607` — `FT 2026/12345` (prop:placeholder)
- `src/components/projects/project-expense-dialog.tsx:713` — `personal` (jsxExpression)
- `src/components/projects/project-expenses-section.tsx:247` — `pending` (jsxExpression)
- `src/components/projects/project-expenses-section.tsx:252` — `approved` (jsxExpression)
- `src/components/projects/project-expenses-section.tsx:257` — `rejected` (jsxExpression)
- `src/components/projects/project-expenses-section.tsx:299` — `pending` (jsxExpression)
- `src/components/projects/project-expenses-section.tsx:320` — `draft` (jsxExpression)
- `src/components/projects/project-pursuit-card.tsx:47` — `0h00` (jsxExpression)
- `src/components/projects/timesheet-activity-cell.tsx:226` — `project` (jsxExpression)
- `src/components/projects/timesheet-assistant-sheet.tsx:436` — `low` (jsxExpression)
- `src/components/projects/timesheet-assistant-sheet.tsx:480` — `Pursuit` (jsxExpression)
- `src/components/projects/timesheet-assistant-sheet.tsx:690` — `cal` (jsxExpression)
- `src/components/projects/timesheet-assistant-sheet.tsx:719` — `connected` (jsxExpression)
- `src/components/projects/week-draft-editor.tsx:108` — `approved` (jsxExpression)
- `src/components/projects/week-draft-editor.tsx:110` — `error` (jsxExpression)
- `src/components/projects/week-planning-board.tsx:80` — `am` (jsxExpression)
- `src/components/projects/week-planning-board.tsx:82` — `am` (jsxExpression)
- `src/components/projects/week-planning-board.tsx:104` — `project` (jsxExpression)
- `src/components/projects/week-project-notes.tsx:85` — `saving` (jsxExpression)
- `src/components/projects/week-project-notes.tsx:86` — `saved` (jsxExpression)
- `src/components/projects/week-project-notes.tsx:88` — `error` (jsxExpression)
- `src/components/projects/week-project-notes.tsx:88` — `conflict` (jsxExpression)
