Add a "Reset + Import Template" button to the PSA Proposal Composer top bar that lets users replace all current proposal blocks with the blocks saved inside a quote template.

## What we will build

1. **Database function** — `psa_import_template_blocks(proposal_id, template_id)`
   - Deletes all existing `psa_proposal_blocks` for the proposal.
   - Reads `quote_template_blocks` + joined `proposal_blocks` for the selected template.
   - Inserts new `psa_proposal_blocks` as `custom_text` blocks carrying the saved title and HTML content (`content_rich.html`), preserving the template's sort order.
   - Returns the number of imported blocks.
   - Restricted to admins via `has_role`.

2. **React hook** — `useImportTemplateBlocks(proposalId)` in `src/lib/psa-proposal/use-psa-proposal.ts`
   - Calls the new RPC.
   - Invalidates `psa-proposal-blocks` and `psa-proposal` queries on success.

3. **UI component** — `src/components/psa-composer/import-template-dialog.tsx`
   - Opens from the top bar.
   - Lists active quote templates that have at least one saved block (`blocks_count > 0`).
   - Two-step flow: pick template → confirm replacement with a warning that existing blocks will be deleted.
   - Shows loading and success/error toasts.

4. **Top-bar button** — update `src/components/psa-composer/composer-top-bar.tsx`
   - New button placed between the status selector and the VersionsPanel button.
   - Hidden when the proposal is read-only (sent / locked).
   - Label: "Importar template" / "Import template".

5. **i18n** — add keys in both EN and PT under `crm:psa.importTemplate.*` (or equivalent) for the button, dialog title, description, warning, confirmation, and empty state.

## Out of scope

- No change to how quote templates are saved (the existing "Save as template" flow stays unchanged).
- No import of template stages, payment rules, or external services — only the proposal blocks are copied into the PSA composer.
- No attempt to map old block types to new PSA block types beyond treating saved content as editable `custom_text` blocks, which preserves the original HTML and formatting.

## Verification

- After the change, clicking the new button in a draft proposal opens the template picker.
- Confirming an import removes the previous blocks and replaces them with the template's saved blocks.
- The composer canvas refreshes automatically and the imported blocks are editable.
