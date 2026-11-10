# Direct project origin and Gantt locks — 9 November 2026

## Result

No real rows or proposal links changed. B1 remains OFF, revision 10.
BCG and the other four reverse-generated quote projects no longer show a converted-proposal badge or enter conversion-only Gantt restrictions. Mastercard's false editing block is removed, but its converted badge/link remains pending an explicit decision because the stored evidence records conversion.

## Root causes

1. `backfill_quote_from_project` creates approved, locked quotes from existing operational projects, marks them `Auto-generated from project Gantt`, sets both quote project links, copies stages and writes `pm_projects.quote_id`. Its `ensure_project_has_quote` wrapper is exposed by the project's financial placeholder. The five generated rows below share 29 June 2026, 17:24:58.772566 UTC. This identifies the batch backfill path, not the individual operator (no attributable invocation log was found).
2. The 30 July migration `20260730090410_4e54c6e0-b11a-416e-a741-731ca1285545.sql` classified **every** existing non-null quote link as `origin=quote_conversion`, including reverse-generated quotes. The badge likewise treated any link as proof of conversion.
3. The operational Gantt described nullable `stage_role` as a missing unique live record. These are different things: Mastercard has 32 live stages and 30 source links; BCG has 10 live stages and four source links. Neither has stored live roles or an accepted snapshot. The prior implementation therefore blocked all source-linked stages even for Luis. It was not an administrator-permission denial.

## Complete confirmed incorrectly flagged list

| Project | pm_projects.id | fee_proposals.id / existing sourceQuoteId |
|---|---|---|
| 2028 CTR Capital Towers Restaurant | c3f3026e-f41a-4fac-894b-d243af8d3142 | 1bebe96c-fc98-4980-9d7b-ec1c944b8e30 |
| 2502 Uralchem IV | 32810ca9-3c97-4eee-a6b7-a8385a19c972 | 014ad6dd-b03d-49c8-831f-e940595e92ee |
| 2506 Apartamento Tiago Carreiras | f2dce13f-cbe0-4b0a-8f6a-57641b504fbd | 3a491eae-5b89-4136-a270-16778889fe02 |
| 2521 Escritórios BCG | 30f1e184-27c2-4866-bc48-aec1c6ad2e00 | 441ed0f7-9922-4b4d-b7de-f49d30617519 |
| 2522 Escritórios Banco CTT - Atrium 2 | 936b3ca5-6736-40ef-90f3-5381375beb7d | 39f6c151-afb8-426f-ba0c-8c595789a8ff |

All five quote rows have `notas=Auto-generated from project Gantt`; no contract baseline. Their quote links stay intact for existing financial displays. Gantt and badge ignore them as conversion evidence.

## Mastercard: exact disputed rows — approval required before changes

The database contradicts the recollection that this project was directly created. No identity override or data correction was applied.

**pm_projects**
- id: `a07f12ad-5033-4c38-b26b-2077d6ffd55b`
- name: `2609 Mastercard`
- quote_id: `7b4403fc-016f-4d0b-9bc4-823b3c81547d`
- origin: `quote_conversion`
- notes: `Created from quote "2609 Mastercard"`
- created_at: `2026-06-28 23:24:40.650660+00`
- sold_at: `2026-06-28 23:24:40.576000+00`

**fee_proposals**
- id: `7b4403fc-016f-4d0b-9bc4-823b3c81547d`
- titulo: `2609 Mastercard`
- created_at: `2026-06-28 18:40:45.934384+00` (before the project)
- pm_project_id and locked_project_id: `a07f12ad-5033-4c38-b26b-2077d6ffd55b`
- quote_status: `approved`; accepted_snapshot_id: NULL; notas: NULL
- locked_at: `2026-07-31 17:35:33.146301+00`

**pm_project_contract_baseline**
- id: `29c86f4c-af25-4b74-b857-b264a63ce0fb`
- project_id: `a07f12ad-5033-4c38-b26b-2077d6ffd55b`
- quote_id: `7b4403fc-016f-4d0b-9bc4-823b3c81547d`
- snapshot_at: `2026-06-28 23:24:44.802962+00`

The earlier-created quote, conversion note, sold timestamp and four-seconds-later baseline match the legacy conversion path. They do not establish who clicked it. Removing/reclassifying this relationship requires Luis's approval and a scoped follow-up preserving stages, allocations, costs, timesheets, baseline and payments. No proposed DELETEs or baseline removal are included in this fix.

## Remaining reviewed links

All 10 linked operational projects were inspected. Alcanena, Ericeira and Mint II have quote-associated contract baselines and are not confirmed misclassified. `origin=direct` is itself unreliable: Ericeira and Mint II have this value despite recorded conversion baselines, so it was not used as the sole discriminator.

0410B Telheiras Obra (`3775332d-48e7-4042-8ec2-8bde1d475d8e`, quote `fa160815-4960-4de6-9e8a-4efba744694e`) has a preceding quote, one source-linked stage, no baseline and no generated marker. Its provenance is unresolved, not confirmed wrong; link preserved.

## Implementation

- `src/lib/projects/project-provenance.ts`: exact generated-quote classifier; duplicate source-ID detection, independent of nullable roles.
- `src/lib/projects/use-project-provenance.ts`: caller-scoped read-only classification. Missing/inaccessible quotes never establish direct origin.
- `src/components/projects/project-sync-status-badge.tsx`: suppress badge for reverse-generated quotes.
- `src/components/planner/planner-gantt.tsx`: shared operational adapter normalizes provenance for detail/global/quote entry paths; reads and saves live pm_stages directly; nullable roles remain nullable, without inventing client/approval roles. Ambiguous IDs remain blocked.
- `scripts/test-project-provenance.test.ts`: five concrete regression assertions.
- `src/lib/projects/AGENTS.md`, `roadmap.md`: rules and task status.

No migration, permissions, conversion procedure, quote financial displays or B1 code changed.

## Verification

- Before: authenticated Mastercard and BCG both reproduced the missing-record alert and disabled planning controls.
- After: same authenticated read-only check has no mapping alerts or read-only banner on either; BCG's converted badge absent, Mastercard badge retained intentionally pending approval.
- 14 tests PASS: provenance (5) and existing converted schedule (9). i18n audit: zero new candidates. Latest preview build OK.
- Created a single disposable project through Projects' **Create project directly** dialog; verified `origin=direct`, `quote_id=NULL`, no converted badge/block. Edited its stage end date **9 December → 10 December 2026** in the Gantt, reloaded and confirmed both UI and authenticated readback contain the saved date.
- Initial selection attempts failed because stage-name clicks did not open the inspector in that state; each failed attempt was deleted before another fixture was created. Final test used the live date cell.
- All six sequential fixtures deleted; independent database read confirms **0 projects, 0 stages, 0 quotes**. Final successful fixture: `3f320700-ae3b-41b7-84a2-375d5051a1c4`.
- All proposal-row hash unchanged during testing: `31cfc2b6cacf6b7ffdb45f307e0dcf11`. No real-project mutation was issued. Actual real-project edits intentionally not tested.

## Pending

Luis's decision on Mastercard's conflicting stored source evidence. Until then its link/baseline/badge are preserved, while the incorrect nullable-role editing block is fixed.

## Decision — Mastercard (closed, 10 November 2026)
Luis decided 2609 Mastercard stays a converted project. Its proposal link (`7b4403fc-016f-4d0b-9bc4-823b3c81547d`), contract baseline (`29c86f4c-af25-4b74-b857-b264a63ce0fb`), `origin='quote_conversion'` and converted-proposal badge are kept exactly as they are. No data was changed. Item closed.
