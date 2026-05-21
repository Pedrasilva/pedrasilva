## Approach

This is a big-surface change but it does NOT require rebuilding the quote builder. We layer it on top of the existing calculator, planner, Gantt, external services, payment schedule, financial summary and proposal assembly engines. Stage records remain the single source of truth — templates only seed defaults.

Work is split into 5 milestones so each one is reviewable and the build stays green between them.

---

## Milestone 1 — New Quote creation flow (type → template)

**Goal:** When "Create Quote" is clicked, user picks `Project Proposal` or `Time-Based Proposal`, then a template. The current 3-way (Project / Time-based / Construction Retainer) dialog goes away.

- DB (`supabase--migration`):
  - `quote_templates` table: `id`, `code` (e.g. `workplace_large`), `name`, `kind` (`project` | `time_based`), `is_builtin`, `created_by`, `created_at`. Plus `stages_json` (ordered stage names + default duration_weeks + group: `design` | `construction`) and `payment_defaults_json`.
  - Seed built-in templates: Workplace Large, Workplace Small, Health Clinic, Dental Clinic, Hotel, Residential.
  - `quotes.template_code` (text, nullable) so a quote remembers what it was seeded from.
- UI:
  - Replace `quick-quote-dialog` / new-quote entry with a two-step dialog: **Step 1** pick type, **Step 2** pick template (cards). Retainer card removed.
  - "Save as template" action on existing quotes writes a new `quote_templates` row with `is_builtin=false`, user-defined name. Reuse `save-as-template-dialog.tsx`.
- RLS: built-ins readable by all authenticated; custom templates scoped to creator + admins.

## Milestone 2 — Template → stages → Gantt seeding

**Goal:** Picking a template auto-creates the stage list with sequential finish-to-start, 1 week duration each; planner/Gantt picks them up. Stage names stay the single source of truth.

- On template selection, insert rows into `quote_stages` from `stages_json` with: `name`, `order_index`, `group` (`design` / `construction`), `duration_weeks=1`, `start = previous.end + 0`. Existing `use-quote-stages` + `use-quote-planner` continue to drive the Gantt.
- Audit every proposal block / fee table / payment-schedule renderer (`src/lib/proposal-assembly/*`, `quote-payment-schedule-tab`, `quote-fee-calculator-card`) to ensure every stage label is read from the live stage record (by `stage_id`), never from a template string. Replace any leftover hardcoded labels with lookups.

## Milestone 3 — Payment schedule groups + Architecture / External Services billing

**Goal:** Payment schedule reflects Design Stages vs Construction Stage, and lets the user merge or split architecture vs external services invoicing.

- DB:
  - `quote_stages.group` enum: `design` | `construction` (default from template).
  - `quotes.billing_mode` enum: `separate` | `merged` (default `merged`).
  - `payment_schedule_items.scope` enum: `architecture` | `external_services` | `combined`.
- UI in `quote-payment-schedule-tab.tsx`:
  - Group items under two headings: **Design Stages** / **Construction Stage**.
  - Design stages allow: stage / monthly / retainer (retainer rare).
  - Construction stages allow: monthly / retainer. Construction Assistance forced to retainer/monthly (not fixed fee).
  - Toggle: "Bill architecture and external services together / separately". When separate, generate parallel rows per scope, sharing the same stage label.

## Milestone 4 — Construction retainer model + HR ranks + role-based allocations

**Goal:** Construction Assistance behaves as monthly retainer; proposal shows role/rank, not staff names.

- HR DB:
  - `pm_resources.rank` enum: `partner` | `director` | `project_lead_architect` | `senior_architect` | `architect` | `junior_architect` | `interior_designer` | `graphic_designer` | `bim_manager` | `project_coordinator`. Editable from collaborator detail page.
- Allocation aggregation (`src/lib/proposal-roles/aggregate.ts` already exists — extend it):
  - Roll up hours by `rank` per stage, fall back to "Unassigned" if none. Proposal fee table + appendices use rank rows; named-staff view stays in internal planner only.
- Construction retainer model (extend `quote_stages` for construction-group rows):
  - `monthly_retainer_fee`, `estimated_monthly_hours`, `construction_duration_months`, `retainer_review_cycle`. Wired into fee calc, payment schedule rows, proposal narrative metadata. Continues past planned end unless edited.

## Milestone 5 — Workplace master content integration

**Goal:** Picking the Workplace template loads the approved PSA Workplace Master V1 into the proposal document, with full phase narratives, key tasks, deliverables, coordination text, attachments. Dynamic fields only where marked.

- Take the uploaded `Template_workspace_V1.docx` and break it into static block records keyed to `template_code='workplace_large'` (and a trimmed `workplace_small` variant):
  - `quote_template_blocks` table: `template_code`, `slot` (cover / cover_letter / scope / base_info / phases / fees / payment_terms / timeline / exclusions / validity / attachment_i / attachment_ii / attachment_iii), `stage_code` (nullable, for phase blocks), `body_markdown`, `order_index`.
  - For phase blocks, body is the **rich PSA narrative + Key Tasks + Deliverables + Coordination/Approvals** as written in the master. No summarization.
- Proposal assembly (`src/lib/proposal-assembly/assemble.ts`):
  - On render, fetch blocks for `quote.template_code`. For each phase block, replace `{phase_duration_from_gantt}`, `{phase_estimated_hours_from_allocations}`, `{phase_fee_value}`, `{construction_*}`, `{project_name}`, `{client_name}`, `{project_code}`, `{issue_date}`, `{stage_name}` via the existing resolver. Anything dynamic stays in a metadata block separate from the narrative paragraph — never inlined.
  - Stage names always pulled from `quote_stages` (Milestone 2).
- Attachments I / II / III generated from quote planner (Gantt PNG), fee+payment schedule renderer, and the static T&Cs block.

---

## Cross-cutting

- i18n: add EN + PT keys for new dialog steps, group headings, rank labels, billing-mode toggle. Add ranks to `glossary.hr`.
- Auth race fix from previous turn stays in place.
- No new dependencies.

## Verification per milestone

1. New quote → type picker → template picker → quote opens with stages.
2. Rename a stage → name updates in planner, Gantt, fee table, payment schedule, proposal.
3. Payment schedule shows Design vs Construction groups; toggle merges / splits architecture & external services.
4. Construction Assistance always offers monthly/retainer only; rank labels appear in fee allocations.
5. Exported Workplace proposal contains full PSA narratives, dynamic metadata block per phase, three attachments.

## Suggested order of confirmation

Confirm and we ship **Milestone 1 + 2 together** first (smallest user-visible change with biggest unblocking effect), then 3, then 4, then 5. Each milestone ends in a green build and a reviewable preview.
