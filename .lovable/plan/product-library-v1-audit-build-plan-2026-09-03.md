# Product Library — V1 audit + build plan

## Audit of what already exists (and will be reused)

| Need | Existing Hub infrastructure | Verdict |
|---|---|---|
| Projects | `pm_projects` (code, name, client company, status) + `pm_project_team` | Reuse directly. No second project database. |
| File storage | Supabase storage buckets (`proposal-images`, `financial-documents`) with signed-URL helpers in `use-proposal-images.ts`; Google Drive connector used for *intake/sync* only (finance intake, HR benefit sync, backups) | Store product/finish images in a new `product-library` bucket using the exact proposal-image upload + signed-thumbnail pattern. Keep an optional Drive link/ID field per product for manufacturer PDFs — no new Drive folder machinery in V1. |
| Image components | `useProposalImages` / `useSignedProposalImageUrl`, image upload panel in the proposal composer | Reuse the pattern; new small `ProductImageUploader`. |
| XLSX export | `xlsx` package, `src/lib/inventory/exports.ts` builder pattern | Reuse identically for the consolidated schedule. |
| PDF / print output | Proposal print CSS + `offer-summary-sheet.tsx` (dedicated print sheet, landscape appendix breakouts already proven) | Reuse for the A4 landscape datasheet — browser print, no new engine. |
| Taxonomy | `inventory_categories` (self-referencing tree, admin-editable) | Mirror that shape in a new `product_categories` table (generic, not furniture-specific). |
| Navigation | `src/components/shell/nav-config.ts` rail + `ModuleTabs` | Add one rail item; no new shell code. |
| Permissions | `PermissionKey` list + v2 role/scope RLS helpers | Add `products.view` / `products.edit` / `products.library.manage`; RLS follows the standard authenticated-role pattern with GRANTs. |

**Conflicts:** none. Inventory (owned physical assets) and Product Library (specified products) stay separate — different lifecycles, no shared tables.

## Proposed data model (4 new tables)

Deliberately generic — `product` / `project_item` / `category` / `file`, so lighting, sanitaryware, finishes etc. drop in later with no rebuild.

- **`product_categories`** — id, parent_id, name, sort_order, active. Seeded with a small Furniture + Lighting tree.
- **`library_products`** — name, category_id, manufacturer, designer, material_spec, dimensions, indicative_unit_price, currency, price_last_updated, product_url, primary_image_path, finish_image_path, notes, status (`current` | `archived`), plus a `attributes jsonb` escape hatch for future category-specific fields.
- **`project_items`** — project_id → `pm_projects`, `source_library_product_id` (nullable, provenance only), then a **full snapshot** of the product fields (name, manufacturer, designer, category, material_spec, dimensions, images) + project-specific fields: reference/plan ID, location, selected_finish, quantity, unit_price, notes, product_url, approval_status, sort_order. `total` is computed in the UI/exports (qty × unit price).
- **`product_files`** — polymorphic (`owner_type` = product | project_item), kind (image | finish | document), storage_path or drive_file_id/url, label. Keeps future DWG/SKP/IFC additive.

Snapshot rule enforced by design: editing a project item never writes to `library_products`, and library edits never touch existing project items. One optional explicit action, "Update Library Product from this item", writes only on deliberate click.

## Screens (`/products`)

1. **`/products`** — project list: Hub projects that have items (plus a picker to start a new workspace on any project).
2. **`/products/project/$projectId`** — the workspace. Fast table of project items: thumbnail, reference, location, item, manufacturer, category, qty, unit price, total. Inline editing of reference/location/qty/unit price/finish, row actions Duplicate and Delete, search + category/location filters, sorting. Toolbar: Add Item, Browse Library, Export Datasheets, Export Schedule.
3. **`/products/library`** — visual card grid (image, name, manufacturer, category, indicative price); search by name/manufacturer/designer, category filter, current/archived toggle; "Add to project" from a card.
4. **Add Item** → two routes only: Browse Library, or Create New Product (one compact form, with a `Save to PSA Library` checkbox at the end).
5. **`/products/categories`** (admin) — small category manager.

## Outputs

- **Datasheet** — A4 landscape print view rendering one page per selected item (large image, project/location/reference, product data, finish, commercial line, notes, URL). Uses PSA proposal typography and the existing print CSS approach. Generated live from project items; no datasheet table.
- **Schedule** — XLSX via the inventory export pattern + a print/PDF table view. Honours the active category/location filters.

## Speed-of-entry commitments

Inline cell editing, duplicate row, keyboard-friendly quick add, no mandatory fields beyond item name, no approval workflows, no wizards. Target: 30–100 items entered comfortably.

## Explicitly out of scope for V1

BIM/Revit/IFC, procurement, purchase orders, deliveries, FF&E logistics, variants engine, price history, scraping, Archiproducts, NBS/classification standards, complex spatial hierarchy.

## Build order

1. Migration: 4 tables + GRANTs + RLS + seeded categories.
2. Data hooks (`src/lib/products/`) and types.
3. Rail/nav entry + route shell.
4. Library browser + product form + image upload.
5. Project workspace table with inline editing, duplicate, filters.
6. Datasheet landscape print view.
7. Schedule XLSX + print export.
