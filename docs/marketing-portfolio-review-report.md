# Portfolio identity review — 25 October 2026

## Live function audit

Queried `pg_get_functiondef` for every signature patched by `20261025112000`. All nine exist; none retains the old capture/profile operational-key join or any of the 15 original replacement patterns.

| Function | Verified Marketing identity path |
| --- | --- |
| `marketing_compute_draft_readiness(uuid[],text,text[],uuid)` | capture key → profile `marketing_key`; internal name/client fallbacks |
| `marketing_compute_asset_draft_readiness(uuid[],uuid[],uuid,text,text[])` | library profile `marketing_key` |
| `marketing_effective_clearance(uuid)` | capture key → profile `marketing_key` |
| `marketing_draft_library_project(uuid[],uuid[],uuid)` | returns profile `marketing_key` |
| `marketing_draft_name_rule_violation(marketing_post_drafts)` | profiles selected by `marketing_key` |
| `marketing_draft_warning_issue(marketing_post_drafts)` | capture keys and library Marketing keys |
| `marketing_source_clearance_changed()` | draft key and capture key matched to `NEW.marketing_key` |
| `marketing_finish_reel(uuid,text,text[],boolean)` | inserts draft with profile `marketing_key` |
| `marketing_composition_slides_guard()` | capture key matched to profile `marketing_key` |

Remaining `pm_projects` joins resolve optional live names/clients; they are not capture/profile identity joins. Readiness retains the intentional `OR p.project_id=_project_id` compatibility path alongside the canonical Marketing-key lookup.

## Safety migration and source labels

- Added `drizzle/migrations/0192_marketing_portfolio_identity_assertions.sql`, mirrored byte-for-byte at `supabase/migrations/20261025114500_marketing_portfolio_identity_assertions.sql`.
- The migration raises on missing signatures, any of the 15 old patterns, whitespace variants of old capture/profile joins, or a missing expected replacement for each function. The historical migration was not rewritten.
- The original source view already got portfolio names through `marketing_project_directory`, whose portfolio branch exposes `internal_name` as `name`. Added an explicit `coalesce(pr.name, pp.internal_name, p.project_id::text)` fallback for robustness, including linked profiles when a live name is not visible. Verified the applied view definition contains it. Security-invoker behavior and grants are preserved.
- These are migration-time checks, not ongoing runtime interception of future migrations. Module rules now require equivalent assertions on future identity patches.

## Fixture verification

Authenticated application client created one standalone profile `[TEST] Portfolio review 20261025`, client `Fixture Brand`, rule `never_mention` (the existing enum for “never name”), clearance `unknown`; one linked capture with its own clearance `cleared`; and one draft with copy `[TEST] Fixture Brand portfolio review`.

- Normal authorized `marketing_recheck_draft_readiness` returned `blocked`.
- Stored flags include exactly `Names a client that must not be named`; editorial status stayed `suggested` (the readiness warning remains advisory, as required).
- Effective capture clearance was `unknown`, proving the portfolio profile takes part despite capture `project_id=NULL`.
- Project source label was `[TEST] Portfolio review 20261025`, clearance `unknown`, warning `true`, with the correct profile link.
- Planner `/marketing/posts` rendered that project name, Unknown and the named-client issue. Screenshot: `/tmp/browser/portfolio-review/clearance-source.png`; full fixture state: `/tmp/browser/portfolio-review/planner-fixture.png`. No runtime errors.
- Updated `scripts/test-marketing-portfolio.sql`; its rollback-only run also checked the naming rule with `_project_id=NULL`, isolating the capture/profile join, plus warning refresh and later linkage. All assertions reached the deliberate final PASS exception, rolling back all SQL fixtures.
- A direct browser call to the internal readiness helper was correctly denied; no grants were widened. Verification used the normal authorized recheck and the privileged rollback test instead.
- 41 existing Marketing unit/regression tests passed; preview reports build OK.

## Foreign keys and cleanup

Live `pg_constraint` inspection found only `request_id` and `chosen_alternative_id` foreign keys on `marketing_post_drafts`; `project_id` has no FK to `pm_projects`. The persisted fixture draft accepted the standalone Marketing key.

Deleted the exact browser-fixture draft, request, capture and profile. Verified zero remaining fixture rows and zero rolled-back fixture live projects. All 17 original draft rows have identical full-row hash before and after: `5447fbdad1826c476b441ea60eb86c8b`. No real draft was changed, approved, published, rescheduled or deleted; no asset files were used. Finance and translation work were untouched.

## Files changed

- Both mirrored migration files above.
- `scripts/test-marketing-portfolio.sql`.
- `src/lib/marketing/AGENTS.md`.
- `roadmap.md`.
- This report.
- Automatically regenerated `src/integrations/supabase/types.ts`.