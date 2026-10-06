# Projects module rules

- Timesheet assistant (src/lib/projects/timesheet-assistant.functions.ts) only drafts entries for the signed-in user; saving happens in the browser through useUpsertTimesheetCell/useEnsureStageRow with source "assistant". Why: rate snapshots and triggers apply exactly as for typed hours.
- Google Calendar suggestions (src/lib/projects/calendar.server.ts) always run for the caller's own user id; refresh tokens are AES-GCM encrypted with CALENDAR_TOKEN_KEY in user_calendar_connections (service-role only), event data is never stored, saved events are tracked in pm_time_entries.calendar_event_ids. Why: per-person privacy; external_id is single-valued and reserved for imports.
