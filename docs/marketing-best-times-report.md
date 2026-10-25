# Best posting times

## Observed data
- The authenticated application `checkFollowerActivity` called the configured Meta account's `online_followers` metric using the existing safe Graph client. It returned no usable hourly values and no Meta error. Recorded `unavailable`, zero slots, for 25 October 2026. No documented replacement was found; no alternate versions/endpoints were probed.
- `marketing_ig_media_insights` has 50 distinct media, posted from 9 September 2025 to 26 February 2026. **Zero within the last 90 days** at verification on 25 October 2026.
- Therefore the real Calendar and Insights show “Not enough data yet (0 posts)” and no heat colours or recommended drop-time override. This is deliberate, not fabricated sample data.

## Storage and scoring
- Applied `drizzle/migrations/0183_marketing_best_times.sql`, identical mirror `supabase/migrations/20261025003600_marketing_best_times.sql`.
- `marketing_ig_follower_activity`: daily optional activity snapshot, marketing-view SELECT RLS, service-only writes, no client TRUNCATE.
- `marketing_best_times_data()`: security-invoker batched reads. No AI calls.
- Latest snapshot once per media; 90-day posting window; reach > 0; feed/carousels separate from Stories and excludes Reels. Minimum five posts. Performance combines reach (70%) and engagement rate (30%), shrinking sparse hourly buckets toward neutral/follower curve. All times Europe/Lisbon.
- The most recent fresh follower snapshot is used, avoiding repeated rolling-window samples. Missing data is not zero.

## Files
- New: `src/lib/marketing/best-times.ts`, `use-best-times.ts`, `src/components/marketing/best-times-map.tsx`, `scripts/test-best-times.test.ts`, `scripts/best-times-vitest.config.mjs`.
- Updated: `instagram-insights.server.ts`, `instagram-insights.functions.ts`, `_app.marketing.calendar.tsx`, `_app.marketing.published.insights.tsx`, `src/styles.css`, EN/PT Marketing translations, `scripts/test-instagram-insights.test.ts`, root/module AGENTS and roadmap.
- Generated schema types refreshed by migration tooling.

## Verification
- 33 pure/Graph-mocked tests passed; EN/PT parity passed; preview reports build OK.
- Authenticated Calendar renders 07–23 hour axis, existing Tuesday 27 tile and empty-data state; Insights renders all 119 cells. Per-person switch survives reload.
- Screenshots: `/tmp/browser/best-times/week.png`, `/tmp/browser/best-times/insights.png`.
- No approvals, publishing, rescheduling or real draft test writes; Finance untouched.
- Verification limit: an intercepted, browser-only disposable draft drag simulation timed out and was stopped. Actual drag/drop best-hour prefill and top-three highlights were not verified end-to-end; pure best-slot rules passed. Real data currently cannot supply a recommended slot.