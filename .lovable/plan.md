
# Fix Create Quote workflow + Workplace template content

## What's actually wrong

The "Create Quote" you trigger from an Opportunity is **not** `QuickQuoteDialog` (the one I cleaned up last time). It's a second, inline dialog inside `src/routes/_app.crm.opportunities.$opportunityId.tsx` (around line 460+). That dialog:

1. Still shows **3 cards** — Project Proposal / Time-Based / **Construction Retainer**.
2. Has **no template picker at all** — it just inserts a blank `fee_proposals` row and drops you into the empty quote builder.
3. Never calls `quote_instantiate_template`, so stage names, fee rules and proposal blocks are never pre-filled.

That's why you see the old behavior. Also, the 6 seeded templates (Workplace Large/Small, Health Clinic, Dental Clinic, Hotel, Residential) currently have **stages only** — `quote_template_blocks` is empty for all of them, so even when a template is used, the proposal body comes up generic.

## Fix plan

### 1. Make the real entry point match the screenshot flow

In `src/routes/_app.crm.opportunities.$opportunityId.tsx`:

- Remove the `retainer` card from `categoryCards` (drop the `Wrench` import too). Switch the grid from `sm:grid-cols-3` to `sm:grid-cols-2`.
- Turn the dialog into a **2-frame flow** (matches your screenshot arrows):
  - **Frame 1 — Proposal type:** the 2 cards. "Next" enabled once a type is picked.
  - **Frame 2 — Template:** reuses `<QuoteTemplatePicker category={form.quote_category} />`. "Blank" remains an option (so non-workplace work isn't blocked), but the list of templates for the chosen category is shown front-and-centre. "Create" button lives here.
- On submit, after the `fee_proposals` insert, if a template was picked call `useInstantiateQuoteTemplate({ quoteId, templateId })` before navigating — same pattern already used in `QuickQuoteDialog`. This is what makes the Gantt, fee table and proposal body load pre-filled.
- Keep `QuickQuoteDialog` aligned (already 2 cards; add the same 2-frame UX so both entry points behave identically).

### 2. Seed Workplace master proposal content

Parse the uploaded `Template_workspace_V1.docx` and load it into `quote_template_blocks` so the proposal body of any Workplace-based quote is pre-filled.

- Map the document's sections into `proposal_blocks` rows (one per section: Cover Letter, Scope, Phase Narratives 1–7, Key Tasks per phase, Deliverables per phase, Coordination & Approvals, Fee Proposal intro, Payment Terms intro, Timeline intro, Exclusions, Attachments I/II/III intros, Validity).
  - `language = 'pt-PT'` if PT, plus EN duplicates where the docx has both; `block_type = 'editable_text'`; `visibility = 'client'`; `project_type_tags = {office}`.
  - Phase narratives reference stages by the same `stage_temp_key` already seeded, so editing a stage name in the quote relabels the narrative heading automatically (single source of truth — no duplicated static text).
  - Inline placeholders for live data (e.g. `{{client.name}}`, `{{stage.duration}}`, `{{stage.fee}}`, `{{role.rank}}`) using the existing placeholder catalog in `src/lib/proposal-assembly/placeholders/catalog.ts`. Any new tokens get added there.
- Link them to both Workplace templates (`Workplace / Office — Large` and `— Small`) via `quote_template_blocks` with stable `sort_order` matching the docx outline.
- Idempotent migration: skip insert when a block with the same `slug` already exists; skip the link when `(template_id, proposal_block_id)` already exists.
- Stretch (only if straightforward): light cloning of the same block set for Health Clinic, Dental Clinic, Hotel, Residential (same structure, different `project_type_tags`). If the docx text isn't a good fit for those, leave them with stages-only for now and we add their masters in a later turn.

### 3. Verification before handing back

- New quote from an Opportunity → 2 cards only → template step appears → picking Workplace Large pre-fills stages in Gantt, fee table, payment schedule and proposal blocks.
- Renaming a stage in the quote updates the matching phase heading in the proposal (no duplicated static text).
- `QuickQuoteDialog` shows the same 2-frame UX.

## Technical notes (for reference)

- Files touched: `src/routes/_app.crm.opportunities.$opportunityId.tsx` (dialog refactor), `src/components/crm/quick-quote-dialog.tsx` (mirror 2-frame UX), one new SQL migration that inserts `proposal_blocks` + `quote_template_blocks` rows, possibly a small addition to `src/lib/proposal-assembly/placeholders/catalog.ts` for any new tokens.
- No new dependencies. No changes to the calculator, Gantt engine, external services, payment schedule or financial summary — only the entry dialog and the seed content.
- The `quote_instantiate_template` RPC and the workspace renderers are already wired; once blocks exist, they show up automatically.

## Out of scope (handled by later milestones, per the existing plan)

- M3 payment-group toggle (Design vs Construction; architecture ↔ external services merge).
- M4 Construction Assistance retainer maths and HR-rank rollups in the fee table.
- M5 cross-template content for Hotel / Health / Dental / Residential masters.

Approve and I'll execute steps 1 + 2 in a single pass.
