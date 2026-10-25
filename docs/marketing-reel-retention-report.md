# Published reel video retention

## Behaviour
- Owner-authorized exception to original retention: only full-size MP4/MOV files in `marketing-assets/reels/<upload-id>/video.mp4|mov` are removed.
- Eligibility requires every referencing draft to be an Instagram reel, `published`, with a nonempty `ig_media_id` and `published_at + 30 days` elapsed. Because `published_at` is a date, the exact `ig_published_at` timestamp also must be at least 30 days old when available, preventing early deletion. Locks, errors, retries, missing dates and all other statuses disqualify removal.
- Existing private-secret-gated Marketing publishing callback calls cleanup; the database gate allows at most one run every 24 hours. No new cron or Meta API calls. Typically removal occurs within the next daily run after the threshold; batches are bounded to 100 upload sessions, with additional eligible files waiting until the next day.
- Persistent claims store original object size before removal. Shared upload advisory locks prevent a new draft from reusing a claimed/purged upload. Storage API removes exactly one video; completion requires object metadata to be absent, records `video_purged_at` and `video_purged_bytes` on drafts, and appends `video_purged` to the existing publish log. Claim/failure events are logged too. Failed claims retry next day, including recovery if deletion succeeded before metadata recording.
- Draft, caption/hashtags, cover, original upload paths/metadata, approval hash/history, publish log, Instagram URL/media ID and insights remain intact. Purged reel resolution returns the cover; Published, Planner and Calendar show the offline-original notice and existing live-post link. Video download is refused and reuse requires a new upload.

## Files changed
- `src/lib/marketing/reel-retention.ts` — pure eligibility/path rules.
- `src/lib/marketing/reel-retention.server.ts` — service-only claimed Storage cleanup.
- `src/lib/marketing/draft-images.ts` — retained-cover fallback.
- `src/routes/api/public/hooks/marketing-publish.ts` — existing-job integration.
- `src/routes/_app.marketing.published.index.tsx`, `src/routes/_app.marketing.posts.tsx`, `src/routes/_app.marketing.calendar.tsx` — removal notice and links.
- `src/i18n/locales/en/marketing.json`, `src/i18n/locales/pt-PT/marketing.json` — matching translations.
- `src/lib/marketing/AGENTS.md`, `AGENTS.md` — original-retention exception and structural safety rules.
- `scripts/test-reel-retention.test.ts`, `scripts/test-reel-retention.sql`, `scripts/finished-reels-vitest.config.mjs` — fixture-only checks.
- `roadmap.md`, this report; generated database types refreshed by migration tooling.

## Migrations (byte-identical mirrors)
- `drizzle/migrations/0187_marketing_reel_video_retention.sql` ↔ `supabase/migrations/20261025015500_marketing_reel_video_retention.sql`.
- `drizzle/migrations/0188_marketing_reel_retention_null_guard.sql` ↔ `supabase/migrations/20261025015600_marketing_reel_retention_null_guard.sql` (NULL-safe all-reference eligibility).
- Service-only RPCs: `marketing_claim_reel_cleanup`, `marketing_reel_purge_eligible`, `marketing_complete_reel_purge`. No table creation or bucket-setting changes.

## Verification
- 40 selected unit/regression checks: retention rules, forbidden statuses/formats/paths, storage failure and metadata recovery, cover resolution, reel validation and Calendar rules.
- Database disposable fixtures entirely rolled back: exact 30-day boundary, NULL dates, missing ID, uncertain outcome/lock, reuse rejection, completion/idempotence, exact other-field equality, 12,345-byte metadata, one completion log, service-only grants.
- Actual disposable video (480,571 bytes) uploaded to private Storage and removed via Storage API; JPEG cover retained byte-for-byte, then removed as test cleanup. No real files used.
- Authenticated Published screen with browser-only fixture data: cover rendered, offline-original notice visible, link retained, no video and zero runtime errors; screenshot `/tmp/browser/reel-retention/purged-card.png`. No real draft writes.
- Final database read: zero remaining fixture drafts/projects, zero real purge claims, zero real drafts purged; daily gate still untouched. The complete production scheduled callback was intentionally not invoked, since it also publishes real scheduled drafts. Claim-to-delete flow tested with injected disposable mocks, database completion with rollback fixtures, and actual Storage deletion independently.
- Preview build OK; migration mirror parity verified. Finance files/data untouched; nothing published, approved, retried or rescheduled. Published deployment starts using the new callback only after Luis publishes this version.