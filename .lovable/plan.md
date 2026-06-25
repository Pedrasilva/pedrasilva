# Project Module Redesign — Consolidated Plan

Six tabs, one design system, one width rule. Shipped in four phases so each phase is reviewable on its own.

## Phase 1 — Global foundations (skin + width)

**1.1 Visual tokens from CRM → shared**
- Audit CRM (`/crm/*`) for color, font, radius, shadow, border, pill, button, table, badge, and chart-color tokens
- Promote those values into `src/styles.css` as canonical tokens (`--color-*`, `--font-*`, `--radius-*`, `--shadow-*`)
- Update shadcn variants so CRM and Project consume the same tokens
- No layout/IA changes here — pure skin

**1.2 Fluid full-width layout**
- Drop fixed `max-width` containers on Projects Dashboard, Project Home, and Gantt pages
- Replace with fluid wrapper (sensible side gutters, grows on wide monitors)
- Same rule applied app-wide where dense tables/Gantt live

## Phase 2 — Projects Dashboard (`/projects`)

- Keep: top KPI strip, Project Scorecard table (clickable names), Performance by PM, Project Value chart, financial calcs from yesterday's fix
- Restructure: 2-column — Scorecard (wide left) + Project Value (right rail), Performance below
- Inherits Phase 1 fluid width

## Phase 3 — Project Home (`/projects/$projectId`)

**3.1 Shell**
- Breadcrumb (Company › Project) + project title
- Action bar: Add Activity / Log Time / Edit / Create / Tools / Export / More / Portal
- Status pill row: Planned · Active · Complete · Pause · Cancel
- **Collapsible left rail**: Client, PM, Project Details, Team, Earned Value, Progress, Schedule, Bookings, Important Dates
- 2-column body that maximizes width when rail collapsed

**3.2 Tabs cleanup**
- Keep: Overview, Insights, Materials, Expenses, Billing
- Defer (hidden): Schedule, Stream
- Remove: Attachments, Rates, Assets, Details

## Phase 4 — Tab content

**4.1 Overview**
- Stage/milestone table: Status · Earned Value (planned vs logged € + %) · Usage/Budget (hours) · Scheduled start/due · row actions
- Each stage row clickable → drills to that stage's insights
- Filters: Status, Manager/Assignee; actions: Edit Plan, Add Task, Search
- Cancelled stages hidden by default (existing baseline rule)

**4.2 Insights**
- Keep current financials table (correct after yesterday's fix)
- Add: Activities vs Hours monthly chart (bars=hours, line=activity count, dual Y-axis)
- Right rail: Value (Earned + Forecast progress bars), Profitability (Current vs Forecast donuts), Work (WIP + Done/Forecast donuts + "Show non-billable" + View Tasks)
- Below: Work Done by person + Budget by person (horizontal bars)

**4.3 Materials** *(canonical layout = "Compromissos com Fornecedores")*
- One card per supplier from CRM/Project Gantt; header = `SUPPLIER — TOTAL DOS HONORÁRIOS` + total
- Payment schedule table inside each card: Data de pagamento · % honorários · Valor sem IVA · IVA · Valor com IVA · Fatura · Condições de pagamento
- Aggregated "Fornecedores Diversos" card for ad-hoc one-off items
- Inline-add row for ad-hoc materials (replaces popup)
- Supplier rows from Gantt are read-only except margin/billing; ad-hoc rows fully editable

**4.4 Expenses**
- Inline table replacing current popup
- Columns: 📎 · Title & Type · Submitter · 🧾 · Date · Status pill · Purchase · Sale · Billing · Reimbursed Date · Reimburser · ⋮
- Row actions: Edit · Approve · Decline · Delete (ties to Approvals Dashboard reference)
- Toolbar: + Add Expense, Export, View Detailed List, Search

**4.5 Billing**
- Section 1 — Payment Schedule mirrored from CRM (`quote_payment_schedule_items`, kept in sync with project plan): Milestone · Trigger date · % · Amount · IVA · Total · Invoice status · Linked invoice · "Generate invoice" action, grouped by stage with subtotals
- Section 2 — Previous Billing / Invoice History: Title · Contact · Date · Status pill · Total · Outstanding (€ + age or "Paid after N days") · 📄 PDF · ⋮
- Summary strip: Total Invoiced · Paid · Outstanding · Overdue
- "Generate invoice" creates draft prefilled from milestone; status changes propagate back to schedule

## Out of scope (per your instructions)

- Schedule tab redesign (deferred)
- Stream tab (deferred)
- IA/navigation changes outside the Project module
- Change orders (future)
- New business logic beyond syncing CRM payment schedule ↔ project Billing

## Sequencing

I'll ship Phase 1 first (the skin + width change touches everything), then 2 → 3 → 4 one tab at a time so each is independently reviewable. No DB schema changes required — all data sources already exist (`pm_*`, `quote_*`, `pm_project_contract_baseline*`).
