CREATE OR REPLACE FUNCTION public.salary_snapshots_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.collaborator_id IS DISTINCT FROM OLD.collaborator_id THEN
    RAISE EXCEPTION 'salary_snapshots.collaborator_id is immutable';
  END IF;

  IF NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'salary_snapshots.effective_from is immutable — create a new record instead';
  END IF;

  RETURN NEW;
END;
$$;