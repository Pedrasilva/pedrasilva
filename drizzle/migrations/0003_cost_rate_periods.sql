-- 1. Rate periods (admin read, server writes only)
CREATE TABLE public.pm_cost_rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.pm_resources(id) ON DELETE CASCADE,
  valid_from date NOT NULL,
  valid_to date NULL,
  cost_rate numeric NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pm_cost_rate_periods_lookup ON public.pm_cost_rate_periods(resource_id, valid_from);
GRANT SELECT ON public.pm_cost_rate_periods TO authenticated;
GRANT ALL ON public.pm_cost_rate_periods TO service_role;
ALTER TABLE public.pm_cost_rate_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cost rate periods" ON public.pm_cost_rate_periods
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Rebuild queue (filled by triggers, drained by the server hook)
CREATE TABLE public.pm_cost_rate_rebuild_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_date date NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);
GRANT ALL ON public.pm_cost_rate_rebuild_queue TO service_role;
ALTER TABLE public.pm_cost_rate_rebuild_queue ENABLE ROW LEVEL SECURITY;

-- Recalculation log
CREATE TABLE public.pm_cost_rate_recalc_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_by uuid NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'recalculate',
  from_date date NULL,
  to_date date NULL,
  resource_id uuid NULL,
  entries_changed integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.pm_cost_rate_recalc_log TO authenticated;
GRANT ALL ON public.pm_cost_rate_recalc_log TO service_role;
ALTER TABLE public.pm_cost_rate_recalc_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cost recalc log" ON public.pm_cost_rate_recalc_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Provenance column
ALTER TABLE public.pm_time_entries ADD COLUMN cost_rate_source text NULL
  CHECK (cost_rate_source IN ('live','backfill','recalc'));

-- Resource for an entry: the allocation's resource when logged on a task,
-- otherwise the person's resource via collaborator email.
CREATE OR REPLACE FUNCTION public.pm_entry_resource(_user_id uuid, _task_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.resource_id FROM public.pm_tasks t JOIN public.pm_allocations a ON a.id = t.allocation_id WHERE t.id = _task_id),
    (SELECT r.id FROM auth.users u
       JOIN public.collaborators c ON lower(c.email) = lower(u.email)
       JOIN public.pm_resources r ON r.collaborator_id = c.id
      WHERE u.id = _user_id ORDER BY r.active DESC NULLS LAST, r.created_at LIMIT 1)
  )
$$;
REVOKE ALL ON FUNCTION public.pm_entry_resource(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_entry_resource(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pm_cost_rate_at(_resource_id uuid, _date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.cost_rate FROM public.pm_cost_rate_periods p
   WHERE p.resource_id = _resource_id AND p.valid_from <= _date
     AND (p.valid_to IS NULL OR _date < p.valid_to)
   ORDER BY p.valid_from DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.pm_cost_rate_at(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_cost_rate_at(uuid, date) TO service_role;

-- Snapshot on save: client values are ignored.
CREATE OR REPLACE FUNCTION public.pm_time_entry_cost_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _res uuid;
BEGIN
  IF current_setting('psa.cost_rate_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.entry_date = OLD.entry_date AND NEW.user_id = OLD.user_id THEN
    NEW.cost_rate_snapshot := OLD.cost_rate_snapshot;
    NEW.cost_rate_source := OLD.cost_rate_source;
    RETURN NEW;
  END IF;
  IF NEW.entry_type::text = 'non_working' OR NEW.leave_type IS NOT NULL THEN
    NEW.cost_rate_snapshot := NULL;
    NEW.cost_rate_source := NULL;
    RETURN NEW;
  END IF;
  _res := public.pm_entry_resource(NEW.user_id, NEW.task_id);
  NEW.cost_rate_snapshot := CASE WHEN _res IS NULL THEN NULL ELSE public.pm_cost_rate_at(_res, NEW.entry_date) END;
  NEW.cost_rate_source := CASE WHEN NEW.cost_rate_snapshot IS NULL THEN NULL ELSE 'live' END;
  RETURN NEW;
END $$;
CREATE TRIGGER pm_time_entry_cost_snapshot_trg
  BEFORE INSERT OR UPDATE ON public.pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_cost_snapshot();

-- Server-only bulk write of snapshots (backfill)
CREATE OR REPLACE FUNCTION public.pm_write_cost_snapshots(_rows jsonb, _source text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  PERFORM set_config('psa.cost_rate_write', 'on', true);
  UPDATE public.pm_time_entries e
     SET cost_rate_snapshot = (r->>'rate')::numeric, cost_rate_source = _source
    FROM jsonb_array_elements(_rows) r
   WHERE e.id = (r->>'id')::uuid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('psa.cost_rate_write', 'off', true);
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.pm_write_cost_snapshots(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_write_cost_snapshots(jsonb, text) TO service_role;

-- Entries with hours worked and no snapshot (server-only)
CREATE OR REPLACE FUNCTION public.pm_entries_missing_cost()
RETURNS TABLE(id uuid, entry_date date, resource_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.entry_date, public.pm_entry_resource(e.user_id, e.task_id)
    FROM public.pm_time_entries e
   WHERE e.cost_rate_snapshot IS NULL AND e.entry_type::text <> 'non_working' AND e.leave_type IS NULL
$$;
REVOKE ALL ON FUNCTION public.pm_entries_missing_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_entries_missing_cost() TO service_role;

-- 4. Admin-only recalculation from a date
CREATE OR REPLACE FUNCTION public.pm_recalc_cost_snapshots(_from date, _resource_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can recalculate costs';
  END IF;
  PERFORM set_config('psa.cost_rate_write', 'on', true);
  WITH calc AS (
    SELECT e.id, public.pm_cost_rate_at(public.pm_entry_resource(e.user_id, e.task_id), e.entry_date) AS rate,
           public.pm_entry_resource(e.user_id, e.task_id) AS res
      FROM public.pm_time_entries e
     WHERE e.entry_date >= _from AND e.entry_type::text <> 'non_working' AND e.leave_type IS NULL
  )
  UPDATE public.pm_time_entries e
     SET cost_rate_snapshot = c.rate, cost_rate_source = 'recalc'
    FROM calc c
   WHERE e.id = c.id AND c.rate IS NOT NULL
     AND (_resource_id IS NULL OR c.res = _resource_id)
     AND e.cost_rate_snapshot IS DISTINCT FROM c.rate;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('psa.cost_rate_write', 'off', true);
  INSERT INTO public.pm_cost_rate_recalc_log(run_by, kind, from_date, to_date, resource_id, entries_changed)
  VALUES (auth.uid(), 'recalculate', _from, NULL, _resource_id, _n);
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.pm_recalc_cost_snapshots(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_recalc_cost_snapshots(date, uuid) TO authenticated, service_role;

-- Change detection -> rebuild queue
CREATE OR REPLACE FUNCTION public.pm_cost_rate_enqueue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from date := current_date;
BEGIN
  IF TG_TABLE_NAME = 'salary_snapshots' THEN
    _from := LEAST(
      COALESCE(CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.project_cost_effective_from, OLD.effective_from, OLD.reference_date) END, 'infinity'::date),
      COALESCE(CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.project_cost_effective_from, NEW.effective_from, NEW.reference_date) END, 'infinity'::date));
    IF _from = 'infinity'::date THEN _from := current_date; END IF;
  END IF;
  INSERT INTO public.pm_cost_rate_rebuild_queue(from_date, reason) VALUES (_from, TG_TABLE_NAME || ' ' || lower(TG_OP));
  RETURN NULL;
END $$;
CREATE TRIGGER pm_cost_rate_enqueue_salary AFTER INSERT OR UPDATE OR DELETE ON public.salary_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.pm_cost_rate_enqueue();
CREATE TRIGGER pm_cost_rate_enqueue_bo AFTER INSERT OR UPDATE ON public.bo_settings
  FOR EACH ROW EXECUTE FUNCTION public.pm_cost_rate_enqueue();
CREATE TRIGGER pm_cost_rate_enqueue_collab AFTER UPDATE OF daily_hours, days_per_week, departamento, archived_at ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.pm_cost_rate_enqueue();
CREATE TRIGGER pm_cost_rate_enqueue_resource AFTER UPDATE OF cost_rate, hourly_rate_is_override, collaborator_id ON public.pm_resources
  FOR EACH ROW EXECUTE FUNCTION public.pm_cost_rate_enqueue();