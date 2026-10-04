# Reports module rules

- Reports module: calculations are pure functions in src/lib/reports/* (no Supabase inside), data loaded by hooks in the same folder; access via v2 reports.view/all. Why: reports are read-only and their maths is reused across reports.
- Business performance (revenue, cost, profit, utilisation, capacity) is computed only by src/lib/reports/business-performance.ts, used by both the projects dashboard card and the report. Why: both must always show the same numbers.
- Project budget and actual cost (labour by stage, pursuit, materials, expenses) come from src/lib/reports/budget-consumption.ts, shared by the projects dashboard and the budget report. Why: one definition of "Orçamento"/"Custo real".
