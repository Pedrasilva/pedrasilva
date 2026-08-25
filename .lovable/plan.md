# Reminders & notifications

A general alert layer any module can write to, starting with CRM next actions.

## Concept

Two ideas, kept separate:

- **Reminder** — a dated task pointed at a person ("Follow up with Cavid on 10/09"). It has an owner, a due date, and a link back to the record.
- **Notification** — the delivery of something to a person's bell: a reminder coming due, or an event (someone assigned you a next action, a quote was signed, an expense needs approval).

A next action on an opportunity automatically creates/updates a reminder for its owner. Changing the date moves the reminder; clearing it removes it.

## Ownership

Next actions get an **owner** field, defaulting to the person who typed it. It can be reassigned to any colleague from a picker next to the date. Reassigning notifies the new owner.

## Where alerts appear

1. **Bell in the top bar** — unread count badge, dropdown with the latest items (title, who/what, due date, overdue in red). Clicking an item opens the record and marks it read. "Mark all as read" at the bottom.
2. **Homepage "My actions" card** — everything owned by me: overdue first, then today, then next 7 days. Each row links to the opportunity/project/etc.
3. **Daily email reminder** — one digest per person per morning listing their overdue and due-today items, only if they have any. Opt-out per user in settings.

The existing inline badge on the opportunity page ("Due soon") stays.

## Rollout

- **Phase 1** — data layer, next-action owner, bell + dropdown, homepage card. CRM is the first producer.
- **Phase 2** — email digest (needs the app's email domain set up first; that's a separate one-time step I'll run through with you).
- **Phase 3** — other producers wired into the same layer: quote awaiting signature, document review queue items assigned to you, expense approvals, project tasks due.

## Technical notes

New tables:

- `reminders` — `owner_user_id`, `created_by`, `title`, `due_date`, `entity_type` + `entity_id` (polymorphic link), `module`, `status` (open/done/cancelled), `completed_at`. RLS: owner and creator can read/update; admins read all. GRANTs for `authenticated` + `service_role`.
- `notifications` — `user_id`, `kind`, `title`, `body`, `link_path`, `entity_type`/`entity_id`, `read_at`, `created_at`. RLS: users read/update only their own rows; inserts via security-definer function so one user can notify another. GRANTs as above.
- `notification_preferences` — `user_id`, `email_digest_enabled`, `digest_hour`.

Producers call a `notify(user_id, kind, title, link_path, ...)` security-definer function rather than inserting directly.

`crm_opportunities` gains `next_action_owner_id uuid` (defaults to `auth.uid()` on write from the UI). A trigger keeps a matching row in `reminders` in sync with `next_action` / `next_action_date` / owner, and enqueues a notification when the owner changes to someone else.

A `pg_cron` job runs hourly, promotes reminders whose `due_date` has arrived into `notifications` (idempotent: unique key on reminder + kind so it fires once), and — in phase 2 — calls a `/api/public/*` route that sends each person their digest with a bounded batch and per-day idempotency key.

Frontend: `useNotifications()` hook (unread count + list, Realtime subscription on `notifications`), `NotificationBell` in `GlobalTopNav`, `MyActionsCard` on the homepage, owner picker in the opportunity Next action card. All strings via `t()` with EN + PT-PT added in the same edit, under a new `notifications` namespace with shared labels in `common`/`glossary`.
