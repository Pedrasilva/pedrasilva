# Work From Home — full feature build

Builds on the existing lightweight Work-from-home page (`/hr/trabalho-remoto`) and its `remote_work_requests` records. Nothing is thrown away: existing requests keep working and become the history of the new feature. Vacations and Benefits are untouched.

## 1. HR navigation

HR sidebar keeps People / Vacation / **Work from home** / Benefits. The Work from home area gains three tabs:

- **Requests** — my requests + the approval queue (for approvers)
- **History / Calendar** — month calendar of who is remote, plus a full record list with filters
- **Analytics** — usage per person over a chosen period

Same cards, tables, chips, dialogs and responsive behaviour as the rest of HR.

## 2. Requesting

A "Request work from home" button on the HR page and on the homepage availability card opens a small dialog: date (or a short range, split into one record per day), location type (Home / Remote location), optional note. The approver is worked out automatically and shown read-only.

Notice rule: by default the date must be at least 1 calendar day ahead. Same-day is blocked with a clear inline message unless same-day requests are enabled in settings, or an HR/Admin uses the override switch (visible only to them).

## 3. Approval

Statuses: pending, approved, rejected, cancelled. Approvers get a one-click Approve / Reject row (name, date, location, note, submitted time); rejection may carry an optional reason. Employees may cancel their own pending — and, before the date, approved — days; the record is kept as cancelled, never deleted.

Notifications reuse the existing bell: new request to the approver, decision to the employee, cancellation back to the approver.

## 4. Settings → HR → Work from home

A new HR settings screen (HR admin only) with:

- Policy: require approval, minimum notice days (default 1), allow same-day, allow HR/Admin override
- Approvers: list of people who can approve, each either global or tied to a specific employee, with priority (primary/secondary) and active/inactive. An employee-specific approver wins over the global one.

## 5. "Who's working where"

The homepage availability card is reworked into **Who's working where today**, grouped as In office / Working from home / Away (vacation, holiday, other absence), each person shown with an avatar and a status chip. Only approved days count as remote; pending never changes anyone's status. A one-line preview underneath: "Tomorrow — 4 working from home".

## 6. History on the employee profile

The collaborator profile gains a Work-from-home block inside its attendance/history area: date, status, approved by, requested on. Past days stay listed; cancelled or overridden days remain visible with their audit trail.

## 7. Analytics

Period filter (this month / quarter / year / custom) with KPIs: total WFH days, people using WFH, average days per person, and a per-person table with WFH days, eligible working days and WFH %, compared against the team average. Eligible working days come from the existing working-day/holiday calendar and each person's contract start and leave; where that data is missing for someone, the percentage is left blank rather than guessed. A simple monthly trend bar chart using the existing chart components.

## 8. Concept

Work from home is a **work location**, not an absence. An approved day means "working, remotely". It does not consume vacation days and does not change payroll, working-day or timesheet maths.

## Technical notes

- Extend `public.remote_work_requests` (additive, no breaking change): add `location_type` (`home` | `remote`, default `home`), `motivo_rejeicao`, `created_by`, `cancelled_at`/`cancelled_by`, `override_by`, and widen the status check to include `cancelada`. Existing rows keep their meaning. Keep one row per day; a `request_group_id` column is added now so multi-day requests can be grouped later without migration.
- New `public.remote_work_settings` (singleton row) and `public.remote_work_approvers` (`approver_user_id`, nullable `collaborator_id`, `priority`, `active`), both with GRANTs + RLS: everyone authenticated reads, HR admins write.
- RLS on requests: own read/insert/cancel; approvers (via a `remote_work_can_approve(_user, _collaborator)` security-definer helper) and HR/admin read all and update status. Approved rows stay readable by all so the availability card works.
- Notifications via the existing `notify_user` function from AFTER-INSERT/UPDATE triggers on `remote_work_requests`.
- New permission keys `hr.wfh.own`, `hr.wfh.approve`, `hr.wfh.admin` added to the existing permission catalogue; the current `hr.ferias.own` gate on the page is replaced by `hr.wfh.own`.
- Code: extend `src/hooks/use-remote-work.ts` (settings, approvers, approver resolution, analytics queries); split `_app.hr.trabalho-remoto.tsx` into the three tab routes; new dialog component reusing existing date picker/dialog patterns; rework `useTeamAvailability` in `src/hooks/use-home-feed.tsx` and `today-strip.tsx`; new HR settings route; profile history block.
- All new strings added to EN and PT `hr.json` / `home.json` in the same edit.
