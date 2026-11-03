# CRM proposal → project workflow

## Delivered
- Shared lifecycle reads reconcile quote status, sent snapshots, approval, signature and linked project.
- Header presents the next action; acceptance records a date, note, selected sent revision and optional evidence.
- Conversion accepts approved or signed quotes, warns about unsigned contracts and requires a company, accepted revision and Gantt.
- Accepted revision source rows must match the current commercial data; mismatches block acceptance/conversion rather than overwrite content.
- Opportunity stage follows quotes: sent → negotiation; approved/signed/project → won; rejected → lost.
- Duplicate signature/revision controls were removed; revisions remain in the overflow workflow.
- Documents display actual sent snapshots and their actual revision numbers, never a fabricated current revision.

## Important finding on real Mint
The real quote remains unchanged: its stored quote status was draft while its composer was sent. The shared lifecycle now displays sent. The actual stored sent PDF is Rev 00; no sent Rev 01 snapshot exists. This implementation does not relabel that PDF as Rev 01 or send the current revision automatically. Sending Rev 01 still requires the user's explicit action.

## Migrations
- `drizzle/migrations/0216_crm_quote_lifecycle_acceptance.sql` mirrored byte-for-byte in `supabase/migrations/20261103110000_crm_quote_lifecycle_acceptance.sql`.
- `drizzle/migrations/0217_crm_quote_accepted_snapshot_guard.sql` mirrored byte-for-byte in `supabase/migrations/20261103111500_crm_quote_accepted_snapshot_guard.sql`.

## Files
Shared lifecycle: `src/lib/quotes/quote-lifecycle.ts`, `use-quote-lifecycle.ts`, `use-quote-signature.ts`.
Workspace: `src/routes/_app.crm.quotes.$quoteId.tsx`.
Quote UI: workflow actions, stepper, publish step, signature card and lock guard under `src/components/quotes/`.
Composer: `composer-top-bar.tsx`, `composer-shell.tsx`; sent revision hook `src/lib/psa-proposal/use-proposal-revisions.ts`.
Documents: `src/components/crm/opportunity-documents-card.tsx`.
Translations: EN/PT CRM dictionaries. Architecture rule: root `AGENTS.md`.

## Verification
- 19 tests passed: lifecycle (9), relative timing (4), programme (3), advance (3).
- Translation parity passed in 13 namespaces; AST audit found zero new untranslated UI candidates.
- Browser tested sent → accepted → signed → project on disposable copies. Second copy exercised the actual PDF upload/send dialog, followed by acceptance, signature and conversion with the accepted-snapshot guard active.
- Start date 21 December 2026 produced live working-calendar stages and payment dates. Total remained **€30,980 before VAT**: €2,570 + 3 × €7,710 + 4 × €1,320.
- Browser reported no page errors. Latest automatic build: OK.
- Both disposable quotes, proposals, opportunities, companies and projects were removed; uploaded test PDF removed. No real proposal was transitioned.
- Unsigned conversion warning was exercised; external contract signature delivery and all missing-checklist permutations were not exercised end-to-end.

## Screenshots
Captures are in `docs/quote-lifecycle/`: `01-draft.png`, `02-sent.png`, `03-acceptance-form.png`, `04-approved.png`, `05-unsigned-checklist.png`, `06-signed.png`, `07-calendar-preview.png`, `08-project.png`.