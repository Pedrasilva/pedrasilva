# Agent rules

- Module-specific rules live in that module's AGENTS.md: src/lib/marketing/AGENTS.md (captures, intake, profiles, enrichment, posts, nudges, deletion) and src/lib/reports/AGENTS.md. Why: keeps the root file small; read the module file before changing that module.
- Timesheet assistant (src/lib/projects/timesheet-assistant.functions.ts) only drafts entries for the signed-in user; saving happens in the browser through useUpsertTimesheetCell/useEnsureStageRow with source "assistant". Why: rate snapshots and triggers apply exactly as for typed hours.
