# Team Leave and Availability — audit and integration plan

## 1. What already exists

**HR module** (left sidebar inside `/hr`, two groups: People / Compensation)
- My profile, Collaborators, Collaborator file, Comparative summary
- **Vacation & absences** (`/hr/ferias`) — request/approve/delete leave, balance panel, year calendar
- **Work from home** (`/hr/trabalho-remoto`) — requests, history/calendar, analytics, settings/approvers
- Benefits (overview + expenses), Meal allowance, Working days & holidays, BO value, HR admin

Other modules: Home hub, CRM, Projects (planner/Gantt, forecast, timesheets), Finance, Inventory, Product Library, Inbox.

**Leave data already in the database**
- `vacation_requests` — collaborator, start date, end date, working days, hours, half-day period (`periodo`), state (pending/approved/rejected), type, approver, notes. 28 rows today.
- Absence types (`absence_type` enum): holiday, marriage, family bereavement, child assistance, childbirth, working student, blood donation, authorised paid, authorised unpaid.
- `remote_work_requests` — one row per day, with `location_type` (home/…), state, approver. 5 rows.
- `holidays` — 26 national + 2 Lisbon municipal Portuguese holidays, with type.
- `collaborators` — `departamento`, annual leave `dias_ferias_anuais` (22 for all 12 active people), extra days, previous-year carry-over, daily hours, days per week, photo, archived flag.
- Team/project links: `pm_resources.collaborator_id` → `pm_project_team.resource_id` → `pm_projects`, with roles (manager/coordinator/co-author/support). `pm_resources.team` also exists.

**Reusable building blocks**
- Balance maths and holiday awareness: `src/lib/dates.ts` (`countWeekdays`, `toLocalISODate`), `src/lib/workdays.ts`, `src/lib/hr/fte.ts`.
- Hooks: `use-hr-capacity-overview` (who is away now / next 14 / next 30 days), `use-remote-work`, `use-collaborators`, `use-home-feed`, plus the homepage Team availability card.
- UI: full shadcn set (cards, table, tabs, dialog, select, popover, badge, progress, tooltip), `CollaboratorAvatar`, charts via recharts, calendar via react-day-picker, date-fns. No new package needed.
- Design tokens in `src/styles.css` (warm cream/clay/sage/ink palette, chart-1..5, positive/negative), "The Future" + Signifier typefaces, HR page shell with its own background/accent tokens.

**Permissions**
- Legacy keys: `hr.ferias.own`, `hr.colaboradores`, `hr.colaborador.view/edit`, `hr.admin`, etc.
- V2 keys already defined: `hr.leave.request`, `hr.leave.approve`, plus scopes (own / team / assigned / all).
- Gating via `PermissionGate`, `useMyPermissions`, `useAuth().isAdmin` with a "view as collaborator" mode.

## 2. Proposed integration point

A new page **HR → Team availability** at `/hr/disponibilidade`, added as a fourth item in the existing "People" sidebar group, directly under Vacation and Work from home. No change to any existing page, route or navigation elsewhere.

Rationale: `/hr/ferias` stays the personal request/approval screen; the new page is the read-across-the-team view that today only exists in a tiny form on the homepage.

## 3. Reused, not rebuilt

- Absences: existing `vacation_requests` (all types, half-days, states) — no second leave table.
- Remote work: existing `remote_work_requests`, shown as a separate presence state, never as an absence.
- Holidays and weekends: existing `holidays` table + `countWeekdays`.
- People, departments, projects and teams: `collaborators`, `pm_resources`, `pm_project_team`, `pm_projects`.
- Entry/edit/approve: the existing dialogs and mutations on `/hr/ferias`, reused from the new page rather than duplicated.
- Balances: the existing formula on `/hr/ferias` (annual + extra + carry-over − approved − pending, holiday type only).

## 4. Minimum additions

New UI only (no schema change required for the core):
- `src/routes/_app.hr.disponibilidade.tsx` — month grid page.
- `src/components/hr/availability-grid.tsx` — people as rows, days as columns, continuous blocks, weekend bands, holiday markers, today outline.
- `src/components/hr/availability-summary.tsx` — the four summary cards + daily coverage bar.
- `src/components/hr/availability-year.tsx` — compact annual heatmap (days per person per month).
- `src/components/hr/absence-legend.tsx`.
- EN/PT strings in `src/i18n/locales/*/hr.json`.

Database additions, only if you want them (one small migration):
- Coverage thresholds stored as settings instead of fixed 80/60 percentages.
- `Sick leave`, `Work travel` and a generic `Other absence` value in the absence-type list — see questions below.

## 5. Decisions I need from you

1. **Absence types.** Your list asks for Sick leave, Work travel and Other absence; the system currently has holiday, marriage, bereavement, child assistance, childbirth, working student, blood donation, authorised paid, authorised unpaid. Add the three missing ones to the existing list (recommended), or map them onto "authorised paid/unpaid"?
2. **Work travel and work from home.** Should both count as *present but off-site* (green-ish, still counted as available) rather than absent? My recommendation: yes.
3. **Coverage denominator.** Percentage available out of all active staff, or only those included in planning (`include_in_planning`)? And should part-time people count as a full head?
4. **Thresholds.** Keep 80/60 fixed for v1 and make them configurable later, or make them configurable now (needs the small migration)?
5. **Who enters leave.** Recommendation, based on the roles already present: employees request their own (`hr.leave.request`), HR/admins and designated approvers add or edit for anyone and approve (`hr.leave.approve`). Everyone with HR access can *see* the team month view, but only names, dates and absence type — no notes or medical detail. Confirm?
6. **Balance rules.** Today only "holiday" type consumes the balance; carry-over is a manual number per person. Any other type that should consume it, and is there an expiry date for carry-over?
7. **Filters.** Department, project (via project team), person and absence type — all available from existing data. Anything else?

## 6. Implementation plan (after approval)

1. Shared data hook `use-team-availability` (one month of vacations + remote work + holidays + people + team/project links), all client-side aggregation; small dataset.
2. Month grid with sticky people column, weekend bands, holiday markers, today indicator, continuous absence blocks, hover detail, half-day split.
3. Coverage row + four summary cards + same-project/department clash flag.
4. Filters bar (department, project, person, type) and month/year/Today controls.
5. Balances table below the grid, reusing the existing formula.
6. Annual heatmap tab.
7. Add/edit/delete absence from the grid, reusing the existing dialog and permission checks.
8. EN/PT strings, i18n parity, typecheck, and a signed-in check of the page.

Nothing is implemented yet.
