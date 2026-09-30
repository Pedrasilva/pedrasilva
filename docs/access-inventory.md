# Access inventory — Permissions redesign STEP 1

Read-only snapshot taken 2026-09-30 from the live database (current schema, not migration history) and the current `src/` tree. No code, policy, permission, role or data was changed.

**How access is computed today**

- `has_role(uid,'admin')` (table `user_roles`) — super-user; passes every v1 and v2 check in SQL and the UI.
- **v1** `has_permission(uid,key)` = admin OR a `user_permissions` row with `granted = true` (ignores `scope` and `retired_at`). The UI hook `useMyPermissions` reads **every** row for the user, *including `granted = false`* (see Anomalies).
- **v2** `list_user_effective_permissions(uid)` = rank baseline (`role_permissions` × `user_role_assignments`) ∪ personal rows `granted = true` − personal rows `granted = false` **with the exact same key AND scope**. `has_module_permission` then applies scope rank own<assigned<team<department<all.
- v1 and v2 personal rows share the same table `user_permissions`; the key name decides which system reads it.
- **Collaborator baseline** (`COLLABORATOR_BASELINE` in `src/hooks/use-permissions.tsx`: hr.minha-ficha, hr.dias-uteis, hr.beneficios.own, hr.ferias.own, projects.my-tasks, projects.timesheet) is only injected when an admin uses **View As**. It never applies to a real sign-in, so it is not a source for any row in section 3.
- `pending_user_permissions` (pre-grants by email): 0 rows.

## 1. Key mapping

"src files" = files in `src/` that reference the key literally, excluding the two catalogue files (`permissions.ts`, `permissions-v2.ts`) and translations. "DB" = current `pg_policies` (public + storage) and `public` functions whose body contains the quoted key. Functions called by policies (e.g. `can_approve_benefits`, `pm_can_view_projects`) enforce transitively. **Dead** = 0 src files and 0 DB references.

### v1 keys (src/lib/permissions.ts)

| Key | Proposed item (level) | src files | DB policies | DB functions | Dead? |
|---|---|---|---|---|---|
| `crm.companies` | crm.edit (Edit) | 3 | 3 | `handle_new_user` | no |
| `crm.contacts` | crm.edit (Edit) | 3 | 3 | `handle_new_user` | no |
| `crm.pipeline` | crm.edit (Edit) | 2 | 49 | `handle_new_user`, `clone_fee_proposal_as_revision`, `soft_delete_fee_proposal` | no |
| `finance.dashboard` | finance.edit (Edit) | 7 | 86 | `hr_dashboard_alerts_finance`, `finance_settle_expense` | no |
| `hr.admin` | hr.settings (Edit) | 2 | 7 | `remote_work_can_approve` | no |
| `hr.beneficios.approve` | hr.approve (Edit) | 3 | 0 | `can_approve_benefits` | no |
| `hr.beneficios.own` | hr.self (Edit) | 3 | 0 | `handle_new_user` | no |
| `hr.colaborador.compensation.view` | hr.compensation (View) | 1 | 2 | — | no |
| `hr.colaborador.edit` | hr.people (Edit) | 1 | 0 | — | no |
| `hr.colaborador.view` | hr.people (View) | 1 | 1 | `list_collaborators_basic` | no |
| `hr.colaboradores` | hr.people (View) | 6 | 1 | `suggest_role_for_user`, `list_collaborators_basic` | no |
| `hr.dias-uteis` | hr.self (View) | 1 | 1 | `handle_new_user` | no |
| `hr.ferias.own` | hr.self (Edit) | 5 | 0 | `handle_new_user` | no |
| `hr.minha-ficha` | hr.self (View) | 2 | 0 | `handle_new_user` | no |
| `hr.resumo` | hr.people (View) | 3 | 0 | — | no |
| `hr.resumo.compensation.view` | hr.compensation (View) | 1 | 2 | — | no |
| `hr.subsidio-alimentacao` | hr.settings (Edit) | 2 | 0 | `suggest_role_for_user` | no |
| `hr.valor-bo` | hr.settings (Edit) | 1 | 1 | `suggest_role_for_user` | no |
| `inbox.triage` | inbox (Edit) | 4 | 2 | — | no |
| `projects.all` | projects.work (View) | 3 | 4 | `suggest_role_for_user` | no |
| `projects.gantt` | projects.work (View) | 2 | 0 | — | no |
| `projects.resources` | projects.work (View) | 1 | 0 | `suggest_role_for_user` | no |
| `projects.my-tasks` | projects.work (View) | 2 | 0 | `handle_new_user` | no |
| `projects.financials` | projects.financials (View) | 5 | 10 | `suggest_role_for_user` | no |
| `projects.timesheet` | time.own (Edit) | 3 | 0 | `handle_new_user` | no |

### v2 keys (src/lib/permissions-v2.ts + DB-only)

| Key | Proposed item (level) | src files | DB policies | DB functions | Dead? |
|---|---|---|---|---|---|
| `projects.view` | projects.work (View) | 1 | 4 | `pm_can_view_projects` | no |
| `projects.edit_planning` | projects.plan (Edit) | 3 | 8 | — | no |
| `projects.edit_stages` | projects.plan (Edit) | 0 | 8 | — | no |
| `projects.view_financials` | projects.financials (View) | 1 | 6 | — | no |
| `projects.view_margins` | projects.margins_rates (View) | 0 | 0 | — | **DEAD** |
| `scheduling.view` | projects.work (View) | 0 | 0 | — | **DEAD** |
| `scheduling.view_team` | **does not fit** (see below) | 1 | 0 | — | no |
| `scheduling.edit` | projects.plan (Edit) | 0 | 0 | — | **DEAD** |
| `timesheets.log` | time.own (Edit) | 2 | 0 | — | no |
| `timesheets.view_team` | time.team (View) | 0 | 1 | — | no |
| `timesheets.approve` | time.approve (Team/All by scope) | 3 | 1 | `pm_can_approve_hours`, `pm_can_approve_hours` | no |
| `financials.view` | projects.financials (View) | 0 | 0 | — | **DEAD** |
| `financials.view_rates` | projects.margins_rates (View) | 0 | 0 | — | **DEAD** |
| `crm.companies.view` | crm.view (View) | 1 | 0 | — | no |
| `crm.contacts.view` | crm.view (View) | 1 | 0 | — | no |
| `crm.pipeline.view` | crm.view (View) | 4 | 1 | — | no |
| `crm.companies.edit` | crm.edit (Edit) | 0 | 0 | — | **DEAD** |
| `crm.contacts.edit` | crm.edit (Edit) | 0 | 0 | — | **DEAD** |
| `crm.pipeline.edit` | crm.edit (Edit) | 1 | 0 | — | no |
| `crm.quotes.manage` | crm.edit (Edit) | 0 | 0 | — | **DEAD** |
| `hr.self.view` | hr.self (View) | 1 | 0 | — | no |
| `hr.benefits.submit` | hr.self (Edit) | 0 | 0 | — | **DEAD** |
| `hr.leave.request` | hr.self (Edit) | 0 | 0 | — | **DEAD** |
| `hr.wfh.request` | hr.self (Edit) | 0 | 0 | — | **DEAD** |
| `hr.collaborators.view` | hr.people (View) | 0 | 1 | — | no |
| `hr.collaborator.view` | hr.people (View) | 0 | 1 | — | no |
| `hr.collaborator.edit` | hr.people (Edit) | 0 | 0 | — | **DEAD** |
| `hr.compensation.view` | hr.compensation (View) | 0 | 1 | — | no |
| `hr.benefits.approve` | hr.approve (Edit) | 0 | 1 | — | no |
| `hr.leave.approve` | hr.approve (Edit) | 1 | 1 | `remote_work_can_approve` | no |
| `hr.admin` | hr.settings (Edit) | 2 | 7 | `remote_work_can_approve` | no |
| `finance.dashboard.view` | finance.view (View) | 0 | 0 | — | **DEAD** |
| `finance.documents.view` | finance.view (View) | 0 | 2 | — | no |
| `finance.banking.view` | finance.view (View) | 0 | 0 | — | **DEAD** |
| `finance.reports.view` | finance.view (View) | 0 | 0 | — | **DEAD** |
| `finance.documents.edit` | finance.edit (Edit) | 1 | 6 | — | no |
| `finance.banking.edit` | finance.edit (Edit) | 0 | 0 | — | **DEAD** |
| `finance.settings.manage` | finance.edit (Edit) | 0 | 0 | — | **DEAD** |
| `inventory.view` | inventory (View) | 1 | 9 | — | no |
| `products.view` | products.use (View) | 1 | 9 | — | no |
| `products.edit` | products.edit (Edit) | 4 | 11 | — | no |
| `portfolio.view` | portfolio.view (View) | 1 | 0 | — | no |
| `marketing.contribute` | marketing.contribute (Edit) | 2 | 4 | `marketing_can_brief_profile` | no |
| `marketing.view` | marketing.contribute (View) | 6 | 5 | `marketing_effective_clearance` | no |
| `marketing.curate` | marketing.curate (Edit) | 11 | 24 | `marketing_project_profiles_before_write`, `marketing_recheck_draft_readiness`, `marketing_nudges_guard`, `marketing_captures_guard_delete`, `marketing_can_arrange_capture`, `marketing_can_brief_profile`, `marketing_curator_user_ids` | no |
| `marketing.edit_bible` | marketing.bible (Edit) | 1 | 1 | — | no |
| `reports.view` | reports (View) | 3 | 0 | — | no |

Notes on the mapping:
- `handle_new_user` references most self-service v1 keys only to **seed** new users, and `suggest_role_for_user` references keys only to **suggest** a rank; neither enforces access.
- v1 CRM keys and `finance.dashboard` map to **Edit** because the same key guards both reads and writes in RLS (v1 has no view/edit split). `finance.dashboard` alone appears in 86 policies.
- `hr.wfh.request` exists only as a `role_permissions` row (architect) — not in the TS catalogue, never checked: dead.
- `marketing.view` (own/all) folds into `marketing.contribute`; the own/all distinction is lost (everyone holds `all` via rank today).

### Keys that do not fit any proposed item

- `scheduling.view_team` (v2) — "see workload and bookings of other people" on the Gantt/scheduling; checked in `src/routes/_app.projects.index.tsx`, no DB enforcement. Closest candidates are `projects.work` or `time.team`, but neither covers other people's allocations. Not assigned.
- No existing key controls **hr.availability** (see Anomalies: gated by `hr.ferias.own`).

## 2. Rank defaults

### role_permissions per pm_role

- **admin** (44): `crm.companies.edit:all`, `crm.companies.view:all`, `crm.contacts.edit:all`, `crm.contacts.view:all`, `crm.pipeline.edit:all`, `crm.pipeline.view:all`, `crm.quotes.manage:all`, `finance.banking.edit:all`, `finance.banking.view:all`, `finance.dashboard.view:all`, `finance.documents.edit:all`, `finance.documents.view:all`, `finance.reports.view:all`, `finance.settings.manage:all`, `financials.view:all`, `financials.view_rates:all`, `hr.admin:all`, `hr.benefits.approve:all`, `hr.benefits.submit:own`, `hr.collaborator.edit:all`, `hr.collaborator.view:all`, `hr.collaborators.view:all`, `hr.compensation.view:all`, `hr.leave.approve:all`, `hr.leave.request:own`, `hr.self.view:own`, `hr.wfh.request:own`, `inventory.view:all`, `marketing.edit_bible:all`, `portfolio.view:all`, `products.edit:all`, `products.view:all`, `projects.edit_planning:all`, `projects.edit_stages:all`, `projects.view:all`, `projects.view_financials:all`, `projects.view_margins:all`, `reports.view:all`, `scheduling.edit:all`, `scheduling.view:all`, `scheduling.view_team:all`, `timesheets.approve:all`, `timesheets.log:own`, `timesheets.view_team:all`
- **partner** (28): `crm.companies.edit:all`, `crm.companies.view:all`, `crm.contacts.edit:all`, `crm.contacts.view:all`, `crm.pipeline.edit:all`, `crm.pipeline.view:all`, `crm.quotes.manage:all`, `financials.view:all`, `financials.view_rates:all`, `hr.benefits.approve:all`, `hr.benefits.submit:own`, `hr.collaborator.view:all`, `hr.collaborators.view:all`, `hr.compensation.view:all`, `hr.leave.request:own`, `hr.self.view:own`, `marketing.contribute:own`, `marketing.view:all`, `portfolio.view:all`, `products.view:all`, `projects.view:all`, `projects.view_financials:all`, `projects.view_margins:all`, `scheduling.view:all`, `scheduling.view_team:all`, `timesheets.approve:all`, `timesheets.log:own`, `timesheets.view_team:all`
- **project_lead** (25): `crm.companies.view:all`, `crm.contacts.view:all`, `crm.pipeline.edit:assigned`, `crm.pipeline.view:all`, `crm.quotes.manage:assigned`, `hr.benefits.submit:own`, `hr.collaborators.view:team`, `hr.leave.request:own`, `hr.self.view:own`, `marketing.contribute:own`, `marketing.view:all`, `portfolio.view:all`, `products.edit:all`, `products.view:all`, `projects.edit_planning:assigned`, `projects.edit_stages:assigned`, `projects.view:all`, `projects.view_financials:assigned`, `projects.view_margins:assigned`, `scheduling.edit:team`, `scheduling.view:all`, `scheduling.view_team:team`, `timesheets.approve:team`, `timesheets.log:own`, `timesheets.view_team:team`
- **architect** (14): `hr.benefits.submit:own`, `hr.leave.request:own`, `hr.self.view:own`, `hr.wfh.request:own`, `marketing.contribute:own`, `marketing.view:all`, `portfolio.view:all`, `products.view:all`, `projects.edit_planning:all`, `projects.edit_stages:all`, `projects.view:all`, `scheduling.view:own`, `timesheets.log:own`, `timesheets.view_team:team`
- **hr** (22): `crm.companies.view:all`, `crm.contacts.view:all`, `hr.admin:all`, `hr.benefits.approve:all`, `hr.benefits.submit:own`, `hr.collaborator.edit:all`, `hr.collaborator.view:all`, `hr.collaborators.view:all`, `hr.compensation.view:all`, `hr.leave.request:own`, `hr.self.view:own`, `marketing.contribute:own`, `marketing.view:all`, `portfolio.view:all`, `products.view:all`, `projects.view:all`, `projects.view_financials:all`, `projects.view_margins:all`, `scheduling.view:all`, `scheduling.view_team:all`, `timesheets.log:own`, `timesheets.view_team:all`
- **finance** (26): `crm.companies.view:all`, `crm.contacts.view:all`, `crm.pipeline.view:all`, `finance.banking.edit:all`, `finance.banking.view:all`, `finance.dashboard.view:all`, `finance.documents.edit:all`, `finance.documents.view:all`, `finance.reports.view:all`, `finance.settings.manage:all`, `financials.view:all`, `financials.view_rates:all`, `hr.benefits.submit:own`, `hr.collaborators.view:all`, `hr.compensation.view:all`, `hr.leave.request:own`, `hr.self.view:own`, `marketing.contribute:own`, `marketing.view:all`, `portfolio.view:all`, `products.view:all`, `projects.view:all`, `projects.view_financials:all`, `projects.view_margins:all`, `timesheets.log:own`, `timesheets.view_team:all`

### Ranks held by the 12 active users

| User | pm_role(s) (`user_role_assignments`) | admin flag (`user_roles`) |
|---|---|---|
| Adalberto Duarte | architect | no |
| Bernardo Nadais | project_lead | no |
| Francisco Oliveira | architect | no |
| Irene Cunha | hr,partner | no |
| João Almeida | architect | no |
| Luis Pedra Silva | admin | yes |
| Mariana Oliveira | architect | no |
| Patricia Reis | project_lead | no |
| Ricardo Cabrita | architect | no |
| Ricardo Conceição | hr,architect | no |
| Rita Saragoça | architect | no |
| Tatiana Shchenina | hr,finance | no |

Also present: one non-collaborator account (`luispedrasilva@gmail.com`, test) with rank architect and no `user_roles` row; excluded from sections 3–4. Rita Costa is archived and has no account.

## 3. Access table (current effective level)

Level: None / View / Edit; `time.approve` shown as Team / All. Source lists every row that yields the top level. "—" = None.

### Summary grid

| User | `projects.work` | `projects.plan` | `time.own` | `hr.self` | `hr.availability` | `products.use` | `portfolio.view` | `marketing.contribute` | `projects.financials` | `projects.margins_rates` | `time.team` | `time.approve` | `hr.people` | `hr.compensation` | `hr.approve` | `hr.settings` | `products.edit` | `marketing.curate` | `marketing.bible` | `crm.view` | `crm.edit` | `finance.view` | `finance.edit` | `inbox` | `reports` | `inventory` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Adalberto Duarte | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | Edit | — | — | — | — | — |
| Bernardo Nadais | View | Edit | Edit | Edit | View | View | View | Edit | View | View | View | Team | View | — | — | — | Edit | — | — | View | Edit | — | — | — | — | — |
| Francisco Oliveira | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Irene Cunha | View | — | Edit | Edit | View | View | View | Edit | View | View | View | All | Edit | View | Edit | Edit | — | — | — | View | Edit | — | — | — | — | — |
| João Almeida | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Luis Pedra Silva | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | All | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit |
| Mariana Oliveira | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Patricia Reis | View | Edit | Edit | Edit | View | View | View | Edit | View | View | View | Team | View | — | — | — | Edit | — | — | View | Edit | — | — | — | — | — |
| Ricardo Cabrita | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Ricardo Conceição | View | Edit | Edit | Edit | View | View | View | Edit | View | View | View | — | Edit | View | Edit | Edit | — | — | — | View | Edit | — | — | — | — | — |
| Rita Saragoça | View | Edit | Edit | Edit | View | View | View | Edit | — | — | View | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Tatiana Shchenina | View | — | Edit | Edit | View | View | View | Edit | View | View | View | — | Edit | View | Edit | Edit | — | — | — | View | Edit | View | Edit | — | — | — |

### Sources per user

**Adalberto Duarte** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.my-tasks
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own; personal v1: projects.timesheet
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team
- `crm.edit`: Edit — personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline

**Bernardo Nadais** (project_lead)

- `projects.work`: View — rank project_lead: projects.view:all; rank project_lead: scheduling.view:all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank project_lead: projects.edit_planning:assigned; rank project_lead: projects.edit_stages:assigned; rank project_lead: scheduling.edit:team
- `time.own`: Edit — rank project_lead: timesheets.log:own
- `hr.self`: Edit — rank project_lead: hr.benefits.submit:own; rank project_lead: hr.leave.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank project_lead: products.view:all
- `portfolio.view`: View — rank project_lead: portfolio.view:all
- `marketing.contribute`: Edit — rank project_lead: marketing.contribute:own
- `projects.financials`: View — rank project_lead: projects.view_financials:assigned
- `projects.margins_rates`: View — rank project_lead: projects.view_margins:assigned
- `time.team`: View — rank project_lead: timesheets.view_team:team
- `time.approve`: Team — rank project_lead: timesheets.approve:team
- `hr.people`: View — rank project_lead: hr.collaborators.view:team
- `products.edit`: Edit — rank project_lead: products.edit:all
- `crm.view`: View — rank project_lead: crm.companies.view:all; rank project_lead: crm.contacts.view:all; rank project_lead: crm.pipeline.view:all
- `crm.edit`: Edit — rank project_lead: crm.pipeline.edit:assigned; rank project_lead: crm.quotes.manage:assigned; personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline

**Francisco Oliveira** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team

**Irene Cunha** (hr,partner)

- `projects.work`: View — rank hr: projects.view:all; rank hr: scheduling.view:all; rank partner: projects.view:all; rank partner: scheduling.view:all; personal v1: projects.all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `time.own`: Edit — rank hr: timesheets.log:own; rank partner: timesheets.log:own
- `hr.self`: Edit — rank hr: hr.benefits.submit:own; rank hr: hr.leave.request:own; rank partner: hr.benefits.submit:own; rank partner: hr.leave.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank hr: products.view:all; rank partner: products.view:all
- `portfolio.view`: View — rank hr: portfolio.view:all; rank partner: portfolio.view:all
- `marketing.contribute`: Edit — rank hr: marketing.contribute:own; rank partner: marketing.contribute:own
- `projects.financials`: View — rank hr: projects.view_financials:all; rank partner: projects.view_financials:all; rank partner: financials.view:all; personal v1: projects.financials
- `projects.margins_rates`: View — rank hr: projects.view_margins:all; rank partner: projects.view_margins:all; rank partner: financials.view_rates:all
- `time.team`: View — rank hr: timesheets.view_team:all; rank partner: timesheets.view_team:all
- `time.approve`: All — rank partner: timesheets.approve:all
- `hr.people`: Edit — rank hr: hr.collaborator.edit:all; personal v1: hr.colaborador.edit
- `hr.compensation`: View — rank hr: hr.compensation.view:all; rank partner: hr.compensation.view:all; personal v1: hr.colaborador.compensation.view; personal v1: hr.resumo.compensation.view
- `hr.approve`: Edit — rank hr: hr.benefits.approve:all; rank partner: hr.benefits.approve:all; personal v1: hr.beneficios.approve
- `hr.settings`: Edit — rank hr: hr.admin:all; personal v1: hr.admin; personal v1: hr.subsidio-alimentacao; personal v1: hr.valor-bo
- `crm.view`: View — rank hr: crm.companies.view:all; rank hr: crm.contacts.view:all; rank partner: crm.companies.view:all; rank partner: crm.contacts.view:all; rank partner: crm.pipeline.view:all
- `crm.edit`: Edit — rank partner: crm.companies.edit:all; rank partner: crm.contacts.edit:all; rank partner: crm.pipeline.edit:all; rank partner: crm.quotes.manage:all; personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline

**João Almeida** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team

**Luis Pedra Silva** (admin, admin)

- `projects.work`: Edit — admin
- `projects.plan`: Edit — admin
- `time.own`: Edit — admin
- `hr.self`: Edit — admin
- `hr.availability`: Edit — admin
- `products.use`: Edit — admin
- `portfolio.view`: Edit — admin
- `marketing.contribute`: Edit — admin
- `projects.financials`: Edit — admin
- `projects.margins_rates`: Edit — admin
- `time.team`: Edit — admin
- `time.approve`: All — admin
- `hr.people`: Edit — admin
- `hr.compensation`: Edit — admin
- `hr.approve`: Edit — admin
- `hr.settings`: Edit — admin
- `products.edit`: Edit — admin
- `marketing.curate`: Edit — admin
- `marketing.bible`: Edit — admin
- `crm.view`: Edit — admin
- `crm.edit`: Edit — admin
- `finance.view`: Edit — admin
- `finance.edit`: Edit — admin
- `inbox`: Edit — admin
- `reports`: Edit — admin
- `inventory`: Edit — admin

**Mariana Oliveira** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own; personal v1: projects.timesheet
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team

**Patricia Reis** (project_lead)

- `projects.work`: View — rank project_lead: projects.view:all; rank project_lead: scheduling.view:all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank project_lead: projects.edit_planning:assigned; rank project_lead: projects.edit_stages:assigned; rank project_lead: scheduling.edit:team
- `time.own`: Edit — rank project_lead: timesheets.log:own
- `hr.self`: Edit — rank project_lead: hr.benefits.submit:own; rank project_lead: hr.leave.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank project_lead: products.view:all
- `portfolio.view`: View — rank project_lead: portfolio.view:all
- `marketing.contribute`: Edit — rank project_lead: marketing.contribute:own
- `projects.financials`: View — rank project_lead: projects.view_financials:assigned
- `projects.margins_rates`: View — rank project_lead: projects.view_margins:assigned
- `time.team`: View — rank project_lead: timesheets.view_team:team
- `time.approve`: Team — rank project_lead: timesheets.approve:team
- `hr.people`: View — rank project_lead: hr.collaborators.view:team
- `products.edit`: Edit — rank project_lead: products.edit:all
- `crm.view`: View — rank project_lead: crm.companies.view:all; rank project_lead: crm.contacts.view:all; rank project_lead: crm.pipeline.view:all
- `crm.edit`: Edit — rank project_lead: crm.pipeline.edit:assigned; rank project_lead: crm.quotes.manage:assigned; personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline

**Ricardo Cabrita** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all; personal v2: projects.edit_planning:all; personal v2: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team

**Ricardo Conceição** (hr,architect)

- `projects.work`: View — rank hr: projects.view:all; rank hr: scheduling.view:all; rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all; personal v2: projects.edit_planning:all; personal v2: projects.edit_stages:all
- `time.own`: Edit — rank hr: timesheets.log:own; rank architect: timesheets.log:own
- `hr.self`: Edit — rank hr: hr.benefits.submit:own; rank hr: hr.leave.request:own; rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank hr: products.view:all; rank architect: products.view:all
- `portfolio.view`: View — rank hr: portfolio.view:all; rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank hr: marketing.contribute:own; rank architect: marketing.contribute:own
- `projects.financials`: View — rank hr: projects.view_financials:all
- `projects.margins_rates`: View — rank hr: projects.view_margins:all
- `time.team`: View — rank hr: timesheets.view_team:all; rank architect: timesheets.view_team:team
- `hr.people`: Edit — rank hr: hr.collaborator.edit:all; personal v1: hr.colaborador.edit
- `hr.compensation`: View — rank hr: hr.compensation.view:all; personal v1: hr.colaborador.compensation.view; personal v1: hr.resumo.compensation.view
- `hr.approve`: Edit — rank hr: hr.benefits.approve:all; personal v1: hr.beneficios.approve
- `hr.settings`: Edit — rank hr: hr.admin:all; personal v1: hr.admin; personal v1: hr.subsidio-alimentacao; personal v1: hr.valor-bo
- `crm.view`: View — rank hr: crm.companies.view:all; rank hr: crm.contacts.view:all
- `crm.edit`: Edit — personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline

**Rita Saragoça** (architect)

- `projects.work`: View — rank architect: scheduling.view:own; rank architect: projects.view:all; personal v1: projects.all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `projects.plan`: Edit — rank architect: projects.edit_planning:all; rank architect: projects.edit_stages:all
- `time.own`: Edit — rank architect: timesheets.log:own; personal v1: projects.timesheet
- `hr.self`: Edit — rank architect: hr.benefits.submit:own; rank architect: hr.leave.request:own; rank architect: hr.wfh.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank architect: products.view:all
- `portfolio.view`: View — rank architect: portfolio.view:all
- `marketing.contribute`: Edit — rank architect: marketing.contribute:own
- `time.team`: View — rank architect: timesheets.view_team:team

**Tatiana Shchenina** (hr,finance)

- `projects.work`: View — rank hr: projects.view:all; rank hr: scheduling.view:all; rank finance: projects.view:all; personal v1: projects.all; personal v1: projects.gantt; personal v1: projects.my-tasks; personal v1: projects.resources
- `time.own`: Edit — rank hr: timesheets.log:own; rank finance: timesheets.log:own
- `hr.self`: Edit — rank hr: hr.benefits.submit:own; rank hr: hr.leave.request:own; rank finance: hr.benefits.submit:own; rank finance: hr.leave.request:own; personal v1: hr.beneficios.own; personal v1: hr.ferias.own
- `hr.availability`: View — personal v1: hr.ferias.own (page gate)
- `products.use`: View — rank hr: products.view:all; rank finance: products.view:all
- `portfolio.view`: View — rank hr: portfolio.view:all; rank finance: portfolio.view:all
- `marketing.contribute`: Edit — rank hr: marketing.contribute:own; rank finance: marketing.contribute:own
- `projects.financials`: View — rank hr: projects.view_financials:all; rank finance: projects.view_financials:all; rank finance: financials.view:all; personal v1: projects.financials
- `projects.margins_rates`: View — rank hr: projects.view_margins:all; rank finance: projects.view_margins:all; rank finance: financials.view_rates:all
- `time.team`: View — rank hr: timesheets.view_team:all; rank finance: timesheets.view_team:all
- `hr.people`: Edit — rank hr: hr.collaborator.edit:all; personal v1: hr.colaborador.edit
- `hr.compensation`: View — rank hr: hr.compensation.view:all; rank finance: hr.compensation.view:all; personal v1: hr.colaborador.compensation.view; personal v1: hr.resumo.compensation.view
- `hr.approve`: Edit — rank hr: hr.benefits.approve:all; personal v1: hr.beneficios.approve
- `hr.settings`: Edit — rank hr: hr.admin:all; personal v1: hr.admin; personal v1: hr.subsidio-alimentacao; personal v1: hr.valor-bo
- `crm.view`: View — rank hr: crm.companies.view:all; rank hr: crm.contacts.view:all; rank finance: crm.companies.view:all; rank finance: crm.contacts.view:all; rank finance: crm.pipeline.view:all
- `crm.edit`: Edit — personal v1: crm.companies; personal v1: crm.contacts; personal v1: crm.pipeline
- `finance.view`: View — rank finance: finance.dashboard.view:all; rank finance: finance.documents.view:all; rank finance: finance.banking.view:all; rank finance: finance.reports.view:all
- `finance.edit`: Edit — rank finance: finance.documents.edit:all; rank finance: finance.banking.edit:all; rank finance: finance.settings.manage:all; personal v1: finance.dashboard

## 4. Differences vs proposed defaults

GAIN = standard item the user lacks today (would get it by default). KEEP-GRANT = confidential item held today that must be granted explicitly to keep. Admin (Luis) is unaffected — admin flag stays.

**Adalberto Duarte**
- GAIN: none
- KEEP-GRANT: time.team (View), crm.edit (Edit)

**Bernardo Nadais**
- GAIN: none
- KEEP-GRANT: projects.financials (View), projects.margins_rates (View), time.team (View), time.approve (Team), hr.people (View), products.edit (Edit), crm.view (View), crm.edit (Edit)

**Francisco Oliveira**
- GAIN: none
- KEEP-GRANT: time.team (View)

**Irene Cunha**
- GAIN: projects.plan
- KEEP-GRANT: projects.financials (View), projects.margins_rates (View), time.team (View), time.approve (All), hr.people (Edit), hr.compensation (View), hr.approve (Edit), hr.settings (Edit), crm.view (View), crm.edit (Edit)

**João Almeida**
- GAIN: none
- KEEP-GRANT: time.team (View)

**Luis Pedra Silva** — admin: no differences.

**Mariana Oliveira**
- GAIN: none
- KEEP-GRANT: time.team (View)

**Patricia Reis**
- GAIN: none
- KEEP-GRANT: projects.financials (View), projects.margins_rates (View), time.team (View), time.approve (Team), hr.people (View), products.edit (Edit), crm.view (View), crm.edit (Edit)

**Ricardo Cabrita**
- GAIN: none
- KEEP-GRANT: time.team (View)

**Ricardo Conceição**
- GAIN: none
- KEEP-GRANT: projects.financials (View), projects.margins_rates (View), time.team (View), hr.people (Edit), hr.compensation (View), hr.approve (Edit), hr.settings (Edit), crm.view (View), crm.edit (Edit)

**Rita Saragoça**
- GAIN: none
- KEEP-GRANT: time.team (View)

**Tatiana Shchenina**
- GAIN: projects.plan
- KEEP-GRANT: projects.financials (View), projects.margins_rates (View), time.team (View), hr.people (Edit), hr.compensation (View), hr.approve (Edit), hr.settings (Edit), crm.view (View), crm.edit (Edit), finance.view (View), finance.edit (Edit)

## 5. Anomalies

### 5.1 Personal rows with `retired_at` set but `granted = true`
None. All 13 retired rows are `granted = false` (8 × `projects.timesheet`, 5 × `projects.all`). No active row has `retired_at` set.

However, the retired **revoke** rows are still read as grants by the UI:
- `useMyPermissions` (`src/hooks/use-permissions.tsx`) selects `permission_key` from `user_permissions` with no filter on `granted` or `retired_at`. So for Bernardo, Ricardo Cabrita, Patricia, João and Francisco the UI believes they hold `projects.all` and `projects.timesheet`; for Tatiana, Ricardo Conceição and Irene it believes they hold `projects.timesheet`.
- The database side (`has_permission`) correctly requires `granted = true`, so RLS is not affected. Practical UI effect today is small because `projects.view:all` and `timesheets.log:own` come from every rank anyway.
- `has_permission` and `list_user_effective_permissions` both ignore `retired_at`; if a retired row were ever `granted = true`, it would still grant.

### 5.2 Revokes that do not cancel a rank grant
Every revoke row uses a **v1** key (`projects.all`, `projects.timesheet`) with scope `all`. `role_permissions` contains only v2 keys, so none of these revokes cancels any rank grant — they are no-ops in `list_user_effective_permissions`. The intended effect (hide all projects / timesheet) is not happening in v2: every affected user still gets `projects.view:all` and `timesheets.log:own` from their rank.
Structural risk: a v2 revoke only cancels an identical `(key, scope)`. E.g. a revoke of `projects.view:all` would leave a rank `projects.view:assigned` in place, and a revoke at `assigned` would not remove a rank grant at `all`. No such v2 revokes exist today.

### 5.3 v1 keys held by users that control nothing
- `hr.dias-uteis` (8 users) — only referenced in the View-As baseline list and the `handle_new_user` seed; no page or policy checks it.
- `projects.gantt` (10), `projects.resources` (10), `projects.my-tasks` (11) — only checked in `src/components/GlobalTopNav.tsx`, which is rendered only by `ModuleTopNav.tsx`; the current shell navigation (`AppRail`/`nav-config`) and routes do not check them. No DB enforcement (only the seed / role-suggestion functions mention them).
- `projects.timesheet` (Adalberto, Mariana, Rita Saragoça, active) — superseded by `timesheets.log:own` from every rank; only a fallback in module access / GlobalTopNav.
- `projects.all` (5 active) — superseded by `projects.view:all` from every rank; still referenced in 4 policies, so it is redundant rather than inert.
- `hr.minha-ficha` (11) — checked only in the HR sub-navigation (`_app.hr.tsx`); the HR module gate itself accepts any `hr.*` v1 key or `hr.self.view`.
- v2 `hr.wfh.request` (rank architect) — never checked anywhere.

### 5.4 How team availability (`/hr/disponibilidade`) is gated today
- Route: `<PermissionGate permission="hr.ferias.own">` — a **v1** key (own-leave self-service). Anyone with that personal v1 row (all 11 non-admin active users, plus admin) can open the page. There is no dedicated key.
- Detail level (absence types) inside the page: `isAdmin || permissions.has("hr.leave.approve") || permissions.has("hr.admin")`, evaluated against the **v1** permission set. `hr.leave.approve` is a v2 key that no one holds as a personal row, so in practice only admin and v1 `hr.admin` holders (Irene, Ricardo Conceição, Tatiana) see detail; the v2 rank grant of `hr.leave.approve` would be ignored here.
- Sub-navigation link in `_app.hr.tsx`; data comes from `use-team-availability.ts` under existing RLS on vacation/remote-work tables.
- A new user without a personal `hr.ferias.own` row (the seed in `handle_new_user` adds it) would not see the page.
