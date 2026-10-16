# Pursuit follow-up

- Calendar assignment now uses `pursuitChoices`; `calendar.functions.ts` suggestions retain `is_open`.
- Assistant instructions, type comments and context header describe available pursuit leads. Transcription contained no obsolete open-lead wording, so it was left unchanged.
- Exported the live definitions of `crm_leads_directory`, `pm_time_entry_pursuit_guard`, `pm_can_see_project_financials`, `pm_project_pursuit_totals`, `crm_opportunity_pursuit_hours`, `pm_linkable_opportunities` and `pm_link_project_opportunity`, plus the guard trigger, time-entry opportunity column/FK/index and log-hours flag/backfill. Functions and grants retain live behavior. The backfill only runs when the flag is first introduced, preserving later curation on replay.
- Applied `drizzle/migrations/0063_pursuit_live_objects_snapshot.sql` and copied it byte-for-byte to `supabase/migrations/20261016230100_pursuit_live_objects_snapshot.sql`.
- No identified pursuit object could not be exported cleanly. Full empty-database restoration was not run: the older `20261008160000_psa_staff_access.sql` already references the time-entry opportunity column before this new snapshot. That pre-existing migration-order gap is not changed here.

## Verification
- Authenticated calendar-event assignment excludes unflagged Office project and offers won/not-active 2502 Uralchem IV.
- Real assistant input “On Monday two hours on Cabo Verde proposal and on Tuesday two hours on 2502 Uralchem IV proposal” produced two 2-hour internal Pursuit drafts with the exact respective opportunity IDs. Read back in the UI; no hours saved. Microphone capture was not retested.
- Authenticated directory results before/after applying the snapshot match exactly: 24 rows. Existing function ACLs preserved.
- A transaction temporarily set Uralchem IV to lost, verified a new Pursuit insert raises the existing lost-deal exception, then rolled everything back.
- Seven pursuit helper tests pass, including read-only lost rows and calendar eligibility. No live lost deals exist to exercise historical lost-row display end-to-end.
- EN/PT parity passes; latest preview build reports OK.