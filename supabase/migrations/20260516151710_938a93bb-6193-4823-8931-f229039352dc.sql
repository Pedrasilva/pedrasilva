CREATE OR REPLACE FUNCTION public.salary_snapshots_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.collaborator_id IS DISTINCT FROM OLD.collaborator_id THEN
    RAISE EXCEPTION 'salary_snapshots.collaborator_id is immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.salary_snapshots_guard_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salary_snapshots_guard_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.salary_snapshots_guard_immutable() FROM authenticated;