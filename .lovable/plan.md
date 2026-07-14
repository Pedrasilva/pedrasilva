## Hour approval system

Add an approval workflow for every logged hour (project tasks, retainer, direct-stage). Approvers (admins + the project's manager) review pending entries, adjust billable flag / sale rate / stage, then approve or reject. Unapproved hours stay visible in Insights but are flagged.

### Data model
Add to `pm_time_entries`:
- `approval_status` enum(`pending`, `approved`, `rejected`) default `pending`
- `approved_by` uuid, `approved_at` timestamptz
- `sale_rate_override` numeric (nullable — overrides `sale_rate_snapshot` when set)
- `rejection_reason` text (nullable)

Existing historical rows: backfill to `approved` so nothing retroactively disappears from earned value.

RLS: add policy so admins + project manager (`pm_projects.manager_id = auth.uid()`) can UPDATE approval fields on any entry belonging to their project. Resource-owner update path stays as-is for editing own hours *only while status = pending*.

### Approval surfaces

1. **Project → new "Approvals" tab** (visible only to admins / project manager)
   - Grouped by stage → shows pending entries
   - Per stage header: stage name + gantt number, budget, hours used vs planned, €used vs budget (matches the reference image)
   - Per entry row: date, person, task/notes, hours, billable toggle, rate €/h input (defaults to snapshot, editable), stage picker (reassign), amount preview, Approve / Reject buttons
   - Bulk actions: select rows → approve all / mark all non-billable / apply rate
   - "Approve stage" button approves every pending entry under it

2. **Insights unapproved indicator**
   - Add "Unapproved" pill next to Earned Value: `€X unapproved (Yh)` — mirrors the `-€3,937.50 unapproved` line in the reference
   - Financials rollup: totals include ALL entries but the "Value" row shows `approved / unapproved` split
   - Chart bars: unapproved portion rendered with a lighter shade / hatched fill

3. **Retainer monitor**
   - Month drill-down gets an "Approve" column per entry (admin/manager only)
   - Monthly totals show `approved h / pending h` split

4. **Global "Approve work" entry point**
   - Top-nav Quick menu → "Approve work" opens `/projects/approvals` route listing every project with pending hour counts → click drills into that project's Approvals tab

### Files touched (approx.)
- Migration: enum + columns + RLS + backfill
- `src/lib/projects/use-approvals.ts` (new) — list pending by project/stage, approve/reject mutations
- `src/components/projects/approvals-panel.tsx` (new) — stage-grouped table with inline edit
- `src/routes/_app.projects.$projectId.tsx` — add Approvals tab, wire unapproved pill into Insights totals
- `src/routes/_app.projects.approvals.tsx` (new) — cross-project queue
- `src/components/projects/retainer-monitor-panel.tsx` — approve column + split totals
- `src/lib/projects/use-project-insights.ts` — split approved vs unapproved in earned value / financials
- i18n keys under `projects.approvals.*` (EN + PT)

### Business rules
- Approvable actions per entry: toggle billable, override sale rate, reassign stage. Hours themselves are NOT edited during approval (owner edits hours while status=pending; approval locks the entry).
- Approved entries are read-only for everyone except admins (who can revert to pending).
- Rejected entries stay visible to the owner with the reason and don't count toward value/cost until re-submitted.
- Insights `earnedValue` = approved billable hours × rate. Unapproved billable hours tracked separately as `unapprovedValue`.
- Costs count from all entries regardless of approval (labor cost is incurred either way).

Confirm and I'll implement.