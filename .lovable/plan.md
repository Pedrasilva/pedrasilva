
# Elaborate Gantt + Consultants + Cashflow projections

Goal: model consultants as supplier "groups" of indented sub-stages on the quote Gantt that follow the architecture stages through dependencies, generate a payment schedule that mirrors the attached PDF (architecture + per-supplier blocks), and feed the cashflow with projected income (architecture invoices) and projected outflows (consultant invoices).

---

## 1. Data model changes

**`quote_stages`** (already supports a tree-friendly structure; we extend it):
- `parent_stage_id uuid NULL` → enables indentation (supplier group → sub-stage).
- `stage_role text NOT NULL DEFAULT 'architecture'` → values: `architecture`, `supplier_group`, `supplier_phase`.
- `supplier_company_id uuid NULL` → set on `supplier_group` (and inherited by children for queries).
- `linked_stage_id uuid NULL` → on `supplier_phase`, points to the architecture stage it shadows (so cascade moves it).

**`quote_payment_schedule_items`**:
- `supplier_company_id uuid NULL` → tags rows that represent supplier outflows.
- `direction text NOT NULL DEFAULT 'inflow'` → `inflow` (architecture → us) or `outflow` (us → supplier).
- `linked_payment_item_id uuid NULL` → outflow linked to the parent inflow (for "pay when paid + N days").
- `payment_offset_days int NOT NULL DEFAULT 0` → applied on top of the linked inflow's payment date.

**New table `quote_supplier_phase_splits`** (per-supplier % overrides):
- `quote_id`, `supplier_company_id`, `phase_code` (or `linked_stage_id`), `percent`.
- Default: inherit architecture stage % split. Row only created when overridden.

All new columns get sensible defaults so existing quotes keep working.

---

## 2. Gantt UI (`quote-gantt.tsx`)

- Render rows hierarchically with indentation. Order: architecture stages first, then each supplier group with its phases nested below.
- Expand/collapse per supplier group.
- New row type "Supplier group": shows supplier name, total fee, span = min(start) → max(end) of its children.
- New action on architecture stage row: **"Add consultant"** → opens picker (existing companies where `is_supplier=true`) and seeds a supplier group + supplier_phase rows mirroring the architecture phases the user selects.
- Supplier phases inherit dates from their `linked_stage_id` via SS=0 dependency by default; user can change the dep type/lag inline.
- Moving an architecture stage cascades to linked supplier phases through the existing dependency cascade engine (`computeCascade`).

---

## 3. Payment schedule (`quote-payment-schedule-tab.tsx` + `payment-generators.ts`)

- Replace the flat "Aplicar" generator with a structured generator that produces the PDF layout:
  - Top block: **architecture totals** (aggregated across all architecture stages) — % split by phase, invoice numbering Fatura 01..N, condition "Pronto pagamento" / "30 dias".
  - One block per supplier: total fee, then per-phase rows using the supplier's split (inherited or overridden).
- Each generated row stores `direction` and `supplier_company_id`, with outflow rows linked to the matching architecture inflow row.
- Inline override UI per supplier row: percent per phase (locks `manual_override=true` only on the cells the user edits).
- Apply button regenerates non-manual rows only, preserving overrides (existing pattern).

---

## 4. Cashflow integration

Reads from `quote_payment_schedule_items` joined with `fee_proposals` → projects/clients:

- **Projected income** (CashFlowSection): sum of `direction='inflow'` items by month using `expected_payment_date`. Source: signed/issued quotes + retainer projections (existing logic) + these new schedule items.
- **Projected outflows**: sum of `direction='outflow'` items by month and supplier.
- **Per-project insight** (financial summary tab + project insights): show "fees received − consultants payable = remaining for us" using the same schedule data, scoped to the project's source quote.

No changes to historical actuals; only the forecast/cashflow surfaces consume these rows.

---

## 5. Migration & rollout

- Migration 1: schema additions (columns, table, indexes, GRANTs, RLS mirroring existing quote_* policies).
- Code changes ride on top; existing quotes default to `stage_role='architecture'` and `direction='inflow'` so nothing breaks.
- i18n keys added to EN + PT in same edit (quotes namespace + glossary additions if needed).

---

## Technical notes

- Tree rendering: extend `quote-gantt.tsx` row builder to group by `parent_stage_id`. Keep `sort_order` per sibling group.
- Cascade: extend `useQuoteDependencies` to auto-create SS=0 deps when a supplier_phase is created with `linked_stage_id`. Reuse `computeCascade`.
- Payment generator: new kind `architecture_plus_consultants` in `payment-generators.ts`. Old `by_stage_billing` kept for back-compat.
- Permissions: same admin-only write policies as existing quote_* tables.

