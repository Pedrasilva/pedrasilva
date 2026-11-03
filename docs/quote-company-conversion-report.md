# Client-company conversion correction — 3 November 2026

## Result
- Lifecycle checklist and conversion resolve `coalesce(quote.company_id, opportunity.company_id)`.
- Conversion stamps that company on both the quote and the new project in the existing guarded transaction, after validating the calendar preview.
- Opportunity company changes propagate only to non-converted quotes whose company is NULL or the old opportunity company. Explicit different companies and converted quotes are preserved.
- **Backfill: 2 quotes**, both Clínica Mint II family records (`b37ab9e5-2f64-4468-a1b7-9153a9c46543`, `37ebfc12-6717-474f-a5f4-5887706f7250`), received SMILEPROVIDER, LDA. No remaining NULL-company quotes with a company-bearing opportunity.
- Company/account/opportunity IDs and `created_at`/`updated_at` are excluded from the content hash and normalized snapshot comparison. This includes stage/payment/block timestamps, with identical live/snapshot normalization.
- Strict accepted-snapshot comparison remains authoritative and still rejects real content edits. Historical `accepted_content_hash` values were **not rewritten**; the legacy hash-equality check was removed from conversion because its previous normalization would invalidate existing legitimate acceptances. The full normalized accepted snapshot is checked instead, including the additional related quote tables.
- The missing-company checklist action opens the existing company picker inside the conversion dialog and saves the selection without navigating away.
- Step 3 always displays conversion; before acceptance it is disabled with **Registe a adjudicação primeiro**.

## Migrations
- `drizzle/migrations/0219_crm_quote_company_conversion.sql`
- Identical mirror: `supabase/migrations/20261103132000_crm_quote_company_conversion.sql`
- `drizzle/migrations/0220_crm_quote_snapshot_bookkeeping_parity.sql`
- Identical mirror: `supabase/migrations/20261103132200_crm_quote_snapshot_bookkeeping_parity.sql`
- 0220 corrects the quoting in the dynamically generated live-row timestamp normalization; both migrations were applied and their live behavior tested.

## Other changed files
- `src/routes/_app.crm.quotes.$quoteId.tsx` — inline picker, scoped save and lifecycle invalidation.
- `src/components/quotes/quote-publish-step.tsx` — permanent conversion card and acceptance gate.
- `src/i18n/locales/en/crm.json`, `src/i18n/locales/pt-PT/crm.json`.
- `scripts/test-quote-lifecycle.test.ts`.
- `scripts/quote-company-conversion/*.py` — retained authenticated disposable-copy setup, validation, conversion, inline-picker and cleanup scripts; temporary state belongs in `/tmp/browser/quote-company`.
- `AGENTS.md`, `roadmap.md`, this report and screenshots. Generated database types and migration metadata were refreshed by tooling.

## Verification
- **17 unit regressions passed**: 13 lifecycle and 4 payment-timing tests. Translation AST audit: **0 candidates**; automatic preview build: **OK**.
- Authenticated database/browser fixtures passed NULL inheritance, old-company propagation, explicit override preservation, converted-quote preservation, linkage/timestamp hash stability, timestamp snapshot stability, real block-content mismatch detection and opportunity fallback in the signed checklist.
- Real Mint's accepted snapshot matched after the linkage backfill and timestamp normalization; no real lifecycle transition or conversion was invoked.
- Disposable full Mint copy: quote company NULL, opportunity SMILEPROVIDER, current sent snapshot accepted and signed → checklist without missing client → actual start **21 December 2026** → holiday/office-closure calendar preview → project. Both quote/project company matched SMILEPROVIDER, and project sold fee remained **EUR 30,980 excluding VAT**.
- Separate minimal signed disposable quote: missing-company link → inline picker → SMILEPROVIDER selected → client checklist item disappeared while the dialog stayed open. Missing revision/Gantt remained blocked.
- Initial setup attempts hit required timestamp/private relative-schedule write restrictions; removed their disposable rows and used the application's automatically created relative schedule. No grants or security checks were widened.
- Signed-stage timestamp writes are themselves prevented by existing quote locks; timestamp invariance was tested before signing, followed by signed conversion. Lock safeguards were preserved.
- Account/opportunity ID exclusions are present in both live function definitions; individual account reassignment and multiple-user/concurrency scenarios were not separately exercised.

## Cleanup and preservation
- Final test quote `8f4f9e9d-e5fc-4d19-a415-db334177438c`, composer `297a6899-cfe5-4418-b83f-a17a18f90de3`, opportunity `40d191eb-08b1-40f5-a19e-17fb4a1301bf`, snapshot and project `2947a22c-aa8b-4860-a85b-8e9724f358a1` were removed. All minimal inline-picker attempts were removed too; zero `[QA DISPOSABLE]` quotes remain. No test PDF upload was needed.
- Readback after cleanup equals the post-authorized-backfill baseline for **every row** in fee_proposals, psa_proposals, psa_proposal_blocks, quote_stages and quote_payment_schedule_items. No additional real quote/company/content/value/timestamp changes occurred during the tests.
- The only authorized real-data change was the 2-row company linkage backfill (with normal audit timestamp updates). Mint remains signed and **not converted**, with the original accepted snapshot/hash retained. No proposal content, payment amounts or planning data were changed.

## Screenshots
Verified Portuguese captures in `docs/quote-company-conversion/`:
- `01-before-approval.png` — conversion visible and disabled before acceptance.
- `02-signed-checklist.png` — signed NULL-company quote resolves opportunity company.
- `03-calendar-preview.png` — actual date preview and EUR 30,980.
- `05-linked-quote.png` — converted disposable quote, company and project link.
- `07-inline-company-saved.png` — inline selection saved, dialog retained.