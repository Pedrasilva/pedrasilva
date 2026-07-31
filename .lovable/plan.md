## Legacy permission retirement — staged proposal (nothing executed)

### Key mechanism change for all stages
Retire by **flag, not delete**. `user_permissions` already has a `granted` boolean and `has_permission()` only matches `granted = true`. So retirement = `UPDATE user_permissions SET granted = false` for the targeted rows. The row survives with its key and user, so rollback is a one-line flip back to `true`. Add a `retired_at timestamptz` column (nullable) purely as an audit marker of when/why the row was parked; deletion only after a full stage has been stable.

---

## Findings from investigation

**pm_can_approve_hours()** today:
```
has_role(admin) OR has_permission(_user_id, 'projects.all')
```
`projects.all` is granted to **8 of 9 users** — every real user except Ricardo Cabrita's... actually all except Luis (who is admin anyway). So this function returns true for effectively everyone, which is why all 364 time entries are visible to everyone including Francisco. This is the single broadest legacy grant in the system.

**Measured v2 team-scope visibility** (`pm_has_team_access`), out of 364 entries:
| User | Role(s) | Assigned projects | Entries visible under team scope |
|---|---|---|---|
| Luis (ab5a48c0) | admin | 4 | all (admin bypass) |
| Bernardo (08c2a749) | project_lead | 3 | 349 |
| Patrícia (4d2a2d60) | project_lead | 3 | 349 |
| Francisco (7479e4b2) | architect | 5 | 349 |
| João (51e65600) | architect | 4 | 349 |
| Ricardo Cabrita (0c3f231e) | architect | 2 | 349 |
| Ricardo Conceição (a8c10bd8) | hr + architect | 3 | 349 (+ hr = all) |
| Irene (d1c1d349) | hr + partner | 0 | 14 — but hr/partner grant `timesheets.view_team` at scope **all** |
| Tatiana (a5053861) | hr + finance | 0 | 1 — same, hr/finance grant scope **all** |

Important consequence: because the studio is small and projects overlap heavily, team scope resolves to ~96% of entries for delivery people. The narrowing is real but modest (15 entries hidden). Irene and Tatiana keep full visibility via their role baseline, not via team scope.

**`projects.all` holders:** all 8 non-admin users (`08c2a749, 0c3f231e, 4d2a2d60, 51e65600, 7479e4b2, a5053861, a8c10bd8, d1c1d349`). Same 8 also hold `projects.gantt`, `projects.my-tasks`, `projects.resources`, `projects.timesheet`.

**Assigned-resolver sanity check for the 5 delivery people** — all resolve non-empty and plausible: Francisco 5, João 4, Bernardo 3, Patrícia 3, Ricardo Cabrita 2. No zeros, no surprises. (Irene and Tatiana resolve to 0 assigned projects, as expected for back-office — their access comes from role scope `all`, not from assignment.)

**Role baselines that will carry the load after retirement:** `projects.view` is `all` for admin/partner/project_lead/hr/finance and `assigned` for architect. So retiring `projects.all` only actually narrows the three architects (Francisco, João, Ricardo Cabrita) — Bernardo and Patrícia keep firm-wide project visibility through the `project_lead` baseline.

---

## Stage 1 — timesheet/hours visibility (lowest risk)

**Change:** rewrite `pm_can_approve_hours()` to stop keying off `projects.all`:
```
has_role(admin)
OR has_module_permission(_user_id, 'timesheets.approve', 'all')
OR (has_module_permission(_user_id, 'timesheets.approve', 'team')
    AND pm_has_team_access(_user_id, _target_user_id))
```
This needs the function to take a target user, so introduce `pm_can_approve_hours(_user_id, _target_user_id)` and keep the 1-arg version as a "can approve anything at all" gate for UI menus. Then flip `granted = false` on the `projects.timesheet` legacy rows and drop the `projects.all` branch from the `pm_time_entries` RLS OR-clause.

Net effect: architects and project_leads see own + teammates on shared projects; hr/partner/finance/admin keep everything.

**Test plan:** for each of the 9 users, run the visible-entry count before and after and diff against the expected set from `pm_has_team_access`; confirm the 3 architects drop from 364 → 349, Bernardo/Patrícia → 349, Irene/Tatiana/Ricardo C./Luis stay at 364. Also confirm approve buttons only appear for project_lead/partner/admin, and that no user loses the ability to see or edit their own entries.

**Rollback:** restore the previous `pm_can_approve_hours` body and set `granted = true` back on the parked rows. One migration, seconds.

---

## Stage 2 — project visibility / `projects.all` retirement (EXECUTED 2026-07-31, 2-week trial)

**Rows to park:** the 8 `projects.all` rows listed above, plus `projects.gantt`, `projects.resources`, `projects.my-tasks` once their route guards read v2 keys instead.

**Order of work:**
1. First move the route guards and `pm_can_view_projects()` off `has_permission('projects.view'/'projects.all')` onto `has_module_permission('projects.view', …)` with `pm_has_assigned_access` for the `assigned` scope.
2. Then park the legacy rows for the **3 architects only** (Francisco, João, Ricardo Cabrita) — the only users whose visibility actually changes. Bernardo and Patrícia's rows get parked in the same trial but are behaviourally inert because `project_lead` grants `all`.
3. Trial period: 2 weeks with rows parked but restorable. Only after that, consider deleting.

**Expected post-retirement visible projects:** Francisco 5, João 4, Ricardo Cabrita 2, Bernardo/Patrícia unchanged (all).

**Test plan:** per user, compare the project list rendered in the UI against `pm_assigned_project_ids()` output row-for-row; confirm each architect can still open, log time to, and see tasks on every project they have logged hours against historically (this is the main regression risk — someone about to start on a new project has no allocation yet and will not see it until staffed). Before executing, I'll bring you the exact named project list for each of the 3 architects for your explicit sign-off that it matches what they should see.

**Rollback:** `UPDATE user_permissions SET granted = true WHERE permission_key = 'projects.all'`. Instant, no code redeploy needed, because the RLS OR-branch for legacy stays wired throughout the trial.

---

## Stage 3 — financial / HR / CRM keys (highest risk, scope later)

Flagged for retirement, **not scoped now**:
- `finance.dashboard` (Irene, Tatiana) → v2 `finance.*` family
- `crm.companies`, `crm.contacts`, `crm.pipeline` (5 users) → v2 `crm.*.view/edit`
- `hr.admin`, `hr.colaboradores`, `hr.colaborador.view/edit`, `hr.colaborador.compensation.view`, `hr.resumo*`, `hr.beneficios.approve`, `hr.subsidio-alimentacao`, `hr.valor-bo` → v2 `hr.*`
- Self-service keys (`hr.minha-ficha`, `hr.beneficios.own`, `hr.ferias.own`, `hr.dias-uteis`) are near-universal and low value to retire; they should go last or stay.

This touches salary snapshots, benefit expenses and financial documents — the data where a wrong RLS predicate is a real incident, not an inconvenience. Recommendation: do not scope Stage 3 until Stage 1 and Stage 2 have been live for **at least 4 weeks** with no access complaints, including a full month-end close and one payroll cycle so the finance and HR paths get genuinely exercised.

---

## Cross-cutting notes
- Keep the legacy OR-branch in every RLS policy until the corresponding stage's trial ends; retirement is driven by flipping `granted`, not by editing policies.
- Add an admin-visible "parked permissions" view so you can see at a glance what has been retired and restore it from the UI.
- One caveat worth naming: in a 9-person studio with heavy project overlap, v2 scoping buys less isolation than it looks like on paper (349/364 entries visible either way). The real value is Stage 3 — financial and HR separation — which is exactly the part that must go last.

Nothing has been changed. Approve a stage and I'll execute it.