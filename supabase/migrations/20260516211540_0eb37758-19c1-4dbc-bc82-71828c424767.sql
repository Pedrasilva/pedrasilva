-- Allow finance-driven audit events on benefit_expense_events.
-- The previous CHECK constraint only allowed the HR-side lifecycle events
-- (submitted/approved/rejected/paid/edited/reopened) and silently rejected
-- the finance-side events emitted by finance_settle_expense.

ALTER TABLE public.benefit_expense_events
  DROP CONSTRAINT IF EXISTS benefit_expense_events_event_type_check;

ALTER TABLE public.benefit_expense_events
  ADD CONSTRAINT benefit_expense_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'submitted',
    'approved',
    'rejected',
    'paid',
    'edited',
    'reopened',
    'finance_paid',
    'finance_paid_hr_sync_failed'
  ]));