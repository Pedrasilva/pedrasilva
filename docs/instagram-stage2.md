# Instagram publishing — stage 2

## Changed files
- New server/pure helpers: `src/lib/marketing/instagram-publish.ts`, `instagram-publish.server.ts`, `instagram-media.server.ts`, `mp4-metadata.ts`, `instagram-graph.server.ts`, `instagram-feed.server.ts`, `instagram.functions.ts`.
- New callback: `src/routes/api/public/hooks/marketing-publish.ts`.
- UI: `src/components/marketing/instagram-publish-controls.tsx`, `instagram-grid.tsx`, `post-approval-controls.tsx`; `src/routes/_app.marketing.calendar.tsx`, `_app.marketing.posts.tsx`.
- Email: `src/lib/email-templates/marketing-publish-failed.tsx`, template registry; existing verified sender retained.
- EN/PT translations: `src/i18n/locales/{en,pt-PT}/marketing.json`.
- Tests/configuration: `scripts/test-instagram-publishing.mjs`, `test-instagram-pipeline.mjs`, `test-instagram-publish-lock.sql`, `configure-instagram-publish-cron.sql`.
- Architecture rules: root and Marketing AGENTS.md; roadmap.
- Generated database types refreshed by migrations. No net new package retained.

## Applied migrations — byte-identical mirrors
| Drizzle | Matching source-controlled mirror |
|---|---|
| `drizzle/migrations/0147_instagram_publish_state.sql` | `supabase/migrations/20261023000100_instagram_publish_state.sql` |
| `drizzle/migrations/0148_instagram_publish_guards.sql` | `supabase/migrations/20261023000200_instagram_publish_guards.sql` |
| `drizzle/migrations/0149_instagram_publish_safety.sql` | `supabase/migrations/20261023000300_instagram_publish_safety.sql` |
| `drizzle/migrations/0150_instagram_story_send_boundary.sql` | `supabase/migrations/20261023000400_instagram_story_send_boundary.sql` |

## Scheduling
Existing database pg_cron job `marketing-instagram-publish-every-5-min`, active, schedule `3-59/5 * * * *` UTC (minute 03, 08, 13, …): 288 database checks/day. SQL calls the production `/api/public/hooks/marketing-publish` only while due/retry/stale work exists. Uses existing Vault `marketing_enrich_secret`, never its value in source; handler validates it through service-only RPC. HTTP timeout 120 seconds. Configuration is recorded in `scripts/configure-instagram-publish-cron.sql` rather than a schema migration.

**The production callback requires publishing this app version. It was not deployed during this task.** No real scheduled due draft existed at verification. No real post was published or send callback authenticated during testing. No Facebook implementation.

## Double-publishing prevention
`marketing_claim_publish` uses `FOR UPDATE SKIP LOCKED`, persistent UUID lock and publishing status. Checkpoints compare the current lock; stale workers cannot submit. Locks renew while polling. Current hash/valid non-void approval, final saved anonymity and independent clearance are rechecked before submission. Created containers lock their approved content, including failed retries. Every send records intent before the external request; lost/ambiguous media_publish responses remain failed and cannot be automatically or manually retried. No exactly-once claim is made for the provider; conservative blocking is used where its outcome is uncertain. Stories use a separate submitted flag for each frame in the existing container ledger.

Transient failures before submission get one automatic retry after five minutes (attempt count <2). Validation/daily-limit failures do not retry. Ambiguous submission failures remain blocked, including 5xx/network responses at the actual submission boundary. Manual retry requires still-valid approval and refuses unresolved submissions. Failed claim validations also return for per-event failure email handling. Bell notifications go to approval requester and approver with Marketing access; each expected email event uses a fixed template/idempotency key. No email queue/dispatcher was added.

## Media and feed
Private `marketing-assets` retained, signed URLs expire after one hour. Actual JPEG and MP4/MOV metadata checked; no automatic conversion. Conservative supported envelope rejects unsupported image ratios/size or video codec/duration/FPS/size/metadata. Current official numeric specification tables were not fully retrievable; these bounds should not be represented as exhaustive latest Meta limits. v26.0 is the existing project version and is listed as released by Meta. Multi-frame Stories publish separate containers in sequence. Story text/stickers are not automatically burned into media: drafts with unrendered overlays fail explicitly rather than losing approved content. Automatic location tags are not supported and any saved tag must be removed and reapproved; never_mention remains server-gated.

Latest 30 Instagram posts read server-side and cached in existing marketing_settings for 15 minutes. Token used only in server Authorization header, not returned or logged. Safe projection includes requested media fields; errors redact media URLs and credentials. Feed repair may fill a missing permalink without republishing. UI shows scheduled/publishing/published/failed, Instagram permalink, retry and admin-only confirm-immediate controls.

## Verification
- 19 isolated selection/lock/request/media/error checks passed; all Graph calls mocked.
- Five full mocked pipeline scenarios passed: single, carousel, multi-frame Stories, fenced stale worker, lost submission response.
- 11 live database checks passed inside a deliberately rolled-back transaction: claim, second claim refusal, wrong/stale locks, locked content, changed internal_only clearance, single-send boundary, ambiguous retry prevention, manual refusal, published ID/date/permalink persistence.
- Zero disposable project fixtures remained; zero public-table client TRUNCATE grants; all four migration mirrors byte-identical.
- Nine existing calendar regressions passed; preview build OK.
- Generated local four-second 1080×1920 H.264 video parsed and validated without uploading.
- Real authenticated feed UI showed 30 live posts in three columns; no runtime errors. Unauthenticated callback returned 401. Existing real draft/approval records were not used for write tests.
- Live provider publication, real failure email delivery, genuine second-user admin denial and browser scheduling/retry on persisted fixtures were not exercised; the first actual publication belongs to Luis.
