# Proposal Master page — 9 November 2026

Implemented: toolbar/style-panel Master editor, A4 at document scale with zoom, mm margins, header/footer height guides, logo alignment/edge position/width, draggable logo and contacts with guide snapping, contact/address content, footer font size, cover-only furniture visibility/position, practice Settings page and explicit proposal reset. Typography remains separate. Legacy settings resolve without writes; new proposals snapshot a saved practice default. Practice saves use admin-only database policies and revision checks.

Storage: 0269_proposal_master_page.sql applied and mirrored exactly at supabase/migrations/20261109000700_proposal_master_page.sql. New table verified; authenticated/anon TRUNCATE grants remain zero. No existing proposal was backfilled or changed; no practice default was saved.

## Evidence
- Browser-only disposable Hotel Chiado copy: 11 screen / 11 physical PDF pages before and after left margin 30 mm, logo width 40 mm and mouse drag. First block matches on every page.
- Save/readback through intercepted fixture writes and fresh page load passed. Cover header/footer OFF only on page 1; remaining pages ON. Real proposal/block full readbacks unchanged. Browser context destroyed, no persistent copy.
- 15 focused tests passed; i18n EN/PT parity passed; zero new hardcoded candidates; latest build OK; browser page errors zero.
- Captures: proposal-master-page/master.png, pages.png, split.png. Detailed page/block evidence: results-master.json.

## Limits
- Practice default persistence and genuine non-admin denial were not exercised end-to-end: the managed SQL runner rejected SET ROLE authenticated before the test could run. A rollback-only security test is retained for a suitably privileged runner. No role or user data was changed.
- Practice editor opened signed-in, but saving a practice default was intentionally not performed against real practice settings. Proposal persistence was verified in a browser-local disposable fixture, not a database copy.
- Header/footer heights currently define their visible template guide areas; independent body margins remain the reserved content area. Native printer output is unverified; physical Chromium PDFs passed.
- B1 untouched.

## Files
src/lib/psa-proposal/{master-page.ts,use-master-page.ts,types.ts}; src/components/psa-composer/{master-page-editor.tsx,canvas.tsx,paginated-preview.tsx,composer-top-bar.tsx,proposal-style-panel.tsx,AGENTS.md}; src/routes/{_app.admin.proposal-master.tsx,_app.admin.index.tsx}; src/styles.css; src/i18n/locales/{en,pt-PT}/common.json; scripts/{test-master-page.test.ts,test-master-page-security.sql,test-composer-master-page.py}; migration mirrors; generated database types; roadmap.md; this report/evidence.


## Pending checks completed — 10 November 2026
Evidence: `proposal-master-page-checks/` (screenshots and results.json).
- (a) Practice default saved as admin from Settings (left margin and logo X 20 mm), confirmation shown, values persisted after reload; a second save used the revision-checked update path (revision 2).
- (b) Viewing as a non-admin, Settings shows Restricted access with no editor or Save button. Database, rolled back: a non-admin insert was refused by row-level security; a non-admin update changed 0 rows (`has_role` false, role `authenticated`). A refused save now shows "Only administrators can save the practice default." (shown with a simulated database refusal response).
- (c) Rolled-back new proposal received the current default (`masterCustomized=false`). The Hotel Chiado copy kept its own 25 mm margin after the default changed; Reset applied 20 mm and Practice default; a later override (25 mm) persisted after reload.
- (d) First-page variant: logo at X 60 / Y 20 mm, header on, footer off on page 1 only; pages 2–11 logo at 25 mm, matching the text margin at 25 mm.
- (e) 11 screen / 11 PDF pages and first block match on every page, before and after the override.
- Practice default restored to its prior state (no saved default; 0 rows). Real Hotel Chiado proposal/blocks hashes unchanged; 21 proposals, no QA rows remain. B1 untouched.
Files: src/lib/psa-proposal/use-master-page.ts; src/i18n/locales/{en,pt-PT}/common.json; this report.
