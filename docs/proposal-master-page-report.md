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
