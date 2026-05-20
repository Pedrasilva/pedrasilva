
# Proposal Role Abstraction Layer — Foundational Infra

This is **additive-only infrastructure**. No existing Gantt, planning, HR, fee, or proposal-UI behavior changes. We introduce a clean separation between *named operational resources* (planning) and *anonymous proposal roles* (commercial output).

## 1. Database (migration)

Add nullable columns to both `collaborators` and `pm_resources`:

- `proposal_role text` — commercial-facing role label (e.g. "Senior Architect")
- `billing_role text` — optional future commercial abstraction (may differ from proposal_role)
- `seniority_level int` — numeric rank for future analytics/blended rates

Plus a reference catalog table `proposal_roles` (id, code, label_en, label_pt, default_seniority, sort_order, archived_at) seeded with the example roles: Partner, Director, Senior Architect, Architect, Junior Architect, BIM Coordinator, Interior Architect, Technical Coordinator. RLS: authenticated read; admin write.

No existing column is dropped, renamed, or altered. No defaults backfill — existing rows simply have NULL until edited.

## 2. HR surface (minimal)

- Add a "Commercial role" group in the collaborator form / `SnapshotMirrorPanel` mirror: read/edit `proposal_role`, `billing_role`, `seniority_level` via a `<Select>` populated from `proposal_roles`. Read-only on `/hr/colaborador/$id` mirror panel; editable on the source form.
- i18n: `glossary.commercialRole`, `glossary.billingRole`, `glossary.seniorityLevel` (EN + PT parity).
- No changes to existing HR titles, departments, or job logic — proposal_role lives alongside.

## 3. Aggregation helpers (new module)

`src/lib/proposal-roles/` (new):

- `types.ts` — `ProposalRole`, `RoleAllocationSummary = { role: string; roleId: string|null; hours: number; resourceCount: number }`
- `aggregate.ts`:
  - `aggregateAllocationsByProposalRole(allocations, resources)` — pure function
  - `aggregateStageAllocationsByProposalRole(stageId, ...)`
  - `aggregatePhaseAllocationsByProposalRole(phaseId, ...)`
  - Fallback: when a resource has no `proposal_role`, bucket under `"Unassigned"` (i18n key) — never leaks the collaborator name.
- `use-proposal-roles.ts` — React Query hook to load the catalog.

These read from the existing `quote_allocations` / `pm_allocations` + `pm_resources` data — no changes to the planning engine, no new writes.

## 4. Proposal resolvers (new, unwired)

`src/lib/proposal-rendering/resolvers/staffing.ts` (new):

- `resolvePhaseDuration(phaseId, ctx)` → `{ weeks, startDate, endDate }`
- `resolvePhaseEstimatedHours(phaseId, ctx)` → number
- `resolvePhaseStaffingMix(phaseId, ctx)` → `RoleAllocationSummary[]`

Re-exported from `src/lib/proposal-rendering/index.ts`. **Not yet wired into any rendered block** — purely available for future ontology blocks. Existing proposal generator stays untouched.

## 5. Fee engine

No code changes. Add a TODO/architecture comment in `src/lib/quotes/fee-calculator.ts` pointing to `proposal-roles` for the future blended-rate path. No new tables, no pricing logic touched.

## 6. Out of scope (explicit)

- No edits to `gantt-chart.tsx`, `quote-planning-tab.tsx`, allocation editors, `proposal-generator.ts`, payment/invoice generation, or any RLS on existing tables.
- No UI replacement of named resources with roles in planning views.
- No blended pricing or new fee math.

## Files touched

**New:**
- migration (collaborators + pm_resources columns, `proposal_roles` table + RLS + seed)
- `src/lib/proposal-roles/types.ts`
- `src/lib/proposal-roles/aggregate.ts`
- `src/lib/proposal-roles/use-proposal-roles.ts`
- `src/lib/proposal-roles/index.ts`
- `src/lib/proposal-rendering/resolvers/staffing.ts`

**Edited (small, additive):**
- `src/lib/proposal-rendering/index.ts` (re-export resolvers)
- `src/lib/quotes/fee-calculator.ts` (architecture comment only)
- `src/components/snapshot/SnapshotMirrorPanel.tsx` (display proposal_role / billing_role / seniority)
- collaborator edit form (the existing one rendering the snapshot/profile fields) — add 3 inputs
- `src/i18n/locales/{en,pt-PT}/glossary.json` + `hr.json` (new keys, parity)

## Validation

- Build passes; types regenerate after migration.
- `aggregateAllocationsByProposalRole` unit-tested via a small `scripts/test-proposal-role-aggregation.mjs` with a fixture: 2 collaborators mapped to "Senior Architect" + 1 to "Architect" → expected `[{role:"Senior Architect", hours:80}, {role:"Architect", hours:40}]`.
- Existing Gantt / quote planning page renders unchanged (`/crm/quotes/...`).
- i18n parity check passes for new keys.
