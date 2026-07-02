## Goal
Let the user set a per-supplier administration markup on the quote. Each supplier used in the quote is listed with its name and an editable percentage (0% by default, can be 5%, 7%, or any value). The markup inflates that supplier's client-billed price everywhere prices are shown, without touching what we pay the supplier.

## Where the UI lives
In the "Predefinições de faturação" card in `quote-payment-schedule-tab.tsx`, below the fee-source toggle. A new sub-card titled "Taxa de administração por fornecedor":

```
Taxa de administração por fornecedor
────────────────────────────────────
Fornecedor                    Markup
Studio Acústica                [ 7 ] %
Engº Silva – Estruturas        [ 0 ] %
BOQ Consultores                [ 5 ] %
```

- Row list is derived from suppliers referenced by this quote's `quote_external_services` (deduped by `supplier_company_id` / `supplier_id`, falling back to the free-text supplier label).
- Each input accepts 0–100, defaults to 0, debounced save.
- Empty state ("No suppliers linked to this quote yet.") when the quote has no external services.

## Schema
New table `quote_supplier_markups` — one row per (quote, supplier) with the admin markup pct.

```
id                   uuid pk
quote_id             uuid  → fee_proposals.id  (cascade delete)
supplier_company_id  uuid  nullable → companies.id
supplier_id          uuid  nullable → pm_suppliers.id
supplier_label       text  nullable  (fallback when neither id is present)
markup_pct           numeric not null default 0  (0–100)
created_at / updated_at
unique (quote_id, supplier_company_id, supplier_id, supplier_label)
```

RLS mirrors `quote_external_services` (same "can edit this quote" rule). Grants for `authenticated` + `service_role`.

Resolution key for a `quote_external_services` row → markup:
1. match `supplier_company_id`, else
2. match `supplier_id`, else
3. match `supplier_label` (case-insensitive, trimmed), else
4. 0%.

## Pricing rule
For every supplier line in the quote:

```
billed_sale_price = row.sale_price × (1 + markup_pct / 100)
```

Cost side (`purchase_price`) unchanged — we still owe the supplier the raw amount. The delta lands in revenue and profit as PSA admin.

## Code surface

### Rollup — single source of truth
`src/lib/quotes/financial-rollups.ts`
- `rollupQuote` gains `supplierMarkups?: Map<lookupKey, pct>` and, when passed, computes `external.value` as the sum of per-row `sale_price × qty × (1 + pct/100)` instead of the flat `rollupExternalServices`.
- New helper `resolveSupplierMarkup(row, markups): number` implementing the 4-step lookup.
- `external.cost`, `internal`, retainer branches unchanged.
- `totalFee`, `total.profit`, `effectiveMargin` naturally pick up the marked-up revenue.

### Hooks
- `src/lib/quotes/use-quote-supplier-markups.ts` (new): `useQuoteSupplierMarkups(quoteId)`, `useUpsertQuoteSupplierMarkup(quoteId)`.
- All existing consumers of `rollupQuote` (planning tab, payment schedule tab, composer live data, contract composition) load the markups map alongside external services and pass it in.

### Consumers to update
- `src/lib/psa-proposal/live-data.ts` — the `consultants` array exposes both `fee` (marked-up = client-billed) and `supplier_fee` (raw). Totals use `fee`.
- `src/components/psa-composer/block-renderer.tsx` — `supplier_fee_table` / consultants totals + subtotal rows.
- `src/components/quotes/payment-schedule-proposal-view.tsx` — composition-of-contract totals, supplier bucket subtotals in the client-facing view.
- `src/components/quotes/quote-planning-tab.tsx` — warnings summary already funnels through `rollupQuote`, so passing the map is enough.

### Where markup does NOT apply
- Outgoing payments to suppliers (`supplierBuckets` in the outflow view) stay at raw `sale_price` — that is what we actually pay them.
- Internal allocations and retainers.

### Settings component
New `src/components/quotes/quote-supplier-markup-editor.tsx`:
- Queries external services for the quote, groups by supplier identity, dedupes.
- Left-joins to `quote_supplier_markups` for current values.
- Renders a compact table (name + `%` input). Debounced upsert on change.
- Invalidates: `quote-supplier-markups`, `quote-financials`, `quote-payment-schedule`, `psa-proposal-live`, `fee-proposal-summary`.

Embedded in `quote-payment-schedule-tab.tsx` inside the Predefinições card.

## Verification
- Set 7% on one supplier → its client-billed subtotal in the composer / composition / payment schedule increases by 7%; totals reconcile; supplier owed amount in outflows unchanged.
- Set 0% → identical to today.
- Add a new supplier line for a supplier not yet in the markup table → treated as 0% until the user sets one.
- Delete the supplier's last external-services line → editor row disappears; the markup row can stay (harmless) or be cleaned up on next edit.
