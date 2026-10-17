-- Keep the closure id on generated holiday rows and closure férias after a
-- closure is deleted, so the next preview can remove/refund exactly them.
ALTER TABLE public.holidays DROP CONSTRAINT IF EXISTS holidays_office_closure_id_fkey;
ALTER TABLE public.vacation_requests DROP CONSTRAINT IF EXISTS vacation_requests_office_closure_id_fkey;
COMMENT ON COLUMN public.holidays.office_closure_id IS 'Set on rows generated from office_closures (may reference a deleted closure until the next apply).';
COMMENT ON COLUMN public.vacation_requests.office_closure_id IS 'Set on férias generated from office_closures (may reference a deleted closure until refunded).';