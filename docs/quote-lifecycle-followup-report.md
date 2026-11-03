# Quote lifecycle follow-up — 3 November 2026

## Changes
- The shared lifecycle now reports whether the latest sent snapshot matches current content and which revision remains unsent. The header explicitly shows “Rev 01 por enviar — o cliente recebeu a Rev 00” and offers “Enviar Rev 01”.
- Acceptance explains mismatches before submission, disables acceptance for a non-matching snapshot and rechecks immediately before uploading evidence or accepting. The existing database snapshot guard remains intact.
- Approved proposals now use **Converter em projeto** as the header primary action, with signing secondary. The existing unsigned warning remains in the conversion dialog.
- Removed the composer overflow “Converter em contrato” stub and the signed-contract conversion detour. Project creation always uses the quote's existing guarded preview/conversion action.
- Manually choosing **Perdida** on an opportunity rejects its open, non-archived proposals through `crm_quote_transition(..., 'lose')` in the same transaction. Converted opportunities remain protected. The quote-to-opportunity trigger avoids recursive updates during that transaction; authorization is still verified in the database.
- Proposal retainers display **Mês 1–4 de obra** instead of a calendar anchor, including the summary. Monthly actuals stay hidden until conversion. Stored anchors, fees, allocations and dates are not rewritten by this presentation change.

## Migration
- `drizzle/migrations/0218_crm_quote_lifecycle_followup.sql`
- Identical mirror: `supabase/migrations/20261103114700_crm_quote_lifecycle_followup.sql`
- Only functions were changed; no migration backfill or existing-row updates.
- Generated database types and migration journal/snapshot were refreshed by the migration tool.

## Application files
- `src/lib/quotes/quote-lifecycle.ts`
- `src/components/quotes/quote-workflow-actions.tsx`
- `src/components/quotes/quote-publish-step.tsx`
- `src/components/quotes/retainer-stage-editor.tsx`
- `src/components/psa-composer/composer-top-bar.tsx`
- `src/routes/_app.crm.opportunities.$opportunityId.tsx`
- `src/i18n/locales/en/crm.json`, `src/i18n/locales/pt-PT/crm.json`
- `scripts/test-quote-lifecycle.test.ts`, root `AGENTS.md`, `roadmap.md`.

## Verification
- **16 regression tests passed:** lifecycle (12) and proposal payment timing (4).
- Translation parity passed for all 13 namespaces; AST audit found zero untranslated UI candidates. Latest automatic build: OK.
- Authenticated browser: disposable Mint copy with deliberately mismatching sent Rev 00 → explanatory banner/dialog → explicit PDF upload as Rev 01 → matching snapshot → acceptance → approved primary conversion → unsigned warning → preview with real start date **21 December 2026** → project. Fee remained **EUR 30,980 excluding VAT**.
- Proposal planning showed construction months 1–4 and no absolute reference-month input. Composer overflow had no contract-conversion action.
- Second disposable Mint copy: sent quote → manual opportunity dropdown **Perdida** → reason selected → saved → both opportunity and quote read back as lost. This specifically exercised the ordinary UI update, not a direct rejection shortcut.
- Both disposable quotes, proposals, companies and opportunities, the converted test project, test snapshots and uploaded test PDF were deleted. The before/after row counts returned to 36 quotes, 18 composer proposals and 414 blocks.

## Preservation finding
The comparison found no changes to any stored proposal content, commercial values or lifecycle fields. All 18 composer proposals and 414 blocks were byte-equivalent by parsed row comparison. Of 36 quote rows, 35 were fully identical; **Mint's `updated_at` alone changed** from `2026-11-03T11:50:43.513879+00:00` to `2026-11-03T11:57:51.481671+00:00` during the turn. No lifecycle action was run on real Mint and no content/value change accompanied that timestamp. Its cause was not established; the timestamp was not restored because that would require another unauthorized real-row write. This report therefore does not claim zero real-row writes.

## Screenshots
All captures use disposable copies and are saved in `docs/quote-lifecycle-followup/`:
- `01-unsent-revision.png` — Rev 01 unsent / client received Rev 00.
- `02-acceptance-mismatch.png` — upfront explanation and disabled acceptance.
- `03-approved-primary-conversion.png` — approved header actions.
- `04-unsigned-conversion.png` — unsigned warning.
- `05-relative-assistance.png` — construction months 1–4.
- `06-composer-menu.png` — no contract-conversion stub.
- `07-calendar-preview.png` — real start-date preview.
- `08-project.png` — linked project state.
- `09-lost-opportunity.png` — manually lost opportunity.

External client email/DocuSign delivery was not invoked or tested. A pre-existing signed contract was not created for these tests; the conversion detour was removed outright from the rendering code.