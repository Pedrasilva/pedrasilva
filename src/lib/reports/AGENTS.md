# Reports module rules

- Reports module: calculations are pure functions in src/lib/reports/* (no Supabase inside), data loaded by hooks in the same folder; access via v2 reports.view/all. Why: reports are read-only and their maths is reused across reports.
- Business performance (revenue, cost, profit, utilisation, capacity) is computed only by src/lib/reports/business-performance.ts, used by both the projects dashboard card and the report. Why: both must always show the same numbers.
- Project budget and actual cost come from src/lib/reports/budget-consumption.ts (shared by projects dashboard and budget report): budget = own (quote is_self) stages + positive margin on supplier stages; cost excludes purchases/expenses matched to those stages' suppliers. Why: budgets measure PSA's own work only, one definition everywhere.
