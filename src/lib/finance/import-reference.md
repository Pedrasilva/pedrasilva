# Import Reference — "Folha de pagamento 2026.xlsx"

Internal documentation of how the 2026 financial Excel file was mapped into
the `financial_*` tables. This is a living spec — update it whenever import
logic changes. No runtime code depends on this file.

Related code:
- `src/lib/finance/import-financial-data.ts` — import pipeline
- `src/lib/finance/import-logs.ts` — log writer
- `src/lib/finance/ownership.ts` — project vs company ownership guard
- `src/lib/finance/display-rules.ts` — dashboard display spec

---

## 1. Sheets used

| Sheet                  | Purpose                                              | Imported |
|------------------------|------------------------------------------------------|----------|
| `Janeiro` … `Dezembro` | Monthly cash movements (operational, materials, income) | Yes   |
| `2026`                 | Annual overview / forecast                           | Partial (totals only, P-coded forecast rows skipped) |
| `Operacionais`         | Recurring operational reference list                 | Used as lookup for supplier dedup, not imported as movements |
| `Dívidas`              | Debt register                                        | Yes (header rows → `financial_debts`; payment schedule not yet generated) |

Sheet names are matched case-insensitively and accent-insensitively.

---

## 2. Monthly sheet mapping

Each monthly sheet (`Janeiro` … `Dezembro`) is split into three row blocks.
Row ranges below are the canonical layout used by the 2026 file. If the user
inserts/removes rows, the importer locates blocks by header marker rows
(e.g. `"DESPESAS OPERACIONAIS"`, `"MATERIAIS"`, `"RECEITAS"`) rather than by
fixed numeric ranges.

### 2a. Operational expenses

- Header marker: `DESPESAS OPERACIONAIS`
- Row range: ~rows 6–35 (variable per sheet)
- Date column: `B` (`incurred_at`)
- Supplier column: `C` (`financial_suppliers.name`)
- Description column: `D`
- Amount column: `E` (gross, including VAT)
- Status column: `F` (`paid` / `confirmed` / `projected`)
- **Target table**: `financial_expense_items`
- **Target fields**:
  - `expense_type = "operational"`
  - `incurred_at`, `description`, `supplier_id` (resolved by name)
  - `amount_inc_vat = E`
  - `amount_ex_vat = E / 1.23`
  - `vat_amount = amount_inc_vat - amount_ex_vat`
  - `vat_rate = 0.23`
  - `status` (mapped from F; defaults to `projected`)
  - `period_id` → `financial_periods` for that month

### 2b. Materials / outsourced services

- Header marker: `MATERIAIS` (also catches `MATERIAIS / SUBCONTRATAÇÃO`)
- Row range: typically immediately after operational block
- Date column: `B`
- Supplier column: `C`
- Description column: `D`
- Amount column: `E` (gross, inc-VAT)
- Status column: `F`
- **Target table**: `financial_expense_items`
- **Target fields**: same as operational block, except:
  - `expense_type = "materials"`

Materials live in the same table as expenses; the dashboard partitions them
in the UI (Expenses tab excludes `expense_type = 'materials'`; Materials tab
filters to it).

### 2c. Income block

- Header marker: `RECEITAS`
- Row range: bottom block of each monthly sheet
- Date column: `B` (`received_at`)
- Client column: `C` (`financial_clients.name`)
- Description column: `D`
- Amount column: `E` (gross, inc-VAT)
- Status column: `F`
- **Target table**: `financial_income_items`
- **Target fields**:
  - `received_at`, `description`, `client_id` (resolved by name)
  - `amount_inc_vat = E`
  - `amount_ex_vat = E / 1.23`
  - `vat_amount`, `vat_rate = 0.23`
  - `status`
  - `period_id`

---

## 3. Target database tables

| Table                        | Source                                          | Notes |
|------------------------------|-------------------------------------------------|-------|
| `financial_periods`          | One row per month (Jan–Dec 2026)                | `kind = "month"`, `opening_balance` from previous month closing where known |
| `bank_accounts`              | Read from header of `2026` sheet                | Created if missing; matched by `name` |
| `bank_balance_snapshots`     | Opening/closing balance cells per monthly sheet | One snapshot per account per month-end; latest per account is shown in Bank Balances tab |
| `financial_suppliers`        | Distinct values of supplier column in expense + materials blocks | Deduped case/accent-insensitive |
| `financial_clients`          | Distinct values of client column in income block | Deduped case/accent-insensitive |
| `financial_expense_items`    | Operational + materials blocks (all months)     | `expense_type ∈ {"operational","materials"}` |
| `financial_income_items`     | Income block (all months)                       | — |
| `financial_debts`            | `Dívidas` sheet header rows                     | Payment schedule rows NOT yet imported |
| `financial_import_logs`      | One row per import run                          | Records file name, size, sha256 checksum, per-table row counts, notes |

All financial tables are **company-owned** (no `project_id`). See
`mem://features/financial-ownership.md`.

---

## 4. Assumptions

- **Excel amounts are gross (including VAT).** The "Valor" column in the
  spreadsheet reflects what hits the bank account.
- **VAT rate assumed as 23%** (standard PT continental rate). No per-row
  override yet — Madeira/Açores rates and reduced rates are not handled.
- **`amount_ex_vat` is back-calculated**: `amount_inc_vat / 1.23`,
  rounded to 2 decimals. `vat_amount = amount_inc_vat - amount_ex_vat`.
- **Payroll rows are skipped.** Salaries, subsídio de alimentação, IRS,
  Segurança Social, and other HR-owned movements are not imported here —
  HR owns the canonical salary data and will publish its own cash impact.
- **Aggregate / total rows are skipped.** Subtotals, monthly totals, and
  any row whose description matches `TOTAL`, `SUBTOTAL`, `SOMA`, etc. are
  ignored — the dashboard recomputes totals from individual line items.
- **Annual P-coded forecast rows were not imported yet.** Rows on the
  `2026` sheet prefixed with `P` (projected forecast cells used for the
  annual view) are out of scope for this import pass.
- **Materials are imported as `expense_type = "materials"`** so the
  dashboard can partition them from operational expenses without a
  separate table.

---

## 5. Known gaps

- **Salary / payroll cash flow** is not yet imported. Cash Flow currently
  understates real outflows by the payroll amount each month. To be wired
  from HR once the salary publication contract is defined.
- **Annual project forecast** (P-coded rows on the `2026` sheet) is not
  imported. The annual view should later combine actuals from monthly
  sheets with these forecast rows.
- **Debt payment schedules** are not generated. `financial_debts` holds
  the header (creditor, original/outstanding, start/end), but
  `financial_debt_payments` rows are not derived from the Excel — they
  must be entered manually or generated from the payment plan once the
  schedule generator exists.
- **Project links are not wired.** Imported income/expense rows are not
  attached to any project. Financial records remain company-owned per the
  ownership model; project linkage (when needed) will be a separate
  optional join, not a move into project-owned tables.
- **Imported rows default to `status = "projected"`** unless the Excel
  status column explicitly marks them as `paid` or `confirmed`. Treat
  unflagged historical months as needing a manual confirmation pass.
