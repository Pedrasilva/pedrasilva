# Reports module rules

- Reports module: calculations are pure functions in src/lib/reports/* (no Supabase inside), data loaded by hooks in the same folder; access via v2 reports.view/all. Why: reports are read-only and their maths is reused across reports.
