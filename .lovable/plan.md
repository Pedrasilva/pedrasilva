## Goal
Mirror the structure of the reference Pedra Silva fee proposal (10 sections + cover) by adding **17 new master blocks** (EN + PT-PT) and a new **opt-in preset** ordering them in the document's reference sequence. All new blocks ship with **fully generic wording** (no firm names, addresses, partner names, or specific rates) so they're reusable for any architecture/interior practice.

## Reference document sections (and current coverage)

| Reference section | Existing block | New block to add |
|---|---|---|
| Cover / Intro | `intro-standard` | `psa-intro-interior-fitout` (opening line for fit-out projects) |
| About firm | `about-psa-standard` | — |
| §1 Project areas list | — | `psa-project-areas` |
| §1 Scope (Interior / Furniture / Signage) | `scope-generic` | `psa-scope-interior-design` |
| §1 Local-consultant clause | — | `psa-scope-exclusions-local` |
| §1 MEP / lighting paragraph | — | `psa-mep-lighting-note` |
| §1 LEED / BREEAM line | — | `psa-leed-breeam-note` |
| §2 Base information | — | `psa-base-information` |
| §3 Stages intro | — | `psa-stages-intro` |
| §3 Per-stage detail | (auto via `generated-stage-summary`) | — |
| §3 Timeline | (auto via `generated-timeline`) | — |
| §4 Fee intro | `fee-explanation` | `psa-fee-intro-inflation` |
| §4 Fee table | (auto via `generated-fee-summary`) | — |
| §5 Payment monthly cycle | `payment-intro`, `payment-stage-based` | `psa-payment-monthly-cycle` |
| §5 Payment table | (auto via `generated-payment-schedule`) | — |
| §6 Timelines & deadlines | — | `psa-timelines-deadlines` |
| §7 Additional services | `additional-services-standard` | `psa-additional-services-interior` (mentions per-3D-image charge generically) |
| §8 Travelling | — | `psa-travelling` (per-km, written approval, etc.) |
| §9 Exclusions | `exclusions-standard` | `psa-exclusions-interior` (fuller bullet list) |
| §10 Validity | `validity-period` | `psa-validity-30-days` (uses `{{validity_days}}` token) |
| §10 Acceptance + signature | `acceptance-wording`, `generated-acceptance-block` | `psa-closing-signature` (uses `{{firm_partner_name}}`/`{{firm_partner_title}}` tokens — both blank by default → cleaned by sanitizer) |

**17 new master blocks** × **2 languages** = 34 rows inserted. All `block_type = 'editable_text'`, `visibility = 'client'`, `is_active = true`.

## Files to change

### 1. `supabase/migrations/<ts>_add_psa_interior_proposal_blocks.sql`
- Pure `INSERT` statements into `proposal_blocks`. No schema change.
- Each block inserted in EN and PT-PT.
- Wording is **fully generic** — uses placeholders (e.g. *"travel outside the project's primary city is billed per kilometre or against receipts"*, never hard-coded "€0.50/km").
- Uses existing variable tokens where appropriate: `{{client_name}}`, `{{project_name}}`, `{{project_areas}}` (new), `{{stage_count}}` (new), `{{firm_partner_name}}` (new, blank by default), `{{firm_partner_title}}` (new, blank by default), `{{validity_days}}`.
- Idempotent via `ON CONFLICT (slug, language) DO NOTHING` so re-running is safe.

### 2. `src/lib/quotes/proposal-generator.ts`
- Extend `ProposalKind` union: `"fixed_project" | "phased_consultancy" | "psa_interior_fitout"`.
- Add `PSA_INTERIOR_BLOCK_SLUGS` constant in the reference document order:
  ```
  psa-intro-interior-fitout, about-psa-standard, psa-project-areas,
  psa-scope-interior-design, psa-scope-exclusions-local, psa-mep-lighting-note,
  psa-leed-breeam-note, psa-base-information, psa-stages-intro,
  generated-stage-summary, generated-timeline, generated-role-summary,
  psa-fee-intro-inflation, generated-fee-summary,
  psa-payment-monthly-cycle, generated-payment-schedule,
  psa-timelines-deadlines, psa-additional-services-interior,
  psa-travelling, psa-exclusions-interior, psa-validity-30-days,
  generated-acceptance-block, psa-closing-signature
  ```
- Update `pickSlugs()` to return this list when `proposalKind === "psa_interior_fitout"`.
- Extend `buildVariables()` with **generic, blank-by-default** keys:
  - `project_areas` (string, default `""`)
  - `stage_count` (derived from `ctx.stages.length`)
  - `firm_partner_name` (default `""` — sanitiser drops the dangling line if absent)
  - `firm_partner_title` (default `""`)
- All current variables remain untouched. Empty values fall through the existing `cleanupEmptyPhrases()` sanitiser.

### 3. `src/lib/quotes/use-generate-quote-proposal-document.ts`
- No new query needed — `pm_invoice_settings` is already loaded for `payment_terms_days`.
- Pass-through: when the kind is `psa_interior_fitout`, simply forward to the generator. No tenant-specific defaults pulled from settings (per user decision).

### 4. `src/components/quotes/quote-proposal-tab.tsx`
- Add a third option to the existing proposal-kind picker (already supports `fixed_project` and `phased_consultancy`):
  - **Label**: "Interior Fit-Out (full template)"
  - **Value**: `"psa_interior_fitout"`
- Picker default remains `"fixed_project"` so existing behaviour is unchanged.
- No layout/style changes — the new blocks render through the same `GeneratedDocumentSection` and `ProposalPrintDocument` we just refined for Preview/PDF parity.

### 5. `src/i18n/locales/{en,pt-PT}/crm.json`
- One new key in each: `proposal.kind.psaInteriorFitout`
  - EN: "Interior Fit-Out (full template)"
  - PT-PT: "Fit-Out Interior (modelo completo)"

## What this fixes / unlocks
- Generating a quote and picking "Interior Fit-Out" now produces a 23-block proposal that **matches the reference document's order and section coverage**.
- Stage detail, timeline, fees, role summary, payment schedule, and acceptance block remain auto-generated from the live quote data (no double-entry).
- Firm-specific details (address, partner name, exact rates, validity in days) stay editable per quote in the proposal editor — nothing is baked into code.

## Out of scope (explicitly)
- No schema changes to `proposal_blocks` or `pm_invoice_settings`.
- No edits to the existing default preset (`DEFAULT_PROPOSAL_BLOCK_SLUGS`) or the consultancy preset.
- No changes to the generic master blocks already in the library.
- No automated per-stage narrative generation. The auto stage table covers names, dates, and totals; if the user wants per-stage prose like the reference document's "[1] Workplace strategy …", they add free-text blocks manually after generation.
- No new logo/footer/styling work — that was done in the previous turn and remains unchanged.

## Validation
1. `bunx tsc --noEmit`
2. `node scripts/check-i18n-parity.mjs` — proves the new `proposal.kind.psaInteriorFitout` key exists in both EN and PT-PT.
3. `node scripts/test-proposal-substitution.mjs` — proves the new variables (`project_areas`, `firm_partner_name`, `firm_partner_title`, `stage_count`) clean up cleanly when blank.
4. SQL spot-check after migration: `SELECT slug, language FROM proposal_blocks WHERE slug LIKE 'psa-%' ORDER BY slug, language` should return 34 rows.
5. Manual: open a quote, switch the generate picker to "Interior Fit-Out", click Regenerate. Confirm 23 blocks appear in Preview in the reference order; print to PDF and confirm the same.

## Migration safety
- All inserts are additive and gated by `ON CONFLICT (slug, language) DO NOTHING`.
- Existing quotes already have generated documents stored in `quote_proposal_documents` / `quote_proposal_document_blocks` — those are untouched and continue rendering exactly as today.
- Users only see the new structure if they explicitly pick the new kind and click Regenerate.
