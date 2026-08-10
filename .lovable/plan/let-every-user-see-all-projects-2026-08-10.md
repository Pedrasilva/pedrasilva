# Let every user see all projects

Today, project visibility is decided by the `projects.view` permission scope. All roles already have it at scope `all` (partner, project lead, HR, finance, admin) except **architect**, which is limited to `assigned` — so architects only see projects they are booked on.

There are no user-level overrides on `projects.view`, so the role baseline is the only thing gating this.

## Change

Widen the architect role baseline for `projects.view` from `assigned` to `all`.

Effect:
- Every signed-in user sees the full project list and can open any project page (stages, tasks, allocations follow the same rule).
- Financial visibility is untouched: architects still have no `projects.view_financials` / `projects.view_margins`, so revenue, cost and margin stay hidden for them.
- Editing rights are untouched: `projects.edit_planning` / `projects.edit_stages` remain as they are, so wider visibility does not mean wider write access.

## Technical detail

- Data update on `role_permissions`: set `scope = 'all'` where `role = 'architect'` and `permission_key = 'projects.view'`.
- No RLS change needed — the existing `pm_projects` / `pm_stages` SELECT policies already grant full read when `projects.view` is held at scope `all`.
- No frontend change needed — the project list does not filter client-side.
