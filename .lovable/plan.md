## Goal

Make retainers their own first-class proposal type with a simplified workspace, while still allowing a single "mixed" project to combine stage-paid design stages with a retainer-paid construction stage. Surface billed-vs-clocked review in the project module.

## 1. Proposal type chosen at creation

When creating an opportunity / quote, prompt for three types:

- **Standard Project** — stages, allocations, milestones (today's flow).
- **Time-based** — consultancy/hourly (today's flow).
- **Retainer** — new, simplified flow (below).

`quote_category` already supports `project | time_based | retainer | consultancy`. We wire the chooser into the quick-create dialogs so the type is locked in from the start and the workspace adapts.

## 2. Retainer-only workspace

When `quote_category === "retainer"`, the workspace is trimmed to what actually matters:

- **Overview** — client, title, monthly fee, anchor month, number of months (12/18/24 preset + custom), review cadence (3 / 6 months), pricing multiplier.
- **Monthly template** — replaces the Planning Gantt. One month of role allocations (role → hours/month or %, sale/cost rate). This is the "what we deliver every month" definition. Total monthly fee derives from these rows.
- **Financial** — monthly fee × months, cost, margin (already implemented in rollups).
- **Proposal / Publish** — unchanged.

Hidden for retainer-only quotes:
- External Services tab
- Payment Schedule generators (no thirds, no milestones, no down-payment toggle). The schedule is auto-generated monthly from `monthly fee × N months` starting at the anchor and is read-only except for per-row date overrides.

## 3. Mixed project: design + construction retainer (one quote)

For a Standard Project quote, each stage already has a `billing_model` (`stage | monthly | retainer`) and `stage_kind` (`regular | retainer_monthly`). We expose this clearly:

- In the stage editor, a "How is this stage billed?" picker:
  - **Per stage** — single payment at stage end (typical design phases).
  - **Monthly split** — stage fee split evenly across its months.
  - **Retainer** — stage becomes `retainer_monthly`: user sets monthly fee, anchor, duration; allocations are the monthly template; no end-date driven fee — fee = monthly × months.
- The construction stage uses **Retainer**; design stages stay **Per stage** (or Monthly split). The payment schedule generator already handles this mix (`generateByStageBilling` in `src/lib/quotes/payment-generators.ts`) — we just make it the default for mixed quotes and surface the per-stage choice in the UI.

## 4. Review cadence (3 / 6 months) + reconciliation in Projects

Store `retainer_review_months` (3 or 6, default 6) on the retainer stage (or the quote when retainer-only). On the **project page**, add a read-only **Retainer health** panel per retainer stage:

- For each rolling review window (e.g. last 3 or 6 months from today):
  - Hours clocked vs implied hours from monthly template × months elapsed
  - Amount invoiced vs amount that should have been invoiced
  - Variance % with under/on-track/over flags
- No write actions here — it's a signal for the PM to renegotiate or re-scope.

Time logging stays in the project module (already moved per earlier feedback).

## 5. UI cleanup of current bugs

- For `quote_category === "retainer"`, force `payment_plan_type = monthly` and hide the thirds/milestones generators.
- Hide the External Services tab when category is retainer.
- The retainer monthly amount is the source of truth (already true in `payment-generators.ts`); the Overview "Estimated fee" field becomes read-only and displays `monthly × months`.

## Technical notes

- DB: add `retainer_review_months smallint` to `quote_stages` (nullable; only meaningful when `stage_kind = 'retainer_monthly'`). Mirror to `pm_stages` so the project carries it forward at conversion.
- `src/routes/_app.crm.quotes.$quoteId.tsx`: extend the `estimateTabs` branching — a third branch for `category === "retainer"` returning `["overview", "retainer-template", "financial"]`.
- New component `quote-retainer-overview.tsx` (monthly fee + months + anchor + review cadence) and reuse `retainer-stage-editor.tsx` / `retainer-monthly-readings.tsx` for the template.
- Payment schedule: when category is retainer, always run `generateByStageBilling` against the single retainer stage and disable the generator picker.
- Stage editor: expose the existing `billing_model` and `stage_kind` switch with clear copy ("Per stage" / "Monthly split" / "Retainer"). When Retainer is chosen, swap the stage form for the retainer fields (monthly amount, anchor, months, review cadence).
- New "Retainer health" card on `src/routes/_app.projects.$projectId.tsx`, fed by a server fn that joins `pm_time_entries` and `pm_invoices` against the retainer stage window.
- Conversion (`convert` mutation in the quote route) copies `stage_kind`, `retainer_monthly_amount`, `retainer_anchor_month`, `retainer_months`, and the new `retainer_review_months` into `pm_stages`.
- i18n: add `quoteType.retainer.*`, `workspace.tabs.retainerTemplate`, `stage.billingModel.*`, `retainer.review.*` keys in EN + PT-PT in the same edit.

## Out of scope (flag if you want them)

- Auto-suggested fee renegotiation based on variance.
- Cross-project retainer dashboard.
- Automated monthly invoice issuance from the retainer schedule (today it generates the schedule rows; actual invoicing is still manual).
