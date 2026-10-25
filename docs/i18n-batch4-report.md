# Translation batch 4 — CRM, Products, Inventory and Inbox

## Result
- Scoped AST candidates: **344 → 14**; **330** resolved baseline occurrences removed. No baseline entries were added or increased.
- Interface translations only, EN / AO90 pt-PT, with interpolated plurals and display-only status/color/activity maps. Stored names, categories, manufacturers, locations, honorifics, notes and enums remain untouched.
- CRM and Product UI money formatting uses a separate browser-safe wrapper with the original null handling and precision (CRM 0 decimal maximum; Products 2); document formatters and all calculations remain unchanged. Numeric editing inputs retain raw numeric serialization, to avoid changing saving/parsing behaviour.
- No database changes or migrations, and no Finance module files were edited.

## Verification
- `npm run test:i18n`: 11 checker tests, EN/PT parity and ratchet passed.
- Authenticated browser-local company/contact/project/item/category fixtures only. Zero submitted/blocked record writes; no create/save/delete/publish/export/print commands were invoked. Fixtures existed only in the disposable browser context.
- Company detail and project item table inspected in PT/EN, plus the item edit sheet in EN; no runtime errors or raw keys. Stored names and document prose remain Portuguese in both views.
- A client datasheet was rendered directly in a browser-local React root with the same fixture data, never by invoking the print action. Normalized document text was identical in PT/EN: SHA-256 **aaae3f199276ec01de9ecbf0f7679f278a898994202b9b58d99acb03e8deb251**.
- Source-document integrity: src/components/products/datasheet-sheet.tsx: byte-for-byte unchanged (32f81ad4729d797b2650293d2373c7b9f31949eb42028fc8bef1e0ff023efc25); src/components/products/schedule-print-view.tsx: CHECK REQUIRED (e09c8ab58807eed7d5b4afd06be906587fde1003b2abeadd78d93a4b5f2b7233).
- Screenshots: [company PT](i18n-batch4/company-pt-PT.png), [company EN](i18n-batch4/company-en.png), [items PT](i18n-batch4/items-pt-PT.png), [items EN](i18n-batch4/items-en.png), [item sheet EN](i18n-batch4/item-sheet-en.png).

## Explicit exclusions and intentional remnants
- `schedule-print-view.tsx` keeps its existing whole-file client-print exclusion.
- `datasheet-sheet.tsx` has explicit function scopes: DatasheetPrintView, Row, SheetImage, FinishPanel. These contain client output only, not editor controls; labels, signature fields, sample attachment wording, quantities and money output stay unchanged. The file itself is not excluded, so future editor UI outside those functions remains scanned.
- 14 remaining scanner candidates are technical comparison/default tokens, not displayed text:
  - src/components/crm/company-projects-tab.tsx:109: `company` (jsxExpression)
  - src/components/products/image-field.tsx:115: `small` (jsxExpression)
  - src/components/products/library-browser.tsx:131: `archived` (jsxExpression)
  - src/components/products/product-form-dialog.tsx:267: `project` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:402: `overdue` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:407: `soon` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:420: `won` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:420: `lost` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:461: `lost` (jsxExpression)
  - src/routes/_app.crm.opportunities.$opportunityId.tsx:984: `project` (jsxExpression)
  - src/routes/_app.crm.quotes.$quoteId.tsx:576: `publish` (jsxExpression)
  - src/routes/_app.crm.quotes.$quoteId.tsx:624: `estimate` (jsxExpression)
  - src/routes/_app.inbox.index.tsx:286: `number` (jsxExpression)
  - src/routes/_app.products.project.$projectId.tsx:207: `undefined` (jsxExpression)

## Counts per file
| File | Before | After |
|---|---:|---:|
| src/components/crm/account-suggest-field.tsx | 0 | 0 |
| src/components/crm/activity-timeline.tsx | 11 | 0 |
| src/components/crm/company-detail.tsx | 59 | 0 |
| src/components/crm/company-picker.tsx | 0 | 0 |
| src/components/crm/company-projects-tab.tsx | 9 | 1 |
| src/components/crm/contact-picker.tsx | 0 | 0 |
| src/components/crm/crm-shell.tsx | 0 | 0 |
| src/components/crm/mark-lost-dialog.tsx | 0 | 0 |
| src/components/crm/new-company-dialog.tsx | 38 | 0 |
| src/components/crm/opportunity-activity-timeline.tsx | 0 | 0 |
| src/components/crm/opportunity-documents-card.tsx | 1 | 0 |
| src/components/crm/quick-quote-dialog.tsx | 0 | 0 |
| src/components/crm/quick-sale-dialog.tsx | 0 | 0 |
| src/components/inbox/auto-handled-list.tsx | 0 | 0 |
| src/components/inbox/email-content-panel.tsx | 1 | 0 |
| src/components/inbox/sender-rules-card.tsx | 0 | 0 |
| src/components/inbox/teach-assistant-card.tsx | 0 | 0 |
| src/components/inventory/asset-form-dialog.tsx | 0 | 0 |
| src/components/inventory/assign-asset-dialog.tsx | 0 | 0 |
| src/components/inventory/collaborator-assets-card.tsx | 0 | 0 |
| src/components/inventory/inventory-access-card.tsx | 0 | 0 |
| src/components/inventory/inventory-top-nav.tsx | 0 | 0 |
| src/components/inventory/invoice-inventory-action.tsx | 0 | 0 |
| src/components/inventory/invoice-inventory-dialog.tsx | 0 | 0 |
| src/components/inventory/review-queue-inventory-section.tsx | 0 | 0 |
| src/components/products/category-select.tsx | 1 | 0 |
| src/components/products/datasheet-sheet.tsx | 21 | 0 |
| src/components/products/image-field.tsx | 5 | 1 |
| src/components/products/library-browser.tsx | 12 | 1 |
| src/components/products/product-form-dialog.tsx | 31 | 1 |
| src/components/products/product-image.tsx | 0 | 0 |
| src/components/products/products-top-nav.tsx | 0 | 0 |
| src/components/products/project-item-sheet.tsx | 30 | 0 |
| src/components/products/project-items-table.tsx | 26 | 0 |
| src/routes/_app.crm.companies.$companyId.tsx | 0 | 0 |
| src/routes/_app.crm.companies.index.tsx | 17 | 0 |
| src/routes/_app.crm.companies.tsx | 0 | 0 |
| src/routes/_app.crm.contacts.tsx | 9 | 0 |
| src/routes/_app.crm.contracts.$contractId.tsx | 0 | 0 |
| src/routes/_app.crm.email-leads.tsx | 0 | 0 |
| src/routes/_app.crm.index.tsx | 0 | 0 |
| src/routes/_app.crm.opportunities.$opportunityId.tsx | 14 | 6 |
| src/routes/_app.crm.opportunities.index.tsx | 16 | 0 |
| src/routes/_app.crm.pipeline.$proposalId.tsx | 0 | 0 |
| src/routes/_app.crm.pipeline.tsx | 0 | 0 |
| src/routes/_app.crm.quote-templates.tsx | 0 | 0 |
| src/routes/_app.crm.quotes.$quoteId.tsx | 2 | 2 |
| src/routes/_app.crm.tsx | 0 | 0 |
| src/routes/_app.inbox.index.tsx | 1 | 1 |
| src/routes/_app.inbox.settings.tsx | 0 | 0 |
| src/routes/_app.inbox.tsx | 0 | 0 |
| src/routes/_app.inventory.assets.$assetId.tsx | 0 | 0 |
| src/routes/_app.inventory.assets.index.tsx | 0 | 0 |
| src/routes/_app.inventory.assignments.tsx | 0 | 0 |
| src/routes/_app.inventory.index.tsx | 0 | 0 |
| src/routes/_app.inventory.intake.tsx | 0 | 0 |
| src/routes/_app.inventory.reports.tsx | 0 | 0 |
| src/routes/_app.inventory.tsx | 0 | 0 |
| src/routes/_app.products.categories.tsx | 13 | 0 |
| src/routes/_app.products.index.tsx | 10 | 0 |
| src/routes/_app.products.library.tsx | 2 | 0 |
| src/routes/_app.products.project.$projectId.tsx | 15 | 1 |
| src/routes/_app.products.tsx | 0 | 0 |

Machine-readable counts and exclusions: [counts](i18n-batch4-counts.json). Verification results: [results](i18n-batch4/results.json).
