## Current request — Translation batch 6 and sentence quality
- [x] Merge fragmented translated sentences and replace parenthetical plurals across prior namespaces.
- [x] Translate Finance UI and all remaining application UI; preserve documents, data, calculations and pending Finance proposals, with no migrations.
- [x] Prune resolved baseline signatures and report per-module/per-file and whole-app counts plus intentional exclusions.
- [x] Run i18n/regression checks and verify reconciliation/home in PT/EN with browser-local fixtures and screenshots only.

## Current request — Translation batch 5 (HR, Snapshot/payroll, Admin)
- [x] Translate UI and enum display labels, preserving official Portuguese terms, data and payroll calculations.
- [x] Prune resolved baseline signatures, run i18n checks and report before/after per file and intentional remnants.
- [x] Verify leave and payroll simulation in PT/EN with browser-local fixtures only; save screenshots and unchanged-input/calculation evidence.

## Current request — Translation batch 4 (CRM, Products, Inventory, Inbox)
- [x] Translate UI, indirect labels and locale formatting without changing stored values, documents or Finance.
- [x] Prune resolved baseline signatures, run i18n tests and report per-file counts and exclusions.
- [x] Verify company detail and project items in PT/EN using browser-local fixtures only; screenshots and document hash proof.

## Current request — Translation batch 3 (Quotes + proposal editor)
- [x] Translate editor-only controls, indirect labels and locale formatting; preserve document language and Finance work.
- [x] Replace abbreviated day durations with natural plurals.
- [x] Prune 691 resolved occurrences (746 → 55), run 11 i18n and 14 proposal regression tests; report per-file counts and exact document exclusions.
- [x] Verify authenticated disposable composer in PT/EN with identical document text hash, no runtime errors or live writes; bilingual screenshots in docs/i18n-batch3 and report docs/i18n-batch3-report.md.

## Current request — Translation batch 2 (Projects components + Planner)
- [x] Correct PT-PT AO90 and ordinary English remnants in projects/common.
- [x] Translate component UI, maps, counts and dates without behavioral or pending Finance changes.
- [x] Prune only resolved signatures, run test:i18n, report per-file counts and exclusions.
- [x] Check detail, Gantt and weekly planning in PT/EN on local disposable copies; bilingual screenshots.

## Current request — Translation batch 1 (Projects routes only)
- [x] Translate route-owned UI, constant labels and interpolated counts; preserve documents, behavior and pending Finance work.
- [x] Remove only resolved baseline signatures; run test:i18n and audit before/after counts.
- [x] Verify project detail, forecast and my-tasks in PT/EN on disposable browser copies; save bilingual detail screenshots and report exclusions.

## Current request — Portfolio identity review
- [x] Audited all nine live patched definitions: no stale capture/profile operational joins; draft project_id has no pm_projects FK.
- [x] Migration 0192 mirrored with missing/old/expected-pattern assertions and explicit internal_name source fallback; existing directory already supplied portfolio names.
- [x] Authenticated fixture recheck and Planner warnings verified; extended rollback SQL test and 41 unit tests passed; all fixtures deleted, original 17-draft full-row hash unchanged. Report docs/marketing-portfolio-review-report.md; Finance and translations untouched.

## Current request — Translation batch 0
- [x] AST UI checker, explicit document/brand exceptions, nine regression tests and tests/CI signature-count ratchet.
- [x] Corrected 72 unambiguous PT-PT values; English/Português picker labels confirmed; behavior and Finance untouched.
- [x] Baseline: 2,837 candidate occurrences in 220 files; per-module report and per-file findings saved in docs/i18n-batch0-report.md and docs/i18n-batch0-per-file.json; batch 1 not started.

## Current request — Marketing portfolio projects
- [x] Add Marketing-only project identities, preserve existing live identifiers and profile history, curator permissions and protected AI names.
- [x] Unified searchable pickers, portfolio creation/profile editing and optional live linkage; no operational project rows.
- [x] 41 tests, rolled-back identity/linkage fixtures and authenticated profile/capture creation verified; fixtures removed, migrations 0189–0191 mirrored; screenshots/report in docs/marketing-portfolio-report.md; Finance untouched.

## Current request — published reel video retention
- [x] Service-only persistent 30-day video cleanup in existing private job with daily gate; migrations 0187–0188 mirrored byte-identically, all other evidence preserved.
- [x] Cover/offline-original notice and live link in Published/Planner/Calendar; shared upload lock blocks reuse without new upload.
- [x] 40 unit/regression checks, rolled-back DB fixtures, actual disposable Storage removal/cover preservation and authenticated browser-only fixture card verified; fixtures removed, zero real claims/purges, Finance untouched. Report docs/marketing-reel-retention-report.md. Full callback intentionally not invoked because it can publish real drafts; published deployment uses cleanup after Luis publishes this version.

## Current request — finished reels
- [x] Private resumable video upload, shared validation, cover selection and manual caption assistance.
- [x] Normal hash-protected reel drafts, cover/feed publishing and preview integration; mirrored additive migrations 0184–0186.
- [x] Fixture video/JPEG upload saved and read back as suggested PT reel with project/clearance/cover; all four upload sessions, draft, request, files and project removed. Screenshots and report retained; no publishing or Finance edits. Sandbox Chromium lacks H.264 playback, so frame scrubber and voice/AI assistance remain unverified end-to-end.

## Current request — best posting times
- [x] Verified online_followers through authenticated application function: empty response, unavailable, 0 slots. Daily optional snapshots + RLS-scoped RPC; migration 0183 mirrored. 50 historical media, none in last 90 days; no AI.
- [x] Shared Lisbon hourly scoring, Calendar tints/drag suggestions and Insights grid; 33 fixture/mock tests and EN/PT parity pass. Authenticated week/Insights screenshots + remembered toggle verified; no real draft writes. Fixture browser drag simulation timed out and was stopped; real-data recommendations await data (0 recent posts/0 follower slots). No background test remains running.

## Current request — stale Story approval recovery
- [x] Restore normal direct/request approval for stale unsent drafts; hide publication until valid, preserve failure history and locks. Migration 0182 mirrored.
- [x] Fixture Story approved in authenticated browser, current render/approval hashes match, active failure cleared and old failure logged; colleague path/hash/counters/send lock verified in rollback test. 21 tests plus EN/PT parity pass. No real Story approval/publication or Finance edits.

## Current request — live clearance warnings
- [x] Batched unpublished rechecks and automatic source-change triggers; preserve content hashes, approvals and schedules.
- [x] Linked source warnings and curator-only append-only AI flag dismissal; original flags preserved.
- [x] 22 tests and rollback-only database fixtures passed; migration 0181 mirrored. Read-only Behind the hedge screenshot confirms project Cleared, capture Unknown and active AI flag; scheduled time/content/hash preserved. Finance untouched. Full live-browser dismissal not committed because immutable audit fixtures cannot be deleted.

## Current request — Marketing post language
- [x] Profile/platform defaults, run override, resolved generation/composer prompts and stored draft language; migration 0180 mirrored.
- [x] Manual translation into editor, language chips, accents verified visually; 19 tests and EN/PT parity pass. Disposable fixture translated/saved, ai_copy preserved, fixtures deleted; all real draft row hash unchanged.

## Current request — owner-authorized draft approval reversal
- [x] Reverted only 74d87598 to suggested at 22:23:13 UTC, using existing approval_sync to void approval; hash cleared, Luis/time/exact reason recorded in decision_note and retained approval comment. Transaction checked complete other-field and other-draft/approval equality.
- [x] Read-only authenticated browser confirmed Planner To review presence and zero target tiles in Calendar; screenshots in /tmp/browser/approval-reversal. SQL correction retained in docs/owner-requested-marketing-approval-reversal.sql; no schema changes. Clearly marked disposable fixtures only is now a permanent rule.

## Current request — Story burn-in
- [x] Browser renderer, sticker choices, private hash-bound manifest, approval integration and previews.
- [x] Publisher consumes matching rendered frames without changing locks or send boundaries.
- [x] Rendered failed real story only; two 1080×1920 frames, Calendar screenshot, 22 helper/calendar tests + 7 mocked pipelines + 19 media tests; migrations 0178–0179 mirrored; docs/marketing-story-burn-in-report.md. Sticker remains unresolved; no publish/retry/reschedule.

## Current request — editorial calendar portrait tiles
- [x] Weekly portrait tiles, compact month items, crisp whole-image previews and tile drag ghost; preserve quick preview.
- [x] Authenticated Tuesday 27 at 10:00: 104×130 tile from 400×500 preview, 10-slide quick preview and compact month verified; 12 regression tests pass, build OK. Finance untouched.

## Current request — whole-image Marketing previews
- [x] Diagnose three real originals: 4500×5625, EXIF 1; faulty 400×5625 strips; all below 25MB/50MP limits.
- [x] Explicit contain, versioned caches/files; overwrite regenerated 55 images in 7 captures; 13 missing-original failures preserved. Maintenance-only large-image fallback implemented.
- [x] Nine regression checks and authenticated Planner/Inbox screenshots verified; docs/marketing-preview-images-report.md saved. Finance untouched.
- [ ] Automatic oversized-original fallback during hosted intake needs an external image-processing service; maintenance fallback works outside the edge runtime. No existing source required it.

## Current request — Marketing advisory approvals (A only)
- [x] Save and apply mirrored migrations 0174–0175 removing readiness gates while preserving approval hashes and publication locks, including insert-time audit protection.
- [x] Enable direct/request approvals and add explicit named-client confirmation plus system-owned warning audit.
- [x] Browser-verify unknown-clearance approval and named-client dialog on disposable copies; SQL rollback verifies request/decision/schedule/publish eligibility and invalidation. Fixtures removed.
- [x] Save report in docs/marketing-advisory-copy-report.md; report available commit hash. More copy (B) deferred as requested; pending Finance changes untouched.

## Current request — confirmed June opening balances
- [x] Apply 11 audited openings with 31 May cut-off and CGD date; exact other-field equality verified, 14 audit rows.
- [x] Keep Coverflex benefits-only, June opening 1870.75 and read-only meal allowance suggestions; preserve Joana archive. Four unit tests and disposable cut-off rollback passed.
- [x] Verify PSA/PR UI totals after reload and June full-vs-reconciled scope; central settlement proposal only. Report docs/june-opening-balances-report.md.
- [ ] Bernardo move blocked by existing identical-checksum copies in target card; await approval to mark misplaced positive copies duplicate without deletion. No amount/checksum/status changes made.

## Current request — official bank identities
- [x] Verify/correct five company accounts and three card paying links without balance/movement changes.
- [x] Persist exact personal/condominium recognition, non-deletion and register/export exclusions; partner-transfer suggestions only.
- [x] Re-match eleven statements, test disposable rules, report each outcome.

- Aggregate Silver Empresas statements remain pending: paying accounts known, no unique card ID; no period invented. Detailed outcomes: docs/official-bank-identities-report.md.

## Current request — Instagram publishing stage 2
- [x] Service-only claims/checkpoints, hash/anonymity/clearance rechecks, private URLs, attempt log and durable feed; migrations 0147–0150 mirrored exactly.
- [x] Instagram containers, bounded validation, persistent send evidence, pre-send transient retry, bell/per-event emails and Vault-gated five-minute cron (288 checks/day); ambiguous sends blocked, no real test post.
- [x] Scheduling/admin confirmation/retry, status/permalink tiles, EN/PT and real 30-post live feed verified.
- [x] 19 unit checks, five full mocked pipelines, 11 rolled-back DB checks, nine calendar regressions; build OK, authenticated feed, unsigned callback 401, zero fixtures. Detailed report docs/instagram-stage2.md.
- [ ] Production callback awaits publication of this version by Luis; first real Instagram post not tested by request. Official exhaustive format tables unavailable: conservative support envelope and unrendered Story overlays fail explicitly.

## Current request — invoice PDF draft save only
- [x] Migration 0146 adds only an invoker transaction using queue.created_expense_id; explicit entity assignment before existing validation, extraction retained on original queue. RPC-only queue ID no longer enters document inserts; reopened PDF drafts reuse the link.
- [x] Real authenticated editor saved/reopened/resaved PSA copy; deferred confirmation issued the same document and filed the same queue. Pedra Rioja copy saved through the same RPC and reopened/resaved in the real editor. PDF/lines/raw extraction/entity/link preserved; 15 regressions and preview build passed. Two queue/two document/one project copies removed (all counts zero), original PDF/queue untouched, no payments/bank writes. Migration mirrored at supabase/migrations/20261022235500_issued_pdf_draft_queue_link.sql.

## Current request — anonymous Marketing approvals
- [x] Migration 0145 removes never_mention readiness blanket block; independent internal_only and pending/approved/scheduled trigger gates preserved.
- [x] Extended SQL regression passed with expected full rollback: clean colleague approval/scheduling, 15 exact-reason unsafe-content rejections and internal_only gates; nine calendar tests passed, live function definitions verified and mirror identical.
- [x] Current Project monitoring returns three findings: capture deletion media loss, Finance PDF draft queue_item_id and dated proposal Gantt holiday mismatch; unrelated to Marketing stage 1, left untouched.

## Current request — Meta connection verification
- [x] Token securely stored; authenticated server RPC checks has_role as caller before secret/Meta access. Graph v26.0 batch GET requests use POST bodies to prevent token-bearing URLs; only non-secret metadata returned/stored. No publishing.
- [x] marketing_settings migration 0143 applied and mirrored exactly in supabase/migrations/20261022221000_marketing_meta_connection_settings.sql. Marketing staff read, admin-only writes, no anonymous read/TRUNCATE; all public client TRUNCATE grants remain zero.
- [x] Real signed-in admin UI test and reload verified Page 1371527442865746, Instagram 17841400001084338 / pedrasilva_arquitectos, valid token with expires_at=0. Eight isolated unit tests and EN/PT parity passed; preview build OK. Server non-admin rejection tested with isolated handler, not a genuine second account browser session.
- [ ] Full permission checklist awaits Luis: token lacks business_management; other six requested permissions granted. No publishing or automated retry scheduled.

## Current request — CRM pipeline and active projects
- [x] Share direct/quote project linkage, deduplicated per project; all Won removed from board and retained through closed List.
- [x] Active/paused projects tab excludes archived projects, flags unconverted Won and offers conversion; multiple quotes require explicit choice and enter existing Sign & Convert workflow.
- [x] 14 CRM regressions, EN/PT parity and preview build passed. Signed-in disposable browser fixtures verified board, chooser, active/paused/unconverted rows and archived closed List; Overview Won 4/43000, open 22000 and weighted 11000 matched expected values. No runtime errors or commercial data writes; fixture browser destroyed. Actual project creation deliberately not invoked.

## Current request — shared project financial calculations
- [x] Introduce common planning, author-based saved-entry valuation, completeness and unrounded value-minus-cost profit primitives.
- [x] Align project detail, dashboards/reports, forecasts and fiscal project summary without changing stored data; retain distinct contract, earned, billed and cash scopes.
- [x] 76 regression checks passed, EN/PT parity and preview build OK. Browser-only disposable copy of 2506 reconciles 51.2 planned hours, €1667 planned cost/€2917 sale, €277 actual cost/€484 earned/€208 profit across Overview and Insights; five other financial/report pages opened without runtime errors. No database fixtures or real writes; isolated browser context destroyed. Full real multi-project fiscal/RLS matrix not re-exercised in this task.

# Weekly Timesheet Approval, Week Closure & Hours Bank

## Current request — historical documents, shareholder loans and duplicate preview
- [x] Six associations applied: four archived finance-only historical containers and Quelhas invoice/receipt; Quelhas client filled only if empty, receipt 14 link explicitly confirmed. No stages/quotes/counter changes. Dmitri/Bolshaya and ATB evidence shown in updated report without attribution.
- [x] Luis's two bank-backed transfers excluded from sales and linked to one 30000 shareholder debt plus existing MOV.OWNER category; original documents and payments untouched. 000 remains intact because its notes reference a 500 internal bank transfer, shown before altering.
- [x] Five duplicate groups previewed only (179774.35 reduction); proposed bank-backed payment allocations and non-deleted supersession need approval. Updated report in Files: sales received 548873.19 → 518873.19 after B; B+C hypothetical 339098.84. Eleven regression tests and disposable activation/stage/quote guards passed; fixture removed. Real document values/dates/numbers/status hash and all 379 payments preserved, Finance UI readback passed via navigation.
- [ ] Await Luis: confirm Dmitri/Bolshaya identity, clarify ATB, authorize 000 exclusion after bank evidence, approve or revise C's five groups. No correction of C is running or scheduled.

## Current request — revised issued-document associations and received audit
- [x] Associated Clínica Mulher January invoice, Groovesnore receipt 9 → Telheiras (historical invoice absent), Magnificent Fields invoice → Alcanena (existing receipt attribution + exact unique 2305 schedule milestone). Filled only empty company fields in Telheiras/Alcanena and empty displayed client names in those plus Clínica Mulher. Source-controlled data corrections 0142/0143 mirrored; 11 remain without demonstrable candidates across company/NIF, quote, opportunity, project names and available snapshots/contracts. No receipt invoice suggestions confirmed.
- [x] Read-only breakdown: 548873.19 = invoice payments 203819.99 + receipt payments 345053.20. Five strong overlap groups sum 179774.35 (ANSCA, CTT, BCG, Groovesnore, Magnificent); bank references themselves each used once, but manual invoice payments duplicate receipt-linked banking evidence. Includes 30000 transfers from Luis/suprimentos, not demonstrated sales. 11 finance_recebimentos are suggestions only, including two BCG suggestions for same bank line; excluded from 548873.19. Preserved exact 39-document immutable hash and all-payment hash; SQL guards preserved line values/all other project fields. Three project Billing readbacks passed after reload; Alcanena milestone 2305 and receipt excluded from billed. Ten regression tests passed; full report in Files. No received/payment correction made.

## Current request — real issued document project association
- [x] Audited 15 unassigned issued documents and all 16 portal projects. Assigned only paid Banco CTT FT 2026/12 (9c4c0219-4588-4917-87b1-abcf04401565) to 2522 (936b3ca5-6736-40ef-90f3-5381375beb7d) using existing authenticated fin_assign_invoice_project RPC: unique normalized client name across duplicate company rows; issue 09 Jun lies after project start and in June stage. No project/proposal schedule exists, so no line/milestone updates. Clínica Mulher issue 28 Jan predates project 01 Jun: left for confirmation; other invoices have no verified portal client-project link; nine receipts lack confirmed invoice links. Three suggestions unchanged.
- [x] Readback in project Billing shows FT 2026/12 and billed net 22103.68 (before 11904.68). Remaining 14 unassigned, zero unassigned cancelled. Only header project_id/updated_at changed: immutable document hash 7fc5c744591f6adbbb848068841d0bdc, payments hash 7bde048f1e5e8000a46e79babdfeda54 and all-lines hash 15f147094a8656aa5745e6a2b6e7aac3 unchanged; 39 docs/net 605785.15/gross 722208.22/received 548873.19 unchanged. Report covers all 15 and before/after billed net for five projects plus unassigned.

## Current request — invoicing screen verification
- [x] All six screen flows passed with disposable fixtures: PDF extraction/confirmation/milestone/reload, purchase refusal, manual registration/duplicate message, credit net reduction/original partial status, payment 100 received/269 outstanding, two milestones 100/200, Bernardo UI denial and server 42501. Fixed hidden project Billing tab and missing project PDF confirmation; migrations 0139–0141 mirrored. Ten regression tests and preview build passed.
- [x] Removed three test invoices, payment, queue rows, project/stage/two milestones and five PDF files; all cleanup counts zero. Original 39 document row hash unchanged during this verification; net 605785.15/VAT 116423.07/gross 722208.22 match prior approved audit. Current billed net 235310.87 and received 548873.19 (26 payments) preserved during tests.
- [ ] Historical pre-0132 billed/received comparison blocked: no pre-migration snapshot of those two metrics found; do not infer it from unchanged source or current totals.

## Current request — provisional invoicing
- [x] Audit/normalization explicitly approved; migrations 0132–0138 mirrored byte-for-byte. Original text, 39 records, €605,785.15 net/€116,423.07 VAT/€722,208.22 gross and all 15 unassigned documents preserved; 0 confirmed receipt codes/links, 3 suggestions.
- [x] Incomplete identification, CTT and FT 2026/2024 flags displayed; Finance project association and receipt link require explicit confirmation. No real project or receipt association performed.
- [x] Existing invoice editor supports series, original credit invoice and per-line milestone; atomic registration/edit, Finance permission and entity checks. Project billed totals exclude receipts/drafts/cancelled, subtract credits; earned remains unchanged, added billed/difference by stage.
- [x] SAF-T XML preview checks issuer, totals, exact identity and incomplete/flagged candidates before creation; existing completion needs selection/confirmation and retains original values/status/text/project/flags. Unsupported receipt fiscal codes remain pending. XML source/hash retained in document import metadata; private PDF extraction reuses existing intake.
- [x] 14 unit/regression tests passed; browser imported €100+€23 test invoice to disposable project, showed Already registered on repeat, read back after reload; XML, invoice/lines and test project deleted. Preview build OK.
- [ ] Actual customer SAF-T and broader concurrency/permission matrix await representative fixtures/validation. Six requested invoice screen flows and no-Finance server denial now verified; actual receipt-code reconciliation still requires fiscal evidence, never guessing.

## Current request — June 2026 vacation opening balances
- [x] Read-only current/proposed comparison for nine named people and unchanged balances for three excluded people; future approved requests included, Luis −8 and Ricardo Conceição −5 highlighted.
- [x] Luis approved; nine openings saved. Migration 0131 mirrored; leave map/calendar, availability, inbox and personal sheet share calculations; audited correction editor verified by save/reload. 2027 carry-over and 14 balance checks + 8 approval regressions passed; disposable fixtures deleted. Exact hashes of all 60 requests, 13 collaborators and 1550 timesheet entries unchanged.

## Current request — HR approvals inbox
- [x] Read-only request storage, approver checks and Patricia pending-balance diagnosis; mandatory leave rejection reason confirmed.
- [x] Approved plan implemented without changing approval and balance rules.
- [x] Unified inbox/menu badge, filters, decisions/bulk selection and deep links; leave-map request counts and PT action labels.
- [x] Server permission/certificate/reason checks passed with rolled-back fixtures; browser individual/bulk/reject/reload flows passed on disposable remote requests, all fixtures removed. Login preserves request link; Patricia counter is 1.

## Current request — proposal family numbering
- [x] Archived only VURAL tests 2665/2667/2668 and PSA QA tests 2608/2609; pipeline/open queries exclude archived rows, none deleted.
- [x] Read-only 2616 check: opportunity/title Hotel Alqueva uses proposal 2660, no client; Premium Fitness root 2661 remains unchanged. Family reassignment waits for Luis confirmation.
- [x] Migration 0127 preserves source numbers for revisions, root-locks revision allocation, unique number/revision and counter beyond 99; PDF cover uses translated number/revision without renumbering existing records.
- [x] Rollback-only copies passed numbering/uniqueness/fee/year assertions; signed-in browser created a same-number revision and read it after reload, no errors. Persisted browser copies deleted; migration mirrored; 9 regressions and i18n parity passed. PDF cover itself not visually tested.

## Current request — relative payment descriptions
- [x] Both payment block renderers normalize legacy snapshot descriptions without saving changes; browser checks passed for old EN/PT descriptions and unchanged calendar-mode text. No browser errors; build OK.
- [x] Replaced placeholder calendar dates in all generated payment descriptions (including grouped invoices) with relative week labels. Signed-in, write-blocked browser check and screenshot confirmed Week 1–25 without calendar dates; no saved dates or amounts changed, no browser errors, build OK.

## Current request — conflicting proposal fees
- [x] Traced €109,000 agreed fees, €119,900 additive advance, older €114,620 composer payments and inconsistent VAT exemption.
- [x] Corrected 2675's nine planned rows to €109,000 (advance €10,900 + 90% stage invoices), VAT zero, deduction enabled; all stage rows/hours/dates/statuses and unrelated quote fields verified unchanged. Shared composer amount/fee helpers and cache invalidation aligned; 14 tests and build pass.
- [x] Signed-in write-blocked browser copy showed matching Financial and document totals, then read back corrected saved rows; no persisted test copy. Explain differences in final response.
- Source audit: docs/2675-proportional-advance-data.sql records the scoped correction; platform rejects direct migration-file creation for data-only corrections (no schema migration applied).

## Current request — planning cut-off approved and applied
- [x] Implement deterministic own-task provisioning with existing access, retired 0h missing links and no merging; copy-only database cases passed including non-planner 19 October logging, month/lock/cost preservation and cutoff/undo.
- [x] Browser save/read after reload on persisted disposable copy as Luis: 1h15 on 19 October, retired 0h link, pending approval and snapshot verified; copy/activity removed. Non-planner check used database claims, not another person's browser session.
- [x] 60 focused regressions passed; clean preview build; migrations mirrored.
- [x] Prepared durable snapshot c34e66f5-5b87-4e19-b10d-8267cedd831c, 15 trim / 0 retire / 79 untouched, all removed planned hours 0; 3 October retainer links included, 7 CTT exceptions listed.
- [x] Final plan approval received; atomically shortened exactly 15 allocations to 16 October. Verified all other fields except audit timestamp unchanged and reconstructed full revision matches pre-cutoff across all allocations/stages/tasks/linked entries/holidays/publications. 79 allocations including 7 CTT exceptions untouched; no week approved. Snapshot remains available for guarded one-step undo.

## Current request — approved selective recovery and deletion safety
- [x] Compared 04:00 backup with all FK references and relevant columns: forecast/activity dependents were empty in backup and live; no additional lost rows.
- [x] Restored 448 exact rows atomically through one-shot admin function; existing triggers restored, FK constraints retained, full row equality and unchanged non-target hashes across 219 public tables confirmed. Recovery function disabled afterwards; all migrations mirrored.
- [x] Signed-in browser read-back verified 34 allocations,34 tasks,380 entries,1786.24h and 23 person/project totals. Project costs/hours derive live from restored rows; approved hours-bank movements and week snapshots remained unchanged, so no re-approval or ledger rewrite was needed.
- [x] Database guards block task/allocation/stage/project deletion with history regardless of caller visibility; allocation removal retires. Rollback-only disposable-copy tests passed four blocked deletes, retirement preservation and empty deletes; no copies remained.

## Current request — Gantt planned vs actual (plan first)
- [x] Read-only BCG screen and stored-data inspection: explain planned cost/fee/hours, leave badges, implied hours and planned-cost line.
- [x] Prepare weekly per-person actuals and stage-budget proposal; identify reused/replaced figures and double-counting risks.
- [x] Plan approved; implement opt-in read-only actuals layer without changing stored hours, costs or planning.
- [x] 93 tests and EN/PT parity pass; signed-in disposable browser-copy verified F3 144h / 362.68h / €12,219.68, F5 direct-parent 29h and child-only €20,291 fee, weekly outside-date tooltip, 60 trails, zoom and off/on. No data writes.
- Verification limits: copy was browser-only, not persisted; full permission-matrix and a real retainer copy were not tested. Narrow project shell retains existing limitations; no unrelated shell changes.

## Current request — homepage and menu weekly planning
- [x] Compact personal approved Mon–Fri AM/PM plan, numbered stages, HR/calendar days and current-week team link for all PSA staff; private revision drafts never shown as personal planning.
- [x] Planner-only next-week status/action and staff-visible Projects weekly-planning menu across rail, tabs and mobile; existing Projects access gates unchanged.
- [x] 48 unit/regression tests and EN/PT parity passed. Signed-in browser verified a disposable in-memory copy of real June project/board data: ten AM/PM slots, calendar days, unapproved empty state, both week links and View As read-only menu/tools. No database writes or real approvals. Card fits 390px; unrelated existing whole-homepage overflow remains outside scope. Genuine non-planner account not impersonated; existing View As mode checked.

## Current request — first real weekly use prerequisites
- [x] Rita Costa was already archived in HR since 16 May; deactivated her still-active planning resource, preserving HR history and bookings. Board read-back excludes her.
- [x] Approved Ricardo Conceição's 27 October leave through the existing HR approval button; weekly board read-back shows Tuesday leave and reduced capacity.
- [ ] Weekly draft, preview and approval await Luis's person/project/day assignments; do not invent the plan.

## Current request — visible assignments and safe first approval
- [x] Show zero-hour assignments and parent-stage warnings on board/Gantt without changing existing bookings.
- [x] List every removed/changed allocation and enforce extra approval acknowledgement in UI and locked database apply; block new parent-stage bookings while preserving legacy assignments and outside-week splits.
- [x] 37 focused tests and 11 rollback safeguard assertions passed; signed-in Rita/Mastercard copy showed five daily markers and the red changed-booking preview with extra confirmation. Copy and draft deleted; 16 original zero-hour bookings preserved; exact migration mirrored and preview build OK. No real week approved.

## Current request — approved financial security fixes
- [x] Address security-test review: PASS is inside DO after all assertions, both creator roles checked, shared company master data explained; disposable fixture rerun fails correctly on supabase_admin defaults, no PASS emitted.
- [x] Compare current and proposed financial reads for every account: only Teresa loses PSA tax-history access; no PSA collaborator loses access.
- [x] Tighten the three approved SELECT policies while preserving intended PSA access and administrator oversight; exact migration mirrored.
- [x] Public-table TRUNCATE and postgres defaults revoked; Luis accepted leaving platform-owned supabase_admin defaults unchanged. Every future public-table creation must revoke client TRUNCATE explicitly; test checks all public tables regardless of creator and postgres defaults.
- [x] Revised test rerun passed all 15 admin/PSA-finance/non-PSA row checks, no public-table client TRUNCATE grants and postgres-default assertions; platform-owned defaults excluded as accepted. All disposable fixtures rolled back; no real project/proposal writes.

## Current request — CRM zero-quote fallback and atomic milestones
- [x] Use estimated fee labelled Estimated when the active quoted total is zero or empty, consistently across cards and totals.
- [x] Scope confirmed: milestone dates/dragging only. Single-stage drags now explicitly use the same atomic moveStages save as multi-stage moves; typed dates retain the existing atomic cascade.
- [x] 23 focused unit tests passed. Signed-in temporary copy verified one atomic milestone/successor save and Undo read-back, then deleted; no database function changes.
- Verification limit: drag gesture/Undo button not exercised because the minimal project copy's Architecture view requires a linked quote; actual shared save/Undo tested from the signed-in browser instead.

## Current request — preserve quoted effort and fees on conversion
- [x] Inspect current rules: ordinary stages/allocations extend around the live calendar; quoted commercial totals are copied.
- [x] Approval checkpoint: add explicit conversion date shifts and effort/fee comparisons; Christmas-closure unit and rollback tests.
- [x] Approved: preview baseline vs live dates, working days, hours, stage fees; Christmas unit + rollback SQL test; one on-screen check.
- [x] Save confirmed 2027 holidays (no Carnaval).

## Current request — Gantt fixes and CRM relative timeline (plan first)
- [x] Luis's 16:25 UTC instruction: stop after the current run; report done / remaining issues / recommendation in at most eight lines. No new work, re-planning or extra verification until he replies.
- [x] Review the latest re-uploaded brief; present root causes, partial implementation status and remaining verification gaps.
- [ ] Await Luis’s approval of the renewed plan before further code or database changes.
- [ ] After approval only: complete retainer-percentage and monthly-payment date corrections, then finish isolated drag/dependency/conversion parity verification; preserve live records and weekly-board behaviour.
- [ ] Report fixed / verified / not verified; mirror every database change under supabase/migrations.
- Verified partial work: 29 scheduler tests, 5 leaf-fee tests and 17 weekly regressions; earlier signed-in isolated two-save/two-undo/two-redo read-back. Fresh rollback checks confirm €2,160 retainer payment and 2026-10-31 monthly collection preview/copy. Earlier regular/retainer conversion and fallback passed; fresh final live-record hashes and complete browser verification remain pending. Re-uploaded plan-first brief renews the approval checkpoint.

## Completed request — Tatiana absence corrections and weekly approval
- [x] Audited and removed Tatiana's 8h July 22 and 16h August 19; both recorded as approved full-day unpaid absences. Luis also authorized removing stale Vacation August 17–18 and adding Vacation August 24–27; working rows retained.
- [x] Approved all 20 Monday-start weeks June 1–October 12 and reconciled bank in one transaction, after rollback verification. Bank 0h → −40h: June 22 −4h, July 20 −8h, August 17 −8h, October 12 −20h. Each new absence contributes exactly 8h owed.
- [x] Five full removed rows audited as Luis with exact reason, 2026-10-17 14:59:44 UTC; costs removed €226.88 (two working entries), Vacation rows had no cost snapshot. Committed read-back confirms approvals, absences, audit and balance. Full-row comparison preserved unrelated entries/weeks/leave/banks, all resource rates, 37 cost periods and 94 allocations; no schema change or full rebuild/recalculate. Browser display/email delivery not verified.

## Completed request — attendance reconciliation
- [x] Add service-only audited admin correction safeguard preserving every timesheet row; pending sick leave can lack attachment, approval cannot.
- [x] Apply exactly six corrections in one transaction; four days skipped because logged hours meet/exceed expected hours.
- [x] Rollback fixture, certificate guard and non-admin rejection verified; all 1,410 timesheet rows and unrelated leave/bank rows unchanged. No affected approved weeks or weekly ledger movements exist, so no bank recalculation applies.
- [x] Exact migration mirrored under supabase/migrations; read-back verified. Patricia's certificate upload and later approval remain pending her certificate.

## Current request — approved Stage 3 implementation
- [x] Luis accepted decisions 1–8 and Tatiana-first sequencing.
- [x] Complete and verify Tatiana's isolated costing milestone first.
- [x] Implement atomic preview/publication, stage extensions, revision drafting and transactional bells exactly as approved.
- [x] Rollback verification and browser preview; preserve full rows of all 94 allocations, stage dates and actual hours; report verification limits.

## Completed authorized request — Tatiana internal costing
- [x] Implement salary-derived Backoffice cost without Backoffice share; retain her salary in Projecto overhead and report internal costs only as overhead analysis.
- [x] Backfill only Tatiana's 108 internal entries (720h, expected €10,117.20), verify before/after and unchanged 37 periods/all other entries. Authorized before Stage 3; no full Rebuild/Recalculate.

- Verification limits (Stage 3): no real week approved; authorized browser preview and discard only. Database transaction fixture covers 13 checks, plus independent overlap-lock rejection. No two-planner browser race or browser confirmation committed.

## Current request — retainer actuals and safe cost rebuild
- [x] Removed retainer cost estimates across task/direct/resource-detail paths; signed-in 0410B shows 335h / €11,569 and 0434 shows 20h (20.25 exact) / €750. Browser-only missing-snapshot responses show dashes and red warnings; no page errors. Seven regression tests passed.
- [x] Atomic service-only replacement and queue acknowledgement with shared transaction lock/revision; interrupted insert and successful forced rollback preserve full 37-row hash and entries/queue; a second session's attempt was rejected under a held lock. Exact migration mirrored. No committed rebuild/backfill/recalculate or timesheet/rate changes.
- [x] Tatiana proposal only: manual override or own-salary-only Backoffice rates with internal costs excluded from overhead-loaded project totals. Read-only hypothetical 108-entry / 720h backfill: 7 entries (56h) at €12.53, 101 (664h) at €14.18; €10,117.20. Subsequently completed the explicitly authorized scoped backfill: all 108 now have salary-only snapshots; all other entries and 37 periods unchanged.
- Verification limits: no real rebuild button or scheduled endpoint invoked; interruption tested as insertion failure after deletion, not worker/network termination. Source computation happens before the atomic locked write; stale period revisions are rejected. Tatiana costing/report aggregation subsequently implemented with regression tests.

## Current request — Stage 2 hardening
- [x] Narrow weekly-table grants, staff RLS boundary, immutable approved rows, slot audit trigger, validated private notes and stage dates; exact migration mirrored.
- [x] Deliberate brushes, banner errors/saved-draft reload, per-day stage choices, whole-stroke undo, extension ranges/server merge/deduplication, stage-only details and permanent dropped bookings.
- [x] Rollback access/guard/RPC tests and distinct approved-leave check passed; 26 unit tests, i18n and signed-in Gantt/empty/previous sources, painting/undo/recovery/extensions/details passed. No test drafts remain. Grant origin is live global postgres default privileges; sandbox_exec is platform sandbox tooling, unchanged. No Stage 3, allocation, stage-date, timesheet or cost writes.
- Verification limits: no genuine non-planner/nonstaff browser session; database checks use their real identities under authenticated role. Mixed candidate-day behavior unit-tested; no two-planner browser race or Stage 3 approval tested.

## Current request — targeted operational fixes
- [x] Weekly bell events verified in rollback; labeled 10-minute-old notification sent through real email path. Inbox receipt not independently confirmed.
- [x] Retainer missing-cost helper tests and real Telheiras totals verified; no missing retainer snapshots, no rebuild required.
- [x] Press-kit client-approval/internal-only/never-name checks and approval rejection verified in rollback.
- [x] Bank-derived confirmation persists matching account on queue/document in rollback; finance browser route redirects, so UI end-to-end remains unverified.
- [x] Inventory rules unchanged; all write entry points hidden. Editor screen and simulated no-edit screen verified; genuine non-editor session unverified.
- [x] Model usage/catalog reviewed without replacements; current in-use IDs are not marked deprecated. Report verification limits.

## Current request — weekly planning Stage 2
- [x] Mirror Stage 1 database objects and verify non-planner/non-staff access.
- [x] Add atomic draft creation/discard and planner-only slot autosave with conflict handling.
- [x] Build painting, stage resolution, undo/redo, comparison, notices and EN/PT.
- [x] Signed-in draft sources, painting, drag, whole week, erase, site visits, undo/redo, stage choice, null-stage notices, extension intentions, reload, comparison and discard verified; concurrency, leave/weekend rejection and failed-save retry verified. Test drafts removed. Stage 3 untouched.

## Current request — weekly planning Stage 1
- [x] Add additive allocation fields, protected week-plan tables and staff-only no-rates read RPC.
- [x] Build/test slot derivation and read-only person/project weekly board, navigation and EN/PT.
- [x] Signed-in board tested with real June allocations: both views, own-row highlight, leave denominator, no-rates response, colour controls, week navigation and 390px scroll; 13 rules, 7 pursuit tests, financial tests, translations and preview pass. All 94 allocations untouched. Stop before Stage 2.
- [x] Non-planner staff board and direct draft RLS verified in Stage 2: no drafts/brush, no financial fields; non-staff board refused and draft table reads return no rows.

## Current request — pursuit follow-up
- [x] Align calendar assignment choices and assistant wording with available pursuit leads; transcription had no outdated phrasing.
- [x] Export seven current live pursuit functions, trigger, column/backfill, FK and index; apply and mirror the migration with live grants retained.
- [x] Signed-in calendar excludes Office project and offers Uralchem IV; real assistant drafts 2h on Cabo Verde and Uralchem IV with exact IDs; all 24 directory rows unchanged; rolled-back live lost-deal insert rejected; 7 tests, i18n and preview checks pass. Existing lost-row display covered by helper test (no live lost deals); microphone recording not retested.

## Current request — pursuit choices
- [x] Add log-hours flag, compatible directory eligibility and allow won hours while blocking lost; 3 open deals backfilled.
- [x] Update timesheet/voice choices and CRM controls with EN/PT translations.
- [x] Verify switch persistence, on/off search, won save/read-back and active-linked exclusion; 6 rule tests and i18n pass. Temporary time entry audited and removed. Existing cost RPC and calendar/report consumers unchanged; no live project relinking or voice recording performed.

## Done
- Schema: `pm_timesheet_weeks`, `pm_hours_bank_entries` (RLS, audit fields, lock trigger, one additional-hours row per week).
- Capacity resolver from existing HR contract fields (daily hours x days per week) — never hardcoded 40h.
- Week totals kept separate: project / internal / leave / working / accounted; only working hours compared to capacity.
- My Week card on `/projects/timesheet` with submit + confirmation; submitted/approved weeks lock editing.
- `/projects/weekly-approval`: week navigation, completion/approval/exception stats, filters, roster table,
  review panel with breakdown, explicit additional-hours acknowledgement (capped at calculated excess),
  approve / return / reopen with reconciliation of the ledger row.
- Hours bank panel: ledger with running balance, compensation into leave (creates a pending
  `autorizada_paga` request with provenance in the notes), paid compensation, manual adjustment with reason.
  Shown on the collaborator profile (manage) and on My sheet (read-only).
- Navigation entries under Projects and Time. EN + PT-PT translations. Typecheck + i18n parity pass.

## Open / needs live data
- Submit -> approve -> reopen -> re-approve was not exercised against production rows (would mutate real data);
  verify with a real week before wide rollout.
- Approve writes the week row and the ledger row as two calls; if a follow-up ever fails the week is closed
  without its ledger row. Candidate for a single database function later.

# Stage envelope & task allocations (Project Dashboard)

## Done
- `src/lib/projects/use-stage-envelope.ts`: derived stage envelope — capacity hours
  (baseline target hours, else sale value / avg sale rate), allocated hours, planned cost
  (per-resource effective cost rate), target planned cost from target margin
  (stage baseline -> project baseline -> 50%), projected margin, variance.
  `excludeAllocationId` so edits only move the delta. Nothing stored.
- `pm_tasks.notes` (nullable) — the only schema change.
- Task dialog does add + edit: parent stage context, live before/this task/after,
  capacity and margin warnings (non-blocking), notes.
- Double-click or kebab on a task row opens edit mode; delete already releases capacity
  because every rollup is derived.
- Stage rows show allocated/capacity hours + progress bar; planned cost vs target cost and
  projected margin only with `projects.financials`.
- Validated: acceptance maths (100h / 40h -> 80h -> delete -> 110h over) exact; preview
  renders chips and edit dialog with real data, no console errors.

## Open
- Gantt task bars still use the existing allocation popover editor rather than the new dialog.
- Planned vs Actual comparison view intentionally not built yet.
- [x] Work from home: half days (full/morning/afternoon) + approval vs notification-only mode — verified in preview (declared entries bypass the queue, half day = 0.5 in analytics, hours derived from daily_hours)
- [x] Marketing: 500MB bucket, TUS uploads >6MB with progress, server-side sender

## Office calendar (holidays + closures)
- [x] Admin "Calendário do atelier": holidays per year + closures (yearly repeat)
- [x] Closure → approved férias with preview/confirm; interns without entitlement skipped; sick leave days skipped; part-time pro rata; insufficient balance flagged; refunds
- [x] Shared calendar (Gantt, weekly board, timesheet expected hours); Gantt shading
- [x] Live-project re-schedule preview/apply, propagating links with lags
- [x] 2027 holidays — confirmed and saved (14, no Carnaval)
- [x] Tests incl. hours bank closure week = 0 owed (full-time + part-time)

## Current request — weekly project and private week notes
- [x] Independent notes storage, PSA project reads and editor-only HR topics; dedicated permission in existing permissions screen, no grant made to Irene without selection.
- [x] Latest earlier carry-over and opportunity-history relink within existing quote conversion; original conversion body otherwise unchanged.
- [x] Below-grid autosaving boxes, slot participants, existing project/opportunity picker, revision conflicts and audit labels; EN/PT parity verified.
- [x] 18 unit/regression checks passed; rollback security checks cover team/private reads, dedicated grant, conflicts and conversion. Signed-in January 2099 project copy verified status/text autosave after reload, skipped-week carry-over and independent history. Test notes/project/stages/bookings/tasks deleted; zero fixtures remain. Migrations 0119/0120 mirrored byte-for-byte; preview build OK.
- [x] Relative timeline by default for open proposals (18 moved; 2608/2609 live and 2670 sent/locked kept dates)

## Current request — Marketing stage 1 (calendar, grid, colleague approval)
- [x] Drafts extended (scheduled_at, location tag, approval hash, new statuses); approvals table + RPCs + triggers; migration 0144 mirrored.
- [x] Calendar week/month with drag-to-day, warnings; Instagram grid; approval request/decision with bell + email; approvals page section; disabled publish button.
- [x] 9 calendar rule tests; rolled-back database scenario (A–I) passed; pages open signed-in without errors.
- [ ] Await Luis: existing readiness check treats every never_mention project as internal-only, so such posts can never be approved today; confirm whether to relax it to the new location/sector rule.
- [ ] Drag-and-drop not exercised on screen (no approved drafts exist); real approval email not sent in tests.

## Current request — Finance reconciliation stages A–D (sequential)
- [x] Stage A discovery reported; proposed queue statement fields + period→document/card link.
- [x] Stage A build (OK received): migration 0153 mirrored; intake reads kind/number/balances/totals/card fields with two-model check on balances; editable corrections with AI value + who/when; filing creates/updates linked period; registry with filters, grouping, duplicates, gaps, continuity, signed PDF, printed vs Hub green/red; Extratos uses statement balances or says none. 5 rule tests + rolled-back DB test (PSA+PR, account+card) passed; registry and ledger opened signed-in without errors.
- [ ] Existing 97 bank items were read before this change: they show 'Sem tipo' until re-read (not done automatically). Includes: printed opening/closing vs Hub opening+movements=computed closing and difference (green/red) in registry and statement view; Extratos uses statement balances when a statement exists, else says none.
- [x] Stage B: period window, lock/reopen with reason, one candidate pool searched in the database, card payment check. Entrada confirm-and-match in one step still opens Entrada (pending).
- [x] Stage C (ranking, split/partial, learned rules, review mode) + stage B one-step Entrada confirm-and-match.
- [x] Matching UX fix before stage D: single match panel, Apple 23,49 case ranked first (suggestions ~15 s → ~2 s), old match dialog removed.
- [ ] Stage D (audit record, Paid by/Received in, reconciliation log, supplier/purchase duplicates with confirmed merge) — waits for Luis's go.

## Open (23 Oct)
- [ ] docs@ catch-up: decide on discarding 6 second copies created by the interrupted catch-up run (awaiting Luis)
- [ ] Verify stages B/C on screen (17/09 LOVABLE 300 EUR -> 29/07 invoice first, no match)
- [ ] Stage D: two-way audit log with links, searchable 'Registo de reconciliações', possible duplicate suppliers/purchases with merge only after confirmation (old names kept as aliases, never delete documents)
- [ ] Intake failure alerts (3 failed runs / 48h nothing on working day) for docs@, Drive, ideas@

## Current request — docs@ copies, idempotent catch-up, stage D start
- [x] Six docs@ second copies removed from Entrada (originals and shared files kept), logged with approver/time/full rows; 16 docs@ items remain.
- [x] Email catch-up skips an attachment already queued from the same message with the same file hash.
- [x] Suggestions: one copy per Entrada document; per-movement cache + background refresh + period warm-up; on screen 0,83 s for 17/09 LOVABLE, 2467-9126 first at 87%, not matched.
- [x] 29/07 invoice present in the candidates list.
- [ ] Stage D proper: two-way audit log, searchable "Registo de reconciliações", supplier/purchase duplicate merge with aliases.
- [ ] Intake source failure alerts (docs@, Drive, ideas@).
- [x] End-to-end match-panel checks (scripts/e2e/match-panel-e2e.py): 12/12, all saves intercepted, 381 payments unchanged.
- [x] Read-only diagnosis of MBCP 006/2026 reported; no fixes applied (awaiting Luis).
- [x] Stage D: two-way reconciliation audit + searchable register, supplier duplicates with confirmed merge/aliases (purchases tab reused), intake source alerts (bell + email). 10 rolled-back DB checks + 7 alert-rule checks pass.
