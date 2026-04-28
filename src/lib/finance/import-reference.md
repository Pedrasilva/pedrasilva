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

## 0. Terminology — "External Services" vs legacy "Materiais"

The Excel spreadsheet still uses the header `MATERIAIS` (or
`MATERIAIS / SUBCONTRATAÇÃO`) for the second expense block. **In the app
this is NOT called "materials".** The canonical business label is:

- **Excel marker accepted**: `materiais` (and variants — see §6a)
- **App label (EN)**: `External Services`
- **App label (PT-PT)**: `Serviços externos`
- **Meaning**: consultants, outsourced services, subcontractors,
  reimbursable / project-delivery costs paid to third parties.
- **Do NOT** call these "materials" anywhere in the UI, i18n keys, badges,
  or copy. The word "materials" is reserved for legacy Excel-mapping
  context only (this document, importer comments, and DB enum values that
  cannot be renamed without a migration).

DB column values (`expense_type = "materials"`) are kept as-is for
backwards compatibility with already-imported rows; the display layer
maps them to "External Services" / "Serviços externos" via the i18n
glossary.

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

### 2b. External services / Subcontracting (legacy Excel: "Materiais")

- Header marker: `MATERIAIS` (also catches `MATERIAIS / SUBCONTRATAÇÃO`,
  `MATERIAIS E SUBCONTRATAÇÃO`) — kept for Excel compatibility only.
- App-side, this block represents **External Services** (EN) /
  **Serviços externos** (PT-PT) — consultants, subcontractors,
  outsourced services. See §0.
- Row range: typically immediately after operational block
- Date column: `B`
- Supplier column: `C`
- Description column: `D`
- Amount column: `E` (gross, inc-VAT)
- Status column: `F`
- **Target table**: `financial_expense_items`
- **Target fields**: same as operational block, except:
  - `expense_type = "materials"` (legacy DB enum value — display layer
    renders it as "External Services" / "Serviços externos")

External-service rows live in the same table as operational expenses;
the dashboard partitions them in the UI (Expenses tab excludes
`expense_type = 'materials'`; the External Services tab filters to it).

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
| `financial_suppliers`        | Distinct values of supplier column in operational + external-services blocks | Deduped case/accent-insensitive |
| `financial_clients`          | Distinct values of client column in income block | Deduped case/accent-insensitive |
| `financial_expense_items`    | Operational + external-services blocks (all months) | `expense_type ∈ {"operational","materials"}` — `"materials"` is a legacy enum; displayed as "External Services" / "Serviços externos" |
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

---

## 6. Row marker rules

The parser must identify blocks and rows by **structure + content**, not by
fixed row numbers. The 2026 layout is the canonical reference, but next
year's file (or any mid-year edit by accounting) will shift rows around. The
import must survive that without code changes.

### 6a. Section headers

- Detect blocks by scanning column A/B for known labels, normalized
  (lowercased, accent-stripped, trimmed):
  - `despesas operacionais` → start of operational expenses block
  - `materiais` (also matches `materiais / subcontratação`,
    `materiais e subcontratação`) → start of materials block
  - `receitas` → start of income block
  - `dívidas` / `dividas` → debt register
  - `saldos` / `bancos` → bank balance section
- A block ends at the next recognized header OR at the first fully empty
  row after at least one valid data row.
- Any row whose label contains `total`, `subtotal`, `soma`, or
  `acumulado` (case/accent-insensitive) is a roll-up — **skip it**. The
  dashboard recomputes totals from line items.

### 6b. Expense rows (operational + materials)

A row is a valid expense row only if **all** are true:

- Supplier cell is a non-empty string after trimming.
- Amount cell parses as a finite number.
- Supplier text is not `total`, `subtotal`, or any header label.
- Amount is not null and not zero.

Additional handling:

- Date cell may be empty → fall back to the period's month-end date and
  flag the row in the import log notes.
- Supplier name is matched case/accent-insensitively against
  `financial_suppliers.name`; new names create a new supplier row.
- Negative amounts on expense rows represent reversals/credits → store
  as `amount_inc_vat = ABS(value)` and set
  `status = "credit_note"` (or note in the import log if status mapping
  is not yet wired).

### 6c. Income rows

A row is a valid income row only if **all** are true:

- Client cell is a non-empty string after trimming.
- Amount cell parses as a finite number and is not zero.
- Client text is not `total`, `subtotal`, or a header label.

Additional handling:

- Negative income values represent corrections / refunds → store as
  `amount_inc_vat = ABS(value)` and mark the row as a correction in the
  import log notes. They still reduce net income at display time via the
  status, not by storing a negative amount.
- Client name dedup is case/accent-insensitive against
  `financial_clients.name`.

### 6d. Weekly blocks

Some monthly sheets group movements by week (`Semana 1`, `Semana 2`, …).
Parser rules:

- Treat each `Semana N` marker as a sub-section inside the current block
  (operational / materials / income).
- Within a week, the column layout is the same triple:
  `date | name (supplier or client) | amount`.
- Iterate week-by-week dynamically — do **not** hardcode the row offsets
  between weeks. The number of rows per week varies.
- A week ends at the next `Semana N+1` marker, the next section header,
  or the first fully empty row.

### 6e. Bank balances

A row is a valid balance snapshot only if:

- Account name cell is a non-empty string.
- Balance cell parses as a finite number (zero is allowed — it's a real
  state, not malformed).

Skip rows where the account name is empty, contains `total`, or where
the balance cell is non-numeric (e.g. a label leaked into the value
column). Store one `bank_balance_snapshots` row per account per
month-end.

### 6f. Debts

A row is a valid debt only if:

- Creditor cell is a non-empty string after trimming.
- Original amount cell parses as a finite, non-zero number.

Sign handling:

- In the Excel, debts may appear as negative values (liabilities shown
  with a minus). Always store `original_amount = ABS(value)` and
  `outstanding_amount = ABS(value)` on first import.
- A positive value with the same creditor on a later row represents a
  payment / reduction → reduce `outstanding_amount` accordingly (do not
  create a second debt row).

### 6g. General principles

- **Normalize before comparing**: lowercase, strip accents, trim
  whitespace, collapse internal double-spaces. Apply this to every label
  match (headers, totals, supplier/client dedup).
- **Structure first, position second**: locate blocks by header markers,
  then iterate rows until a stop condition. Row numbers in this document
  are reference only — never compiled into the parser as constants.
- **Skip silently, log loudly**: rows that fail a validity check are
  skipped without aborting the import, but the count of skipped rows per
  block is written to `financial_import_logs.notes` so a human can
  reconcile.
