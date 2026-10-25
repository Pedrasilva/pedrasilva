# Marketing portfolio projects — 25 October 2026

## Design
- One existing Marketing profile, not a new operational project: `project_id` is optional; `marketing_key` is an immutable Marketing identity. Existing profiles retain their original project UUID as the Marketing key.
- Captures reference `profile_id`; their `project_id` remains a real optional operational foreign key. Drafts retain their existing `project_id` field as the Marketing identity (it has no operational FK). Library media, press kits, story fields, languages and editorial records remain attached to the same profile.
- The caller-scoped `marketing_project_directory` combines live projects and standalone portfolios. It exposes the real live reference separately, so later linking retains Marketing identity while new captures still store valid operational references.
- Portfolio creation and linking require the existing database Marketing curator permission. Existing profile policies and editorial/hash guards remain in place. No pseudo-project rows are created.
- Protected internal names/clients/aliases are omitted from AI profile context, and the shared serialization boundary also redacts repeated protected names from free text before enrichment, copywriting, talking points and insights analysis.
- Linking an imported live project preserves the profile ID, Marketing key, captions, languages, capture links and draft history. Projects without profiles can receive a profile when selected by a curator in a profile-based picker.

## Migrations (exact mirrors)
- `drizzle/migrations/0189_marketing_optional_project_link.sql`
- `supabase/migrations/20261025110000_marketing_optional_project_link.sql`
- `drizzle/migrations/0190_marketing_portfolio_identity.sql`
- `supabase/migrations/20261025112000_marketing_portfolio_identity.sql`
- `drizzle/migrations/0191_marketing_portfolio_live_reference.sql`
- `supabase/migrations/20261025113200_marketing_portfolio_live_reference.sql`
- Generated database types refreshed by migration tooling.

## Application files
- New: `src/lib/marketing/portfolio.ts`, `src/lib/marketing/ai-privacy.server.ts`, `src/components/marketing/project-picker.tsx`, `src/components/marketing/portfolio-dialog.tsx`.
- Marketing helpers: `projects.ts`, `projects.server.ts`, `posts.server.ts`, `enrich.server.ts`, `compositions.server.ts`, `actions.functions.ts`, `capture-notes.functions.ts`, `post-approvals.functions.ts`, `nudges.server.ts`, `instagram-insights.server.ts` under `src/lib/marketing/`.
- Routes: `_app.marketing.projects.index.tsx`, `_app.marketing.projects.$profileId.tsx`, `_app.marketing.index.tsx`, `_app.marketing.posts.tsx`, `_app.marketing.calendar.tsx`, `_app.marketing.published.insights.tsx`, `_app.marketing.carousels.$id.tsx` under `src/routes/`.
- Components: `finished-reel-dialog.tsx`, `carousels-card.tsx`, `briefings-card.tsx` under `src/components/marketing/`.
- Translations: both `src/i18n/locales/en/marketing.json` and `src/i18n/locales/pt-PT/marketing.json`.
- Rules and tracking: root `AGENTS.md`, Marketing `AGENTS.md`, `roadmap.md`.
- Tests: `scripts/test-marketing-portfolio.test.ts`, `scripts/test-marketing-portfolio.sql`, `scripts/portfolio-vitest.config.mjs`.

## Verification
- 41 automated tests passed (portfolio identity/privacy, existing languages, clearance, finished reels and calendar).
- EN/PT translation parity passed; latest preview compilation: build OK.
- Database fixture transaction passed standalone isolation, capture identity, effective clearance, protected names, stage links, automatic warning refresh without status change, later linking and language/history preservation. All fixtures rolled back.
- Authenticated browser: created standalone profiles, read them back on Profiles, searched them in the Inbox picker, saved a linked capture and read it back on the New tab. No browser runtime errors.
- Two disposable profiles and two disposable text captures from browser retries were deleted by exact IDs and fixture text. Verified zero remaining fixture profiles, captures, drafts or live projects.
- No real draft was approved, rescheduled, published, edited or deleted; no real media files were touched. Pending Finance changes were not edited.
- AI provider generation, full reel upload/publish and later linkage through the browser were not exercised in this pass; linkage and rule behavior were checked in the rolled-back database test. Nothing was published.

## Screenshots
- Profiles: `/tmp/browser/portfolio/profiles.png` (shows clearly marked disposable profiles, subsequently removed).
- Inbox picker: `/tmp/browser/portfolio/inbox-picker.png`.
- Saved fixture capture: `/tmp/browser/portfolio/capture-saved.png`.