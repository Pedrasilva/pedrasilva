## Finance Foundation — Shared Master Data + Import Engine

Goal: one canonical model for clients, suppliers, purchases, invoices, payments, and bank movements across HR, Projects, and Finance — then a safe staging/preview import engine — BEFORE touching supplier statements.

---

### 1. Current data-model audit

**Already canonical (keep & extend):**
- `companies` — has `nif`, `is_client`, `is_supplier`, `is_active`, `is_reimbursement_supplier`, `default_classification_id`. Already referenced by `financial_documents`, `benefit_expenses`, `bank_transaction_classifications`, `crm_*`, `pm_projects`, `historical_time_entries`. **This is the canonical entity.**
- `financial_documents` (+ `financial_document_lines`, `financial_document_payments`) — already polymorphic invoice/receipt/purchase/payment with `counterparty_supplier_id` / `counterparty_client_id` → companies, plus `doc_type`, `direction`, `status`, `vat`, `project_id`. **This is the canonical purchase/invoice/receipt.**
- `bank_accounts`, `bank_transactions`, `bank_statement_imports`, `bank_transaction_classifications`, `bank_classification_rules`, `bank_balance_snapshots` — full bank/reconciliation stack already exists. **Reuse, do not parallel.**
- `import_jobs` + `import_job_rows` (with `import_type`, `import_job_status`, `import_row_status`, `raw_data`/`parsed_data` jsonb) — **the staging engine already exists**, just needs new `import_type` values and per-type handlers.

**Legacy / to phase out:**
- `pm_suppliers` — duplicate supplier table (3 rows). Referenced by `pm_expenses`, `pm_materials`, `company_expenses`, `quote_external_services`. **Bridge → migrate FKs to `companies.id`, then drop.**
- `financial_expense_items` / `financial_expense_payments` / `financial_income_items` — older expense model that points at `companies` already. Verify usage; likely fold into `financial_documents` long-term, but leave untouched in Phase 1.

**Missing fields on `companies` (from screenshots):**
- `code` (Nº fornecedor/cliente — 455, 201, 140…)
- `abbreviation`
- `postal_code`, `city` (currently only free-text `morada`)
- `mobile` (separate from `telefone`)
- `currency` (default EUR)
- `payment_terms` (Pronto Pagamento, 30d, …)
- `notes` is already `notas`

**Missing fields on `financial_documents`:** already has the screenshot fields (doc_type, number, dates, vat, subtotal, total, status, project, classification, counterparty).

---

### 2. Build sequence

**Phase 1 — Master-data canonicalization (no UI yet)**
1. Migration: add `code`, `abbreviation`, `postal_code`, `city`, `mobile`, `currency`, `payment_terms` to `companies`. Add unique partial index on `code` per role.
2. Migration: bridge `pm_suppliers` → `companies`. For each `pm_suppliers` row, upsert into `companies` (match by `tax_id`/name, set `is_supplier=true`), then add nullable `supplier_company_id uuid → companies(id)` to `pm_expenses`, `pm_materials`, `company_expenses`, `quote_external_services`. Backfill, then in a later migration drop the old `supplier_id`.
3. Server functions in `src/lib/finance/companies.functions.ts`: `listCompanies`, `getCompany`, `upsertCompany`, `mergeCompanies` (admin-only, NIF-aware, refuses own-company NIF — reuse the guard from `benefit-supplier.functions.ts`).

**Phase 2 — Suppliers & Clients screens**
- Two thin views over the same `companies` table, filtered by `is_supplier` / `is_client` (a company can be both).
- Routes: `/finance/suppliers`, `/finance/suppliers/$id`, `/finance/clients`, `/finance/clients/$id`.
- Detail page shows: master fields, open balance (sum of unpaid `financial_documents` where direction matches), document list, linked HR/Project expenses, bank reconciliation links.
- Reuse existing `src/components/finance/suppliers-master-data.tsx` / `clients-master-data.tsx` as starting points; extend with new fields.

**Phase 3 — Generic Excel import engine (reuse `import_jobs`)**
- Add `import_type` enum values: `companies_suppliers`, `companies_clients`, `bank_accounts`, `bank_statement`, `supplier_statement` (last one stubbed only).
- Generic flow under `/admin/imports/finance`:
  1. Upload .xlsx → store in Supabase Storage → create `import_jobs` row with `status='uploaded'`.
  2. Parse server-side (SheetJS already in deps; verify) into `import_job_rows.raw_data`.
  3. Column-mapping UI: detect headers, propose mapping, persist mapping in `import_jobs.metadata`.
  4. Validate + dedupe pass → fill `parsed_data`, set per-row `status` (`pending`/`warning`/`error`/`duplicate`).
  5. Preview screen with row-level diff (new vs. existing match).
  6. Explicit "Commit" button → idempotent insert/update, sets `imported_count`.
- Server fns in `src/lib/finance/imports/*.functions.ts`, one handler per `import_type`. All admin-gated.

**Phase 4 — First three imports (master data only)**
- **Suppliers** (`Listagem de fornecedores.xlsx`): match by `nif` → fallback normalized `nome`. Upsert into `companies` with `is_supplier=true`.
- **Clients** (`Listagem de clientes.xlsx`): same logic with `is_client=true`.
- **Bank list** (`Extrato listagem de bancos.xlsx`): preview first — could be accounts list OR statement OR treasury extract. Route to `bank_accounts` upsert OR `bank_statement_imports` + `bank_transactions` based on detected shape.

**Phase 5 (deferred — not now): Supplier statement reconciliation.** Requires Phases 1–4 stable + open-document index per supplier.

---

### 3. Cross-module integration (already mostly correct)

- HR benefit OCR → already writes to `companies` via `linkOrCreateSupplierForBenefitExpense`. ✓
- HR reimbursements → unchanged, still create `is_reimbursement_supplier` company liability. ✓
- Projects → migrate `pm_*.supplier_id` to `companies.id` in Phase 1 step 2.
- Finance purchases → already `financial_documents.counterparty_supplier_id → companies`. ✓
- Bank reconciliation → already classifies to `companies` via `bank_transaction_classifications`. ✓

---

### 4. Risks / safety rules

- **Never blind-import.** Every Excel import goes through `import_jobs` staging → preview → explicit commit.
- **Own-company NIF guard** must run on every import row (reuse `pm_invoice_settings.company_nif`).
- **`pm_suppliers` deprecation is a two-step migration** (add new FK, backfill, switch reads, then drop old FK) to avoid breaking Projects mid-flight.
- **NIF normalization** (`normalizePortugueseNif`) must run on both sides of every match.
- **No new bank tables.** The existing 6-table bank stack covers everything in the screenshots.
- **No supplier statement import in Phase 1–4.** Doing it before canonical purchases would create duplicates.

---

### 5. Deliverables of Phase 1 (what I'll ship first if you approve)

1. Migration: extend `companies` (code, abbreviation, postal_code, city, mobile, currency, payment_terms).
2. Migration: add `supplier_company_id` to `pm_expenses`, `pm_materials`, `company_expenses`, `quote_external_services` + backfill from `pm_suppliers.tax_id`/name.
3. `companies.functions.ts` server fns (list/get/upsert/merge, admin-gated, own-NIF guard).
4. Skeleton routes `/finance/suppliers`, `/finance/clients` (list + detail), wired to canonical `companies`.
5. Admin link in `/admin` hub for "Suppliers & clients (master data)".

I will not touch `financial_documents`, bank tables, or imports until Phase 1 lands and you confirm.

---

### Open questions before I start

1. OK to migrate `pm_suppliers` → `companies` now (a) backfill + dual-write, then (b) drop `pm_suppliers` in a follow-up migration once Projects UI reads the new FK? Or keep `pm_suppliers` indefinitely as a view over `companies`?
2. For company `code` — should we auto-generate (next sequential like 455, 201) or only populate from imports/manual entry? Old accounting uses sequential numbers per role.
3. Currency: lock to EUR for now (no multi-currency UI), or expose the field even though all rows will be EUR?
