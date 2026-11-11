# Proposal Cover / Letter / Content — 11 November 2026

## Status
Implemented, **not release-validated**. PDF parity and some end-to-end controls remain unverified. Do not treat this report as approval for team rollout.

## Results
| Check | Result |
|---|---|
| Disposable Hotel Chiado rendering | PASS: 12 completed sheets: cover, letter, ten content pages |
| Content counters | PASS: first content 1, last 10/10; cover/letter excluded |
| Letter header/footer | Fixed after screenshot revealed duplicated furniture; latest letter capture has no standard furniture |
| AI live request | PASS: PT-PT draft with live tokens, 158,840 EUR, five stages, 45 weeks; no literal invented digits |
| Original proposal and blocks | PASS: exact before/after equality |
| Disposable cleanup | PASS: zero remaining fixture proposals |
| B1 | PASS: preview/recorded/effective all false |
| Compilation | PASS: latest observed build OK |
| PDF parity | **FAIL / unverified**: test serialization printed one page instead of twelve; no parity claim |
| New proposal creation through UI, removable initial blocks | Pending full end-to-end validation; implemented in creation path |
| Settings, signature upload, layout overrides, overwrite confirmation | Pending complete UI verification |
| English AI draft, long-letter continuation, index page references | Pending |

No changes were made to real proposal content. Practice settings table and schema were added; no signature was fabricated. Luis's real signature image still needs an administrator upload.

## Screenshots
- [Completed pages](proposal-cover-letter/pages.png)
- [Letter sheet](proposal-cover-letter/letter.png)

## Implementation / changed files
- Migration mirrored exactly: `drizzle/migrations/0280_proposal_letter_settings.sql`, `supabase/migrations/0280_proposal_letter_settings.sql` (settings, guarded writes, creation snapshot, Letter enum).
- `src/lib/psa-proposal/`: `types.ts`, `letter.ts`, `use-letter-settings.ts`, `letter.functions.ts`, `letter.server.ts`, `ai/{run-id,responses,gateway-helpers}.server.ts`, `live-data.ts`, `master-page.ts`, `use-psa-proposal.ts`, `system-titles.ts`, `page-layout.ts`, `paged-frame.ts`.
- `src/components/psa-composer/`: `letter-page.tsx`, `letter-controls.tsx`, `letter-settings.tsx`, `master-page-editor.tsx`, `block-renderer.tsx`, `block-settings-panel.tsx`, `block-library-panel.tsx`, `canvas.tsx`, `paginated-preview.tsx`, `editor-labels.ts`, `AGENTS.md`.
- `src/routes/_app.admin.proposal-master.tsx`; paired `common.json` EN/PT translations; `package.json`, `bun.lock`; `docs/DECISIONS.md`, `roadmap.md`.

## Remaining work
Finish export parity using the app's actual completed-sheet print path (not a naked serialized iframe), verify cover/letter furniture and index under print media, add focused rule tests, and complete creation/settings/override/AI overwrite checks before release. D33 records the approved product decision; no prior commercial decision was changed.
