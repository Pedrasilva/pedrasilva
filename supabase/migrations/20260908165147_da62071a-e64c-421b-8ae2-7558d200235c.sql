
CREATE TABLE public.pm_timesheet_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','submitted','returned','approved')),
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  returned_at timestamptz,
  returned_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  reviewer_comment text,
  was_approved_before boolean NOT NULL DEFAULT false,
  weekly_capacity_hours numeric NOT NULL DEFAULT 40,
  total_accounted_hours numeric NOT NULL DEFAULT 0,
  total_working_hours numeric NOT NULL DEFAULT 0,
  total_project_hours numeric NOT NULL DEFAULT 0,
  total_internal_hours numeric NOT NULL DEFAULT 0,
  total_leave_hours numeric NOT NULL DEFAULT 0,
  calculated_excess_hours numeric NOT NULL DEFAULT 0,
  additional_hours_approved numeric NOT NULL DEFAULT 0,
  additional_hours_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX pm_timesheet_weeks_week_idx ON public.pm_timesheet_weeks (week_start, status);
CREATE INDEX pm_timesheet_weeks_collab_idx ON public.pm_timesheet_weeks (collaborator_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_timesheet_weeks TO authenticated;
GRANT ALL ON public.pm_timesheet_weeks TO service_role;

ALTER TABLE public.pm_timesheet_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weeks_select" ON public.pm_timesheet_weeks FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
);

CREATE POLICY "weeks_insert" ON public.pm_timesheet_weeks FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.pm_can_approve_hours(auth.uid())
);

CREATE POLICY "weeks_update" ON public.pm_timesheet_weeks FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.pm_can_approve_hours(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.pm_can_approve_hours(auth.uid())
);

CREATE POLICY "weeks_delete" ON public.pm_timesheet_weeks FOR DELETE TO authenticated
USING (public.pm_can_approve_hours(auth.uid()));

CREATE TRIGGER pm_timesheet_weeks_updated_at
BEFORE UPDATE ON public.pm_timesheet_weeks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Owners may only move their own week open/returned -> submitted.
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

CREATE TRIGGER pm_timesheet_week_guard_trg
BEFORE INSERT OR UPDATE ON public.pm_timesheet_weeks
FOR EACH ROW EXECUTE FUNCTION public.pm_timesheet_week_guard();

CREATE TABLE public.pm_hours_bank_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  user_id uuid,
  week_id uuid REFERENCES public.pm_timesheet_weeks(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('additional_hours','converted_to_leave','paid_compensation','manual_adjustment')),
  hours numeric NOT NULL,
  reason text,
  vacation_request_id uuid REFERENCES public.vacation_requests(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pm_hours_bank_collab_idx ON public.pm_hours_bank_entries (collaborator_id, entry_date);
CREATE UNIQUE INDEX pm_hours_bank_one_per_week
  ON public.pm_hours_bank_entries (week_id)
  WHERE transaction_type = 'additional_hours' AND week_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_hours_bank_entries TO authenticated;
GRANT ALL ON public.pm_hours_bank_entries TO service_role;

ALTER TABLE public.pm_hours_bank_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_select" ON public.pm_hours_bank_entries FOR SELECT TO authenticated
USING (
  collaborator_id = public.get_my_collaborator_id()
  OR public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
);

CREATE POLICY "bank_insert" ON public.pm_hours_bank_entries FOR INSERT TO authenticated
WITH CHECK (
  public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
);

CREATE POLICY "bank_update" ON public.pm_hours_bank_entries FOR UPDATE TO authenticated
USING (
  public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
)
WITH CHECK (
  public.pm_can_approve_hours(auth.uid())
  OR public.has_module_permission(auth.uid(), 'hr.admin', 'all')
);

CREATE POLICY "bank_delete" ON public.pm_hours_bank_entries FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(), 'hr.admin', 'all'));

CREATE TRIGGER pm_hours_bank_updated_at
BEFORE UPDATE ON public.pm_hours_bank_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Manual adjustments must always carry a reason.
CREATE OR REPLACE FUNCTION public.pm_hours_bank_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type = 'manual_adjustment'
     AND (NEW.reason IS NULL OR btrim(NEW.reason) = '') THEN
    RAISE EXCEPTION 'A manual adjustment requires a reason';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pm_hours_bank_guard_trg
BEFORE INSERT OR UPDATE ON public.pm_hours_bank_entries
FOR EACH ROW EXECUTE FUNCTION public.pm_hours_bank_guard();

-- Time entries inside a submitted or approved week are locked for the owner.
CREATE OR REPLACE FUNCTION public.pm_time_entry_week_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pm_time_entries;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR public.pm_can_approve_hours(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_row := COALESCE(NEW, OLD);

  SELECT w.status INTO v_status
  FROM public.pm_timesheet_weeks w
  WHERE w.user_id = v_row.user_id
    AND v_row.entry_date BETWEEN w.week_start AND w.week_end
  LIMIT 1;

  IF v_status IN ('submitted','approved') THEN
    RAISE EXCEPTION 'This week has been % and can no longer be edited', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER pm_time_entry_week_lock_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.pm_time_entries
FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_week_lock();
