
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS is_fee_only boolean NOT NULL DEFAULT true;

ALTER TYPE public.pm_time_entry_type ADD VALUE IF NOT EXISTS 'retainer';

ALTER TABLE public.pm_time_entries
  ADD COLUMN IF NOT EXISTS quote_stage_id uuid REFERENCES public.quote_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pm_time_entries_quote_stage_date_idx
  ON public.pm_time_entries (quote_stage_id, entry_date)
  WHERE quote_stage_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pm_time_entry_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entry_type = 'project' THEN
    IF NEW.task_id IS NULL THEN
      RAISE EXCEPTION 'project time entries require task_id';
    END IF;
    NEW.internal_category := NULL;
    NEW.leave_type := NULL;
    NEW.quote_stage_id := NULL;
  ELSIF NEW.entry_type = 'retainer' THEN
    IF NEW.quote_stage_id IS NULL THEN
      RAISE EXCEPTION 'retainer time entries require quote_stage_id';
    END IF;
    NEW.task_id := NULL;
    NEW.internal_category := NULL;
    NEW.leave_type := NULL;
  ELSIF NEW.entry_type = 'internal' THEN
    IF NEW.internal_category IS NULL OR length(trim(NEW.internal_category)) = 0 THEN
      RAISE EXCEPTION 'internal time entries require internal_category';
    END IF;
    NEW.task_id := NULL;
    NEW.leave_type := NULL;
    NEW.quote_stage_id := NULL;
    NEW.billable := false;
  ELSIF NEW.entry_type = 'non_working' THEN
    IF NEW.leave_type IS NULL OR length(trim(NEW.leave_type)) = 0 THEN
      RAISE EXCEPTION 'non_working time entries require leave_type';
    END IF;
    NEW.task_id := NULL;
    NEW.internal_category := NULL;
    NEW.quote_stage_id := NULL;
    NEW.billable := false;
  END IF;
  RETURN NEW;
END;
$function$;
