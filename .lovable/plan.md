# Inventory module — audit + build plan

## Part 1 — Audit of what already exists (and will be reused, not duplicated)

**Finance (source of truth for money)**
- `financial_documents` — supplier invoices already hold supplier, document number, issue date, totals, VAT, `file_path` (invoice PDF in the `financial-documents` bucket), payment status, OCR metadata. Inventory will reference these; no new expense ledger.
- `financial_document_lines` — already has `description`, `quantity`, `unit_price_ex_vat`, `vat_rate`, `amount_ex_vat`, `vat_amount`, `amount_inc_vat`, `sort_order`. This is exactly the invoice-line grain the asset register needs, so no line table is created.
- Document review queue / purchases workspace already parse invoices into lines — Inventory hooks in after that, it does not re-parse.

**Documents / storage**
- Existing buckets: `financial-documents` (invoices), `collaborator-photos`, `proposal-images`, `benefit-receipts`. Invoices stay where they are and are only referenced. One new bucket `inventory-photos` for asset photos and inventory-only docs (repair notes, warranty cards).

**HR**
- `collaborators` (name, photo, department, archived state) is the single people register. Assignments point at `collaborators.id`. No new person records.

**Suppliers**
- `companies` with `is_supplier` / `relationship_type` and NIF matching. Asset supplier = the invoice's supplier; no separate vendor table.

**Exports**
- `xlsx` is already a dependency, used elsewhere — reports reuse it for XLSX/CSV. PDF only where the existing print-CSS pattern applies.

**Risks / conflicts**
- Finance tables must stay untouched except for one additive boolean flag on `financial_documents` (`contains_inventory_assets`) used purely as a workflow marker.
- Duplicate asset creation is the main hazard; solved by a uniqueness-tracking table keyed on the source line (below).
- RLS: new tables get grants + policies matching the existing finance/HR permission model.

## Part 2 — New database objects (all additive)

- `inventory_categories` — code (LAP, MON, KBD, MSE, PWR, DOC, PHN, TAB, CAM, LNS, TRP, FLS, PRN, NAS, NET, FUR, OTH), name, default depreciation years, default replacement years, default tracking level, sort order. Seeded with the defaults given (Laptop 4y, Monitor 5y, Camera 5y, Lens 7y, Mouse 3y, Furniture 8y, etc.).
- `inventory_assets` — asset_code (unique, immutable), name, category_id, tracking_level (`major` | `standard` | `accessory`), brand, model, serial_number, description, photo_path, status (`available` | `in_use` | `spare` | `repair` | `retired` | `lost` | `disposed`), custody_mode (`person` | `shared` | `location`), assigned_collaborator_id, location, department, purchase_date, purchase_price_ex_vat, vat_amount, purchase_price_inc_vat, supplier_company_id, source_document_id, source_document_line_id, invoice_number_snapshot, warranty_expiry, depreciation_years, replacement_years, include_in_insurance_register, kit_id, notes.
- `inventory_kits` — kit name/description (Photography Kit 01); assets reference it, each keeping its own value and depreciation.
- `inventory_assignments` — asset_id, collaborator_id or location, assigned_on, returned_on, notes. Full history preserved; the asset row carries the current custodian.
- `inventory_asset_events` — immutable log: date, event_type (purchased, assigned, returned, repair, status_change, retired…), field, previous value, new value, actor, notes. Written by triggers plus explicit actions.
- `inventory_line_processing` — source_document_line_id, quantity_total, quantity_processed. Enforces duplicate protection: the review screen reads it to show "2 of 4 processed, 2 remaining", and a unique constraint prevents over-creation.
- `inventory_asset_documents` — either a reference to an existing `financial_documents` row (no re-upload) or an inventory-only file in the new bucket.
- `inventory_code_counters` — per-category sequence, consumed by a security-definer `allocate_inventory_code(category_code)` so codes are gap-safe and race-safe.
- Additive: `financial_documents.contains_inventory_assets boolean default false`.
- Book value is computed in the app (straight-line, `purchase_price / depreciation_years`, floored at 0) — no stored derived values.

## Part 3 — Finance → Inventory workflow

1. On a supplier invoice (documents detail and purchases workspace) a new action: **Send to Inventory**. It only sets the marker; it never creates an expense.
2. The review screen lists the invoice's existing lines: description, qty, unit price, plus editable category, tracking level, depreciation years, replacement years, and "create N assets" (defaults to remaining qty, 0 = skip).
3. Confirming creates one asset row per unit, each inheriting unit price, invoice, invoice line, supplier and purchase date, with its own asset code and blank serial number for later entry.
4. Already-processed lines display their processed/remaining counts and default to 0 new assets.

## Part 4 — UI screens

- New top-level module in the rail: **Inventory** (`/inventory`), with tabs Dashboard, Asset register, Assignments, Reports.
- **Dashboard** — active assets, total purchase value, indicative current value, in use / available / shared / in repair, due for replacement, warranty expiries, breakdown by category.
- **Asset register** — filterable table (category, status, custody, collaborator, location, insurance flag) with search on code/serial/model.
- **Asset detail** — identification, purchase block with links back to the invoice and its PDF, custody with assign/return/reassign, depreciation figures, kit membership, documents, and the full history timeline.
- **Assignments** — per-collaborator view of held assets plus quick assign/return; an "Assets assigned" card is added to the HR collaborator page reusing the same hook.
- **Reports** — Full register, Insurance register (flagged assets only, with the exact column list requested), By collaborator, By location, Replacement planning, Retired/disposed; XLSX + CSV export via the existing `xlsx` dependency.

## Part 5 — Sequencing

1. Migration: tables, grants, RLS, category seed, code allocator, history triggers, storage bucket.
2. Data hooks and asset-code/depreciation helpers.
3. Inventory routes: dashboard, register, detail, assignments, reports.
4. Finance invoice → inventory review flow.
5. HR collaborator assets card.
6. Rail/nav entry and EN + PT translations for every new string.
