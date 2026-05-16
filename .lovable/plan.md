## Phase 1b — UI/UX & State Machine wiring

Builds on the Phase 1a DB layer (categories, audit, `benefit_expense_set_status` RPC, audit events, notification queue). No new tables; no Finance integration; legacy enum stays in place.

### 1. State-machine wiring (mutations)

`src/routes/_app.hr.beneficios.tsx` → `ExpenseActions`:

- Replace direct `update({estado: ...})` in `approve()`, `reject()`, `markPaid()` with:
  ```
  supabase.rpc('benefit_expense_set_status', {
    p_expense_id, p_to_status, p_notes
  })
  ```
- Reject still prompts a mandatory reason; pass as `p_notes`. Approve takes optional notes. Mark-paid takes no notes.
- Keep `notify-expense` POST for accounting on approval (unchanged endpoint). Collaborator notifications are enqueued automatically by the DB trigger.
- `remove()` and the foto signed URL flow stay as-is.

### 2. Category picker — additive, FK-based

- New hook `useBenefitCategories()` (in-file): `select id, code, label_pt, label_en, icon, legacy_enum, sort_order from benefit_categories where active order by sort_order`.
- `SubmitExpenseDialog`:
  - Picker lists rows from `benefit_categories`, not the hard-coded `CATS`.
  - Compute "available" per category by joining the active row's `legacy_enum` to current `balance[legacy]`. Rows whose `legacy_enum` is null show "—" available but remain selectable (no balance gate).
  - On insert, write BOTH `category_id` (new) AND `categoria` (legacy enum from the picked row's `legacy_enum`, fallback `'outros'`) → backward compatible.
- `ExpensesTable` row label: prefer the joined category label from `benefit_expenses_v` when available; otherwise fall back to `CATEGORY_LABELS[e.categoria]`. Switch `expensesQ` / approver / admin queries to read from `benefit_expenses_v` (same columns + `category_code`, `category_label_pt`).

### 3. Detail dialog + timeline

- New component `src/components/hr/BenefitExpenseTimeline.tsx`:
  - Queries `benefit_expense_events` for an `expense_id`, joins `actor_id → collaborators.nome` via `pm_list_user_resource_map` (already used elsewhere).
  - Renders with the existing `activity-timeline.tsx` primitive (icons: submitted → Inbox, approved → Check, rejected → X, paid → BadgeEuro, reopened → Undo).
- New `ExpenseDetailDialog` in `_app.hr.beneficios.tsx`:
  - Triggered by clicking a row (or new "Detalhes" button in `ExpenseActions`).
  - Shows: header (category, value, status badge, dates), description, both notes fields, foto preview button, and `<BenefitExpenseTimeline>`.

### 4. Collaborator history — filters & yearly summary

In `CollaboratorBody`:
- Filter bar above the table:
  - Search (descricao / notas) — debounced text.
  - Status select (todos / pendente / aprovada / paga / rejeitada).
  - Category select (loaded from `benefit_categories`).
  - Year select (distinct years from expenses, default = current `ano_fiscal`).
- "Resumo anual" strip (4 small stat tiles): submetido, aprovado, pago, rejeitado — filtered by selected year.
- CSV export button → builds a CSV from the currently filtered list (date, category, description, value, status, notes). Client-side `Blob` + `URL.createObjectURL`. No new dependency.
- Mobile: below `md`, the table collapses to a stacked card list (reuse existing `Card` primitive; status badge + value on the right).

### 5. Approver / Admin views — light improvements

- Inline rejection-reason prompt replaced by a small dialog with a `Textarea` (Phase-1b polish; uses the new `set_status` RPC).
- Approver view: add the same Year filter (defaults to current year), keep existing status filter.
- Admin view: unchanged behaviorally; just routes mutations through the RPC.
- "Aprovado por" column (showCollaborator variant): show `aprovado_por` resolved through `pm_list_user_resource_map` when present.

### 6. RLS tightening (one small migration)

Single follow-up migration (no Finance impact):
- Drop the "approver can update" UPDATE policy on `benefit_expenses` so all status changes MUST go through `benefit_expense_set_status` (which is SECURITY DEFINER and checks `can_approve_benefits`).
- Keep the "owner can update own pendente" policy → preserves edits-before-approval.
- Owner DELETE on pendente stays.

### 7. i18n

- Add EN + PT keys for: filter bar labels, "Resumo anual" tiles, "Exportar CSV", "Detalhes", "Reabrir", "Aprovado por", timeline event labels (submitted/approved/rejected/paid/reopened), rejection-reason dialog labels. Use existing `hr` namespace; per glossary rules, reuse `common.*` for shared words (Cancel, Save, Search, Year).

### Files

Created:
- `src/components/hr/BenefitExpenseTimeline.tsx`
- `supabase/migrations/<ts>_benefit_rls_set_status_only.sql`

Edited:
- `src/routes/_app.hr.beneficios.tsx` (RPC mutations, picker from table, filters, CSV, detail dialog, mobile cards)
- `src/lib/benefits.ts` (add `BenefitCategoryRow` type + `labelFor(row, locale)` helper)
- `src/i18n/locales/en/hr.json`, `src/i18n/locales/pt-PT/hr.json`

### Out of scope (Phase 2)

- Finance write-through (`financial_expense_items`, payroll, cash-flow).
- Period-scoped budgets and two-stage approval.
- True in-app notifications (queue drain + delivery worker — DB seam already in place).
- Multi-attachment, OCR, NIF extraction.
- Dropping the legacy `categoria` column.

### Backward compatibility

- Legacy `categoria` enum kept and dual-written.
- Old rows continue to resolve via `benefit_expenses_v` fallback.
- Existing approver/admin flows preserved; only the mutation path moves to the RPC.
- No removed columns, no removed routes, no permission key changes.
