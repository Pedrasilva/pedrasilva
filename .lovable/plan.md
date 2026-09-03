# Compact homepage header + Work-from-home requests

## 1. Slimmer greeting block

In the homepage hero:

- Reduce vertical padding (roughly half of today's) and shrink the heading type scale so the greeting reads as a secondary line rather than the main event.
- Keep the same content — date line, "Good evening, Luis." + tagline, intro paragraph, celebration pill — just at a smaller scale with tighter spacing.
- The today cards move up accordingly and become the first thing visible below the fold-free area.
- Remove the Inbox tile from the homepage modules grid (the module itself and its routes stay untouched, still reachable directly).

## 2. "Team availability" card replaces "Off today"

The first card of the today strip becomes a single availability card with three grouped sections:

```text
Team availability                          TEAM
------------------------------------------------
OUT TODAY
  Bernardo Nadais   Vacation · until 13 Oct
WORKING FROM HOME
  Irene Marques     Approved
COMING UP (next 14 days)
  Rita Saragoca     Vacation · 12-16 Oct
  Ricardo Cabrita   Home office · 8 Oct
```

- Empty groups are hidden; if all three are empty the card shows "The whole team is in today."
- Upcoming window: 14 days, approved requests only.
- Holidays and celebrations cards stay as they are.

## 3. Work-from-home requests (HR)

New HR tab "Work from home" (Trabalho remoto), alongside Vacations:

- A collaborator picks one or more dates and optionally a note, then submits. Intent is next-day requests, but no hard cut-off rule is enforced for now.
- Status flow mirrors vacations: pending -> approved / rejected, with approver and timestamp recorded.
- Own view: my requests with status; approvers/admins see a pending queue with approve/reject.
- Approved days feed the homepage availability card.
- Usage tracking: the admin list shows a per-collaborator count of approved WFH days for the current year and month, so patterns are visible without adding any limit rules yet.

Work from home does not consume vacation days and does not change working-day, payroll or timesheet calculations.

## Technical notes

- New table `public.remote_work_requests`: `collaborator_id`, `data` (single date per row), `estado` (`pendente` | `aprovada` | `rejeitada`), `notas`, `aprovado_por`, `aprovado_em`, timestamps + update trigger. Unique on (collaborator_id, data). GRANTs for `authenticated`/`service_role`; RLS: own read/insert/delete-while-pending, approvers (HR/admin permission) read all and update status. Kept separate from `vacation_requests` so the `absence_type` enum, vacation balances and working-day logic stay untouched.
- New hook `src/hooks/use-remote-work.ts` (list own, list pending, list approved for a date range, create, approve/reject).
- Extend `src/hooks/use-home-feed.tsx` with `useUpcomingAbsences(14)` (approved vacation rows starting within the window) and `useRemoteToday()` / `useRemoteUpcoming(14)`.
- Rewrite `src/components/home/today-strip.tsx` first card into the grouped availability card; hero spacing/type changes in `src/routes/_app.index.tsx`.
- New route `src/routes/_app.hr.trabalho-remoto.tsx` + nav entry in `src/routes/_app.hr.tsx`; reuse existing HR table/dialog patterns.
- All new strings added to EN and PT locale files in the same edit (`home.json`, `hr.json`).
