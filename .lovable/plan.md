
# Finance Module Restructure

Scope: navigation + layout + UX cleanup + terminology. **No backend rewrite.** Existing components are re-mounted in new route files; the current giant `_app.finance.tsx` becomes a thin shell.

---

## 1. Dedicated Finance shell (hide HR nav)

**`src/routes/_app.tsx`** — add `isFinanceArea = loc.pathname.startsWith("/finance")` and include it in `hideHrNav`. Also hide the HR settings dropdown and HR mobile sheet items inside Finance. Module-level top nav stays via `ModuleTopNav` which already routes to `FinanceTopNav`.

**`src/components/ModuleTopNav.tsx`** — `FinanceTopNav` becomes minimal (just the sidebar toggle / module label); per-section navigation moves into the Finance sidebar.

---

## 2. Replace flat tabs with sidebar + child routes

Convert `_app.finance.tsx` from a Tabs container into a **layout route** that renders a `<FinanceSidebar />` + `<Outlet />`. Create one child route per section so URLs are deep-linkable.

```text
src/routes/
  _app.finance.tsx                       (layout: sidebar + Outlet, gate via checkFinanceAccess)
  _app.finance.index.tsx                 → /finance              Overview (executive)
  _app.finance.payments.suppliers.tsx    → /finance/payments/suppliers
  _app.finance.payments.purchases.tsx    → /finance/payments/purchases   (placeholder)
  _app.finance.payments.expenses.tsx     → /finance/payments/expenses    (was "expenses" + "materials" merged)
  _app.finance.payments.outflows.tsx     → /finance/payments/outflows    (debts / future outbound)
  _app.finance.payments.cards.tsx        → /finance/payments/cards       (placeholder)
  _app.finance.invoicing.clients.tsx     → /finance/invoicing/clients
  _app.finance.invoicing.invoices.tsx    → /finance/invoicing/invoices   (income tab)
  _app.finance.invoicing.receipts.tsx    → /finance/invoicing/receipts   (placeholder)
  _app.finance.invoicing.inflows.tsx     → /finance/invoicing/inflows    (placeholder)
  _app.finance.banking.balances.tsx      → /finance/banking/balances
  _app.finance.banking.reconciliation.tsx→ /finance/banking/reconciliation
  _app.finance.banking.transactions.tsx  → /finance/banking/transactions (bank-imports-manager)
  _app.finance.reports.cashflow.tsx      → /finance/reports/cashflow
  _app.finance.reports.vat.tsx           → /finance/reports/vat          (placeholder)
  _app.finance.reports.forecast.tsx      → /finance/reports/forecast     (placeholder)
  _app.finance.reports.projects.tsx      → /finance/reports/projects     (ProjectFinancialPanel)
  _app.finance.data.classifications.tsx  → /finance/data/classifications (FinancialClassificationsAdmin)
  _app.finance.data.vat-rates.tsx        → /finance/data/vat-rates       (placeholder)
  _app.finance.data.bank-accounts.tsx    → /finance/data/bank-accounts   (placeholder)
  _app.finance.data.cards.tsx            → /finance/data/cards           (placeholder)
  _app.finance.data.rules.tsx            → /finance/data/rules           (placeholder)
  _app.finance.admin.imports.tsx         → /finance/admin/imports        (ImportLogs)
  _app.finance.admin.inconsistencies.tsx → /finance/admin/inconsistencies(FinanceInconsistencyReport)
  _app.finance.admin.audit.tsx           → /finance/admin/audit          (placeholder)
  _app.finance.admin.qa.tsx              → /finance/admin/qa             (AdminResetTool)
  _app.finance.documents.*               (keep existing)
```

Each child page imports the relevant **existing** component (e.g. `BankReconciliationTab`, `ClientsMasterData`, `SuppliersMasterData`, `DocumentsTab`, `FinancialClassificationsAdmin`, `FinanceInconsistencyReport`, `AdminResetTool`) — no business logic moves.

The existing `OverviewTab`, `CashFlowTab`, `IncomeTab`, `ExpensesTab`, `DebtsTab`, `BankBalancesTab`, `ImportLogsTab` (currently inline in `_app.finance.tsx`) get extracted to `src/components/finance/sections/` and imported by their child routes. The big `_app.finance.tsx` shrinks to ~50 lines (layout shell).

---

## 3. Finance sidebar component

New `src/components/finance/finance-sidebar.tsx` using shadcn `Sidebar` with `collapsible="icon"`:

- Header: "Finance" label + module badge.
- Groups (collapsible, default open when active):
  - **Overview** (single link)
  - **Payments**: Suppliers, Purchases, Expenses, Outflows, Cards
  - **Invoicing**: Clients, Invoices, Receipts, Inflows
  - **Banking**: Balances, Reconciliation, Transactions
  - **Reports**: Cash flow, VAT, Forecast, Project financials
  - **Data**: Classifications, VAT rates, Bank accounts, Cards, Rules
  - **Admin** (only `isRealAdmin`): Import logs, Inconsistencies, Audit, QA

Wire `SidebarProvider` + `SidebarTrigger` inside the Finance layout (not `_app.tsx`, to stay scoped).

---

## 4. Executive Overview homepage (`/finance`)

Replace the current `OverviewTab` content with an exec dashboard built from existing hooks/queries (no schema changes). Sections:

1. **Top KPI strip** (5 cards): current bank balance (sum of latest snapshots), forecast EoM balance (opening + projected net), outstanding receivables (income with `invoice_status != paid`), upcoming payables (debt payments + unpaid expenses), net cash flow MTD.
2. **Alerts panel**: overdue invoices, unclassified bank tx count (from `bank_transactions` where `suggested_classification_id` null), missing reconciliations, upcoming VAT deadline (static rule), upcoming supplier payments (7-day window).
3. **Cash-flow trend**: small line chart of last 6 months closing balance + 3-month forward forecast (already in `buildCashFlow`). Use existing `recharts`.
4. **Quick actions**: 5 buttons → import bank, create invoice, register supplier invoice, reconcile, add bank snapshot (link to existing dialogs/routes).
5. **Operational queues** (2 columns): Money In (unpaid invoices list, top 5) | Money Out (upcoming payments list, top 5).

Each section is its own small component under `src/components/finance/overview/`.

---

## 5. Remove "Materials" terminology

- Finance UI: drop the "Materials" tab entirely. The Expenses page lists **all** expense rows; classification (project_cost vs operational) drives grouping. Update `buildCashFlow` to keep the cash math identical but rename `materials` field → `projectCosts` internally and merge into the displayed "Expenses" total (keep a breakdown row, labeled via classification).
- Projects: rename UI label "Materials" → "External Services" wherever it appears in components/i18n. Keep DB column names (`pm_materials`, `expense_type='materials'`) untouched — UI-only.
- i18n: add `finance.payments.expenses.*`, `projects.externalServices.*`; deprecate (but keep) `finance.tabs.materials` for backwards safety.

---

## 6. i18n

Add EN + PT-PT keys for: sidebar groups/items, overview KPIs/alerts/quick actions, new section titles, "External Services". Maintain parity (script `scripts/check-i18n-parity.mjs` already enforces it).

---

## 7. Out of scope (explicit)

- No new tables, no migrations.
- No changes to `financial_classifications`, `bank_transactions`, `companies`, or any importer.
- No DB rename of `pm_materials` / `expense_type='materials'`.
- VAT rates, Cards, Rules, Audit pages ship as empty placeholder routes with a "Coming soon" card so the nav is complete but no half-built UI lands.

---

## Technical notes

- Permissions stay gated by `checkFinanceAccess` (layout `beforeLoad`) + `finance.dashboard`. Admin section additionally gated by `isRealAdmin`.
- `<Outlet />` must be added to the new `_app.finance.tsx` layout — without it child routes render blank.
- `Tabs` import removed from layout; old anchors (`?tab=...`) are not preserved (the user accepted progressive reorganization).
- `routeTree.gen.ts` regenerates automatically.
- Existing components stay untouched except for label strings.

## Deliverables in order

1. Finance layout shell + sidebar + child route files (mounting existing components).
2. Update `_app.tsx` to hide HR nav inside `/finance`.
3. Extract `OverviewTab`/`CashFlowTab`/etc. into `sections/`.
4. Build executive Overview homepage components.
5. Rename Materials → External Services in Projects UI + i18n.
6. EN/PT-PT i18n additions + parity check.
