# Global Navigation Refactor (Accelo-inspired)

Replace PSA Hub's current horizontal top nav with a persistent **left vertical module rail**, **top-right global action icons**, and a **bottom-left utility area**. The Projects module's content (dashboards, Gantt, materials, expenses, rates, billing, allocations) is frozen — only the shell changes.

## New shell structure

```text
┌──┬──────────────────────────────────────────────────────────┐
│  │  page title / breadcrumb       [+] [⏱] [✓] [📅] [📥] [👤]│
│R ├──────────────────────────────────────────────────────────┤
│a │                                                          │
│i │                    page content (Outlet)                 │
│l │                                                          │
│  ├──────────────────────────────────────────────────────────┤
│⚙ │  (bottom: Help · Feedback · Settings)                    │
└──┴──────────────────────────────────────────────────────────┘
```

## Left module rail (top → bottom)

Each item: icon + tooltip; click opens a structured flyout panel.

1. **CRM / Sales** — companies, contacts, opportunities, pipeline, quotes
2. **Projects** — projects, gantt, resources, timesheet, my tasks, forecast, financials, insights
3. **Team / HR** — collaborators, my sheet, benefits, meal allowance, holidays, working days, summary
4. **Time / Work** — log time, my timesheet, my tasks, weekly view
5. **Finance** — documents, invoicing, payments, banking, reports, data, admin
6. **Insights / Reports** — project insights, forecast, cashflow, VAT, project financials

Bottom of rail: **Help**, **Feedback**, **Settings** (admin/imports/company-settings).

Each flyout has the structure: header tabs (where useful), "Shared lists", "Recently viewed" (stub: most-recent routes), "Shortcuts", "Reports".

## Top-right global icon hubs

- **Create (+)** — Task, Project, Company, Contact, Opportunity, Quote, Expense, Material, Collaborator (re-uses existing `QuickCreateMenu` dialogs)
- **Time (⏱)** — Log time, My timesheet, Weekly view, Team timesheet overview
- **Tasks (✓)** — New task, My open tasks, My managed tasks, Boards by status/deadline/assignee
- **Schedule (📅)** — My schedule, Team scheduling, Schedule dashboard (Gantt)
- **Inbox (📥)** — Work tray placeholder (notifications/approvals; wire existing alerts)
- **User (👤)** — My account, Preferences, Language, Notifications, View-as picker (admin), Logout

## What moves OUT of the top horizontal nav

- Module switcher chips (CRM/Projects/HR/Finance/Admin) → left rail
- "Tempo / Tarefas / Agenda" text links → top-right icon hubs
- Admin entry → bottom-left Settings (still gated by role)
- Language switcher → inside User dropdown

## Files to add

- `src/components/shell/AppRail.tsx` — vertical icon rail + flyout host
- `src/components/shell/RailFlyout.tsx` — structured flyout panel
- `src/components/shell/TopActions.tsx` — top-right icon hubs container
- `src/components/shell/menus/CreateMenu.tsx` (wraps existing `QuickCreateMenu`)
- `src/components/shell/menus/TimeMenu.tsx`
- `src/components/shell/menus/TasksMenu.tsx`
- `src/components/shell/menus/ScheduleMenu.tsx`
- `src/components/shell/menus/InboxMenu.tsx`
- `src/components/shell/menus/UserMenu.tsx`
- `src/components/shell/SettingsMenu.tsx` (bottom-left)
- `src/components/shell/nav-config.ts` — single source of truth for rail items + flyout sections
- i18n keys in `src/i18n/locales/{en,pt-PT}/common.json` under `nav.*`

## Files to edit

- `src/routes/_app.tsx` — swap `GlobalTopNav`/`ModuleTopNav` for new shell (rail + slim top bar)
- `src/components/GlobalTopNav.tsx` — slim down to title + `TopActions` (or replaced)
- `src/components/ModuleTopNav.tsx` — removed from `_app.tsx` (kept for now if used elsewhere)
- `src/components/projects/app-shell.tsx` — already a passthrough; no change

## What stays unchanged

- All files under `src/routes/_app.projects.*` (content, tabs, Gantt, allocations, financials)
- `src/components/projects/*` (allocation-editor, etc.)
- `src/lib/projects/*` (rates, planner, schedules, ownership)
- Finance, HR, CRM data hooks and pages — only their entry points move

## Validation

- Typecheck clean
- i18n parity (EN + PT for every new `nav.*` key, added in same edit)
- Project module routes still render identically (no content drift)
- Mobile: rail collapses to a top sheet trigger; top-right icons remain accessible
- Existing role-gating preserved (admin items only show for admins via `PermissionGate`)
