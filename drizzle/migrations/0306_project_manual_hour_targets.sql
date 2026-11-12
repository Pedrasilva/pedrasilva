ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS planned_hours_target numeric;
ALTER TABLE public.pm_projects ADD COLUMN IF NOT EXISTS planned_hours_target numeric;
CREATE OR REPLACE FUNCTION public.pm_set_hours_target(_project uuid,_stage uuid,_hours numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.pm_can_edit_gantt(_project) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _hours IS NOT NULL AND (_hours<0 OR _hours='NaN'::numeric OR _hours='Infinity'::numeric) THEN RAISE EXCEPTION 'Invalid planned hours'; END IF;
 IF _stage IS NULL THEN UPDATE public.pm_projects SET planned_hours_target=_hours WHERE id=_project;
 ELSE UPDATE public.pm_stages SET planned_hours_target=_hours WHERE id=_stage AND project_id=_project; IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found'; END IF; END IF;
END $$;
REVOKE ALL ON FUNCTION public.pm_set_hours_target(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_set_hours_target(uuid,uuid,numeric) TO authenticated,service_role;
COMMENT ON COLUMN public.pm_stages.planned_hours_target IS 'Current explicit manual hour budget; NULL estimates from fee. Independent of allocations and locked baseline.';
COMMENT ON COLUMN public.pm_projects.planned_hours_target IS 'Current explicit manual project hour budget; NULL sums stage estimates or contract fee. No backfill.';