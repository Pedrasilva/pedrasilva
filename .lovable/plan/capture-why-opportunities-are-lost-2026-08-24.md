# Capture why opportunities are lost

Today an opportunity can be moved to the "Lost" stage, but nothing records why — the opportunities table has no field for a loss reason. This adds a structured reason so lost work builds a usable dataset.

## What changes for the user

- When you set an opportunity's stage to **Lost** (on the detail page or via the pipeline board), a dialog asks for:
  - a **reason category** (price too high, lost to competitor, client postponed, no budget, no response, not a fit, other)
  - an optional **free-text note** with details
- The stage change only saves once the reason is confirmed; cancelling leaves the stage untouched.
- The opportunity detail page shows the recorded loss reason in the Summary card, with an option to edit it.
- Moving a lost opportunity back to an active stage clears the loss reason (and stamps nothing new).
- Reasons are stored with the date of the loss, so lost-work reporting can be built on top of them later.

## Technical notes

Database migration on `public.crm_opportunities`:
- `lost_reason_code text` (validated against the allowed category list via a trigger or text check on a fixed set)
- `lost_reason_notes text`
- `lost_at timestamptz`

No new table — the reason belongs to the opportunity, and a single set of columns keeps the existing pipeline value/rollup queries untouched. RLS already covers the table, so no policy changes.

Frontend:
- New `src/components/crm/mark-lost-dialog.tsx` with the reason select + notes textarea.
- `src/routes/_app.crm.opportunities.$opportunityId.tsx`: intercept the stage `Select` when the target is `lost`, open the dialog, and include the reason fields in the update mutation; render the recorded reason in the Summary card with an edit action; clear the fields when moving away from `lost`.
- `src/routes/_app.crm.opportunities.index.tsx`: same interception for drag/stage changes into the Lost column.
- Reason codes as a typed constant in `src/lib/crm/types.ts` alongside `OPPORTUNITY_STAGES`.
- i18n keys added to both EN and PT-PT `crm` namespaces in the same edit, following the existing `crm.*` key shape.
