CREATE OR REPLACE FUNCTION public.pm_time_entry_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_stage_kind text;
BEGIN
  IF NEW.entry_type = 'project' THEN
    IF NEW.task_id IS NULL AND NEW.pm_stage_id IS NULL THEN
      RAISE EXCEPTION 'project time entries require task_id or pm_stage_id';
    END IF;

    IF NEW.task_id IS NULL AND NEW.pm_stage_id IS NOT NULL THEN
      SELECT stage_kind::text
      INTO v_stage_kind
      FROM public.pm_stages
      WHERE id = NEW.pm_stage_id;

      IF v_stage_kind IS DISTINCT FROM 'retainer_month' THEN
        RAISE EXCEPTION 'direct project time entries require a retainer month stage';
      END IF;
    END IF;

    NEW.internal_category := NULL;
    NEW.leave_type := NULL;
    NEW.quote_stage_id := NULL;
  ELSIF NEW.entry_type = 'retainer' THEN
    IF NEW.quote_stage_id IS NULL THEN
      RAISE EXCEPTION 'retainer time entries require quote_stage_id';
    END IF;
    NEW.task_id := NULL;
    NEW.pm_stage_id := NULL;
    NEW.internal_category := NULL;
    NEW.leave_type := NULL;
  ELSIF NEW.entry_type = 'internal' THEN
    IF NEW.internal_category IS NULL OR length(trim(NEW.internal_category)) = 0 THEN
      RAISE EXCEPTION 'internal time entries require internal_category';
    END IF;
    NEW.task_id := NULL;
    NEW.pm_stage_id := NULL;
    NEW.leave_type := NULL;
    NEW.quote_stage_id := NULL;
    NEW.billable := false;
  ELSIF NEW.entry_type = 'non_working' THEN
    IF NEW.leave_type IS NULL OR length(trim(NEW.leave_type)) = 0 THEN
      RAISE EXCEPTION 'non_working time entries require leave_type';
    END IF;
    NEW.task_id := NULL;
    NEW.pm_stage_id := NULL;
    NEW.internal_category := NULL;
    NEW.quote_stage_id := NULL;
    NEW.billable := false;
  END IF;
  RETURN NEW;
END;
$function$;