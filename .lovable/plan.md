
# PSA Proposal Composer — Build Plan

A CanvaDoc/Notion-style composer that reproduces the PSA Word proposal structure (cover → acceptance) with a 3-pane layout, draggable reusable blocks, live Quote Builder data references, and PDF export. Contract-aware data model now; Contract Composer later.

There is significant existing proposal infrastructure in this repo (`proposal_blocks`, `quote_proposal_documents`, `quote_proposal_document_blocks`, `proposal-assembly`, `proposal-rendering`, `proposal-ontology`). Per your "start from scratch" instruction, I will build the Composer as a NEW, parallel surface that does NOT touch the existing builder. New tables, new routes, new components. Old proposals keep working untouched.

---

## 1. Data model (new tables, additive)

```
psa_proposals
  id, quote_id (nullable FK), title, status (draft/review/sent/accepted),
  client_snapshot (jsonb, frozen on send), project_snapshot (jsonb),
  vat_mode, language, created_by, created_at, updated_at, sent_at

psa_proposal_blocks
  id, proposal_id, sort_order,
  block_type (cover|index|about|scope|stage_list|stage_item|timeline|
              consultants|fee_table|construction_fee|payment_terms|
              payment_schedule|additional_services|general|suspension|
              exclusions|acceptance|custom_text|page_break),
  title,
  source_type (manual|library|live_quote|mixed|contract_clause),
  source_ref (jsonb — e.g. {kind:"stage", stage_id:"…"}),
  content_rich (jsonb — TipTap doc for manual/mixed body),
  contract_relevance (proposal_only|contract_relevant|both|internal_only),
  is_visible bool, is_locked bool,
  created_at, updated_at

psa_block_library
  id, kind (matches block_type), label, default_title,
  default_content_rich, default_source_type, default_source_ref,
  default_contract_relevance, sort_hint, is_system bool

psa_proposal_audit
  id, proposal_id, actor, action, payload jsonb, created_at
```

Grants: `authenticated` full CRUD on proposals + blocks scoped by RLS (creator/admin); library is read-only for `authenticated`, write for admin.

Seed `psa_block_library` with the 17 default blocks in the PSA order.

## 2. Live-data resolver

Pure module `src/lib/psa-proposal/live-data.ts` that, given a `quote_id` and a `source_ref`, returns the resolved value. Reads from existing tables: `fee_proposals`, `quote_stages`, `quote_external_services`, `quote_payment_schedule_items`, `quote_supplier_phase_splits`, `crm_opportunities`. No writes. Returns a `{value, label, missing[]}` shape so the UI can show "missing data" badges.

Resolvable refs:
project_number, project_name, client, date, location, project_description, scope,
stages[], stage(id).{duration,fee,hours}, total_architecture_fee, consultants[],
supplier_fees, timeline_gantt, payment_schedule[], vat_status, monthly_fees,
construction_stage_fees, exclusions.

## 3. UI surfaces (all new — old builder untouched)

New route: `/crm/quotes/$quoteId/composer` and standalone `/proposals/$proposalId/composer`.

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar: title • status • Preview PDF • Export PDF • Save    │
├──────────────┬──────────────────────────┬───────────────────┤
│ Block Library│  Canvas (A4 pages)       │ Block Settings    │
│ (search +    │  - PSA header/logo       │ - title           │
│  17 defaults │  - numbered chapters     │ - source_type     │
│  + custom)   │  - blocks vertically     │ - source_ref      │
│  drag to add │  - footer + page #s      │ - content editor  │
│              │  - drag to reorder       │ - relevance flag  │
│              │  - dnd-kit               │ - visible / lock  │
│              │                          │ - duplicate /del  │
└──────────────┴──────────────────────────┴───────────────────┘
```

Components (`src/components/psa-composer/`):
- `composer-shell.tsx` — 3-pane layout
- `block-library-panel.tsx`
- `canvas.tsx` — paginated A4 view, dnd-kit reordering
- `block-settings-panel.tsx`
- `top-bar.tsx`
- `blocks/` — one renderer per block_type (cover, index, about, scope, stage-list, stage-item, timeline, consultants, fee-table, construction-fee, payment-terms, payment-schedule, additional-services, general, suspension, exclusions, acceptance, custom-text, page-break)
- `relevance-badge.tsx` — colour-coded proposal-only/contract-relevant/both/internal

Each block renders its `live_quote` refs through the resolver. Mixed blocks combine TipTap rich text with inline `<DataRef refId="…"/>` placeholders.

## 4. PSA visual chrome

- A4 page (`210mm × 297mm`), print CSS, white background, black serif body for marketing chapters, sans for tables.
- Fixed header band: PSA logo (existing asset) + contact line on the right.
- Footer: studio address + auto page numbers.
- Numbered chapters (1. Cover excluded, 2. Index, …) computed from block order, skipping `cover`, `acceptance`, `page_break`.
- Table-based fee/payment sections matching the current Word layout.

## 5. Default proposal preload

When a proposal is created from a quote, server fn `psa_proposal_bootstrap` clones the 17 system library blocks in canonical order, attaches default `source_ref`s (live_quote where applicable), and copies the quote's client/project snapshot into `psa_proposals`.

## 6. PDF export

Use existing print pipeline pattern (like `gantt-print-button`): open a `/composer/$id/print` route that renders the canvas in print-mode-only CSS, then `window.print()` with a small dialog offering "Preview" and "Export" (browser save-as-PDF). No server-side PDF dep added.

## 7. Out of scope (explicit)

- Contract Composer — not built. `contract_relevance` flag and `psa_proposal_blocks` shape are designed so a later `contracts_from_proposal` job can read `contract_relevant`/`both` blocks.
- Migration of existing `quote_proposal_documents` data into the new composer. The two coexist.
- E-signature.

---

## Technical details

Stack: TanStack Start routes, server functions in `src/lib/psa-proposal/*.functions.ts` with `requireSupabaseAuth`. TipTap for rich text (already common shadcn pattern; will install `@tiptap/react`, `@tiptap/starter-kit`). dnd-kit for drag/drop (already in repo for Gantt WBS).

Phasing (so I can land it incrementally rather than one mega-commit):
1. Migration + seed library (DB only).
2. Composer shell + canvas + block list, no editing, with bootstrap from quote.
3. Block settings panel + per-block live-data resolver + visibility/lock/duplicate/delete.
4. PSA chrome (header/footer/numbering/A4) + print route + PDF export.
5. Polish: missing-data badges, status workflow, audit log entries.

I'll start at step 1 (migration) once you approve.

---

## Questions before I start

1. **Quote linkage**: should every proposal require a `quote_id`, or do you also want standalone proposals (no quote attached, all manual)?
2. **Rich text engine**: TipTap OK? It's the standard match for the Canva/Notion feel. Alternative is a plain `<textarea>` per block.
3. **PDF route**: browser-print (free, instant, matches Gantt PDF button you liked) vs. server-side renderer (heavier, pixel-perfect). I recommend browser-print for v1.
4. **Existing proposals**: leave the old `/crm/quotes/$id` proposal builder fully intact and add the composer as a separate "Composer" tab/button — confirm?
