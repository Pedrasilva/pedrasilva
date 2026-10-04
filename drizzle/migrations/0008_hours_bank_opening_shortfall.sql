ALTER TABLE public.pm_hours_bank_entries
  DROP CONSTRAINT IF EXISTS pm_hours_bank_entries_transaction_type_check;
ALTER TABLE public.pm_hours_bank_entries
  ADD CONSTRAINT pm_hours_bank_entries_transaction_type_check
  CHECK (transaction_type IN ('additional_hours','converted_to_leave','paid_compensation','manual_adjustment','opening_balance','shortfall'));

ALTER TABLE public.pm_hours_bank_entries ADD COLUMN IF NOT EXISTS as_of_date date;

CREATE UNIQUE INDEX IF NOT EXISTS pm_hours_bank_one_opening
  ON public.pm_hours_bank_entries (collaborator_id) WHERE transaction_type = 'opening_balance';
CREATE UNIQUE INDEX IF NOT EXISTS pm_hours_bank_one_week_movement
  ON public.pm_hours_bank_entries (week_id)
  WHERE transaction_type IN ('additional_hours','shortfall') AND week_id IS NOT NULL;

ALTER TABLE public.pm_timesheet_weeks ADD COLUMN IF NOT EXISTS shortfall_hours_approved numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pm_hours_bank_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type IN ('manual_adjustment','opening_balance')
     AND (NEW.reason IS NULL OR btrim(NEW.reason) = '') THEN
    RAISE EXCEPTION 'This movement requires a note';
  END IF;
  IF NEW.transaction_type = 'opening_balance' THEN
    NEW.as_of_date := COALESCE(NEW.as_of_date, DATE '2026-06-01');
    NEW.entry_date := NEW.as_of_date;
    NEW.week_id := NULL;
  END IF;
  IF NEW.transaction_type = 'shortfall' AND NEW.hours > 0 THEN
    NEW.hours := -NEW.hours;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.pm_hours_bank_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_hours numeric,
  new_hours numeric,
  old_as_of date,
  new_as_of date,
  old_reason text,
  new_reason text
);
GRANT SELECT ON public.pm_hours_bank_audit TO authenticated;
GRANT ALL ON public.pm_hours_bank_audit TO service_role;
ALTER TABLE public.pm_hours_bank_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_audit_select" ON public.pm_hours_bank_audit FOR SELECT TO authenticated
USING (
  collaborator_id = public.get_my_collaborator_id()
  OR public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
);

CREATE OR REPLACE FUNCTION public.pm_hours_bank_opening_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type = 'opening_balance' AND (
       NEW.hours IS DISTINCT FROM OLD.hours
       OR NEW.as_of_date IS DISTINCT FROM OLD.as_of_date
       OR NEW.reason IS DISTINCT FROM OLD.reason) THEN
    INSERT INTO public.pm_hours_bank_audit
      (entry_id, collaborator_id, changed_by, old_hours, new_hours, old_as_of, new_as_of, old_reason, new_reason)
    VALUES (NEW.id, NEW.collaborator_id, auth.uid(), OLD.hours, NEW.hours, OLD.as_of_date, NEW.as_of_date, OLD.reason, NEW.reason);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pm_hours_bank_opening_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pm_hours_bank_opening_audit_trg
AFTER UPDATE ON public.pm_hours_bank_entries
FOR EACH ROW EXECUTE FUNCTION public.pm_hours_bank_opening_audit();

CREATE OR REPLACE FUNCTION public.pm_timesheet_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.pm_can_approve_hours(auth.uid()) THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
      NEW.was_approved_before := true;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only change your own weekly timesheet';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (OLD.status IN ('open','returned') AND NEW.status = 'submitted') THEN
      RAISE EXCEPTION 'Only an approver can change this week from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.additional_hours_approved IS DISTINCT FROM OLD.additional_hours_approved
       OR NEW.shortfall_hours_approved IS DISTINCT FROM OLD.shortfall_hours_approved
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     ) THEN
    RAISE EXCEPTION 'Only an approver can change approval data';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('open','submitted') THEN
    RAISE EXCEPTION 'Weeks start as open';
  END IF;

  RETURN NEW;
END;
$$;