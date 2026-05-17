# Finance Module — QA Status Note

_Last updated: 2026-05-17_
_Scope: snapshot of what is verified working after the Purchases → Payments → Settlement → Reconciliation build pass and the date/cache/terminology polish pass._

---

## Navigation shell

- `/finance/*` routes mount under the `_authenticated` + `_app` layout — SSR/prerender safe (no protected serverFn in public loaders).
- Sub-sections present and routed:
  - `/finance/invoicing/invoices`, `/finance/invoicing/receipts`
  - `/finance/payments/purchases`, `/finance/payments/outflows`
  - `/finance/banking/reconciliation`, `/finance/banking/balances`, `/finance/banking/transactions`
  - `/finance/documents/$documentId` (detail editor)
- Sidebar and breadcrumbs render in EN + PT-PT.

## Permission gating

- `checkFinanceAccess` requires `admin` role OR `finance.dashboard` permission.
- Hardened against the session-not-yet-hydrated race (retry loop up to 5×100ms) — direct deep links no longer bounce authenticated users to `/`.
- RLS on `financial_documents`, `financial_document_lines`, `financial_document_payments`, `bank_transactions`, `bank_accounts` enforces the same check server-side.
- Hub home page does not surface financial figures to unauthorized users.

## Purchases (`/finance/payments/purchases`)

- List view: counterparty, document number, dates (PT format), totals, **outstanding always rendered as `0,00 €`** for fully paid (no `—`), status badge.
- Editor dialog: multi-line, VAT, classification picker, project link, status transitions `draft → issued → cancelled`; `paid` / `partially_paid` derived from trigger.
- Settlement history section visible inside the editor for issued/paid docs.
- Date inputs (issue/due) show a small dd/mm/yyyy preview under the native input.

## Invoices (`/finance/invoicing/invoices`)

- Symmetric to Purchases: client-side, `direction='issued'`.
- Same outstanding normalization (`0,00 €`).
- Same date-input + preview UX.
- Settlement history section visible in editor.

## Payments / Outflows (`/finance/payments/outflows`)

- Open queue: lists `received` docs with `outstanding_amount > 0`, sorted by due date; overdue badge.
- "Record payment" dialog: bank account picker (active accounts only, cache refreshed on mount), bank transaction picker filtered by date + sign, method, notes.
- Writes to `financial_document_payments`; trigger updates `paid_amount` + status; bank tx auto-classified via `bank_tx_auto_classify_on_payment`.
- Settlement history table below the queue.

## Receipts (`/finance/invoicing/receipts`)

- Symmetric to Outflows for `issued` client documents.
- Same dialog, same trigger flow, same history panel.

## Settlement history

- Read-only join of `financial_document_payments → financial_documents → bank_transactions → bank_accounts`.
- Columns: date, counterparty, document #, amount, bank tx link, method, notes.
- Filterable by date range (date inputs use the new preview component).
- No reverse/undo action yet — intentional.

## Reconciliation queue (`/finance/banking/reconciliation`)

- Left: bank tx queue filtered by account + status (`pending` / `classified` / `linked`) + date range.
- Right: detail panel with linked document badge, classification picker, split editor.
- Bank account selector refreshes on mount/window focus — new active accounts appear without hard refresh.
- Operator can: classify, link to existing doc, create doc from tx, split.
- Existing reconciliation protections (cannot double-classify, cannot bypass triggers) untouched.

## QA seed records (still live in DB)

- Companies: `QA Test Supplier`, `QA Test Client`, `QA Test Bank Account`.
- Documents: `QA-PUR-001` (€1,230, paid), `QA-INV-001` (€2,460, paid).
- Bank transactions: `−1,230.00` outflow, `+2,460.00` inflow, both `classified`, checksum prefix `qa-seed-*`.
- Payment rows link each document to its bank tx; `outstanding_amount = 0`, status `paid` on both.
- Verification queries pass: 0 generated-column mismatches, 0 rows in any of the 3 inconsistency-report categories.
- Cleanup recipe: delete the two `financial_documents` rows (cascades lines + payments), then the two QA bank txs, the QA bank account, and the two QA companies.

## Known minor limitations

- Dashboard overview cards still pull from `financial_periods` projections, not from `financial_documents` actuals — totals can lag the operational workspaces.
- No reverse/undo on settlement history (read-only by design for now).
- No internal-transfer pairing for bank-to-bank movements.
- No treasury / cashflow forecast report.
- Native date inputs still show the OS-locale placeholder before a value is picked; the dd/mm/yyyy preview underneath disambiguates once a value exists.
- Zero-balance display is now `0,00 €` in lists; truly missing values (no counterparty, no doc number, no due date) still render as `—`.
- PT-PT canonical term for "Default classification" is **"Classificação por defeito"** across all finance editors.

## Next recommended step

**Treasury depth pass** — once the team is happy with the current operational chain:

1. Internal-transfer pairing on `bank_transactions` (match outflow on account A to inflow on account B; no new schema needed — use existing `bank_transaction_links` / classification).
2. Cashflow forecast view combining outstanding receivables (`issued` invoices with `outstanding_amount > 0`) and outstanding payables (`received` purchases with `outstanding_amount > 0`) bucketed by due date.
3. Wire dashboard overview cards to actuals from `financial_documents` instead of projections.

Do **not** start step 1 before confirming the QA chain still holds after the seed data is removed.
