# Live Marketing clearance

## Schema
- `drizzle/migrations/0181_marketing_live_clearance.sql`, byte-identical mirror `supabase/migrations/20261024234500_marketing_live_clearance.sql`.
- Security-invoker views `marketing_capture_active_flags`, `marketing_draft_clearance_sources`.
- Curator-checked RPCs `marketing_recheck_drafts`, `marketing_recheck_draft_readiness`, `marketing_dismiss_capture_flag`.
- Source-change triggers `marketing_capture_clearance_refresh`, `marketing_profile_clearance_refresh` refresh suggested/pending_approval/approved/scheduled/failed drafts, including asset-only relationships.
- Append-only `marketing_capture_flag_dismissals` retains actor, time and reason without changing original flags. Client insert/update/delete/TRUNCATE unavailable. Existing public tables have zero anon/authenticated TRUNCATE grants; postgres public-table defaults also omit it.

## Files
- `src/lib/marketing/clearance.ts`
- `src/components/marketing/clearance-sources.tsx`
- `src/routes/_app.marketing.posts.tsx`
- `src/routes/_app.marketing.calendar.tsx`
- `src/routes/_app.marketing.index.tsx`
- `src/i18n/locales/{en,pt-PT}/marketing.json`
- `src/lib/marketing/AGENTS.md`
- `scripts/test-clearance.test.ts`, `scripts/test-live-clearance.sql`
- Auto-generated database types, roadmap and this report.

## Verification
22 unit/regression tests and EN/PT parity passed. Database fixtures asserted automatic profile/capture/flag refresh, required dismissal reason, immutable original flags and append-only history, noncurator rejection, no-project own clearance, full schedule/hash/content preservation and equality of every real draft. The final deliberate PASS exception rolled all fixtures back. Browser authenticated read-only check showed no runtime errors. A committed browser dismissal was intentionally not used, as its append-only audit cannot be removed during fixture cleanup.

Behind the hedge (Instagram `fbe58d42-2ad8-42a0-a034-798b07919e4f`): profile 0434 Sérgio Varanda is **Cleared ✓**; the capture remains **Unknown** and has the undismissed flag about Alto Santa Catarina. That genuine capture warning remains visible with Inbox links and a Dismiss control; the stale unknown-project warning is gone. The authorized readiness-only refresh preserved `scheduled`, `2026-10-27 10:00:00+00` and identical approved/current hash `3adc007ab0213c9e229212fe6633e351`. No capture was cleared or flag dismissed on Luis's behalf. Screenshot: `/tmp/browser/clearance/behind-hedge.png`.

No Finance changes, publication, retries or rescheduling.