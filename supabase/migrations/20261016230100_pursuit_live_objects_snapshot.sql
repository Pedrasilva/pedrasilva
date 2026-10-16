-- Current live pursuit definitions exported with pg_get_functiondef/pg_get_triggerdef.
-- Backfill only when introducing the flag: replay must not override later curation.
ALTER TABLE public.pm_time_entries ADD COLUMN IF NOT EXISTS opportunity_id uuid;
DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pm_time_entries'::regclass AND conname='pm_time_entries_opportunity_id_fkey') THEN
  ALTER TABLE public.pm_time_entries ADD CONSTRAINT pm_time_entries_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_opportunities' AND column_name='log_hours') THEN
  ALTER TABLE public.crm_opportunities ADD COLUMN IF NOT EXISTS log_hours boolean NOT NULL DEFAULT false;
  UPDATE public.crm_opportunities o SET log_hours = true WHERE o.stage NOT IN ('won','lost') AND EXISTS (SELECT 1 FROM public.pm_time_entries e WHERE e.opportunity_id=o.id);
 END IF;
 -- Older repository versions have five output columns; live already has six.
 IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.crm_leads_directory()') AND NOT ('can_log_hours'=ANY(proargnames))) THEN
  DROP FUNCTION IF EXISTS public.crm_leads_directory();
 END IF;
END $migration$;
CREATE INDEX IF NOT EXISTS pm_time_entries_opportunity_idx ON public.pm_time_entries USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL);
COMMENT ON COLUMN public.pm_time_entries.opportunity_id IS 'Pursuit entries only (internal_category = Pursuit): the CRM lead the time was spent on.';
CREATE OR REPLACE FUNCTION public.crm_leads_directory()
 RETURNS TABLE(id uuid, name text, company_name text, stage text, is_open boolean, can_log_hours boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT o.id, o.name, c.nome, o.stage::text, o.stage NOT IN ('won','lost'),
   (o.log_hours AND o.stage <> 'lost')
   OR (o.stage = 'won' AND NOT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.opportunity_id = o.id AND p.status = 'active'))
   OR EXISTS (SELECT 1 FROM public.pm_time_entries e WHERE e.opportunity_id = o.id AND e.user_id = auth.uid())
 FROM public.crm_opportunities o LEFT JOIN public.companies c ON c.id = o.company_id
 WHERE auth.uid() IS NOT NULL AND public.is_psa_staff()
 AND (o.stage NOT IN ('won','lost')
   OR EXISTS (SELECT 1 FROM public.pm_time_entries e WHERE e.opportunity_id = o.id AND e.user_id = auth.uid())
   OR (o.stage = 'won' AND NOT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.opportunity_id = o.id AND p.status = 'active')))
 ORDER BY o.name
$function$;
CREATE OR REPLACE FUNCTION public.pm_time_entry_pursuit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_stage text;
BEGIN
 IF NEW.opportunity_id IS NOT NULL AND (NEW.entry_type <> 'internal' OR NEW.internal_category IS DISTINCT FROM 'Pursuit') THEN
  RAISE EXCEPTION 'opportunity_id is only allowed on Pursuit entries';
 END IF;
 IF NEW.entry_type = 'internal' AND NEW.internal_category = 'Pursuit' THEN
  IF NEW.opportunity_id IS NULL THEN
   IF TG_OP = 'INSERT' OR OLD.opportunity_id IS NULL OR NEW.hours > OLD.hours THEN
    RAISE EXCEPTION 'Pursuit entries require a lead (opportunity_id)';
   END IF;
  ELSE
   IF TG_OP = 'INSERT' OR NEW.hours > OLD.hours OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id THEN
    SELECT stage::text INTO v_stage FROM public.crm_opportunities WHERE id = NEW.opportunity_id;
    IF v_stage = 'lost' THEN
     RAISE EXCEPTION 'This lead is closed (%); it can''t take new hours', v_stage;
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS pm_time_entries_pursuit_guard ON public.pm_time_entries;
CREATE TRIGGER pm_time_entries_pursuit_guard BEFORE INSERT OR UPDATE ON public.pm_time_entries FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_pursuit_guard();
CREATE OR REPLACE FUNCTION public.pm_can_see_project_financials(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid,'admin') OR public.has_permission(_uid,'projects.financials')
      OR public.has_permission(_uid,'finance.dashboard')
$function$;
CREATE OR REPLACE FUNCTION public.pm_project_pursuit_totals(_project_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(project_id uuid, resource_id uuid, hours numeric, snapshot_cost numeric, hours_without_snapshot numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, r.id,
         sum(e.hours),
         sum(CASE WHEN e.cost_rate_snapshot IS NOT NULL THEN e.hours * e.cost_rate_snapshot ELSE 0 END),
         sum(CASE WHEN e.cost_rate_snapshot IS NULL THEN e.hours ELSE 0 END)
  FROM public.pm_projects p
  JOIN public.pm_time_entries e ON e.opportunity_id = p.opportunity_id
   AND e.entry_type = 'internal' AND e.internal_category = 'Pursuit'
  LEFT JOIN auth.users u ON u.id = e.user_id
  LEFT JOIN LATERAL (
    SELECT r0.id FROM public.pm_resources r0
    WHERE r0.email = u.email
       OR (r0.collaborator_id IS NOT NULL AND public.get_user_id_for_collaborator(r0.collaborator_id) = e.user_id)
    LIMIT 1) r ON true
  WHERE public.pm_can_see_project_financials(auth.uid())
    AND p.opportunity_id IS NOT NULL
    AND (_project_ids IS NULL OR p.id = ANY(_project_ids))
  GROUP BY p.id, r.id
$function$;
CREATE OR REPLACE FUNCTION public.crm_opportunity_pursuit_hours(_opportunity_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline')
                OR public.has_permission(auth.uid(),'finance.dashboard')
         THEN coalesce((SELECT sum(hours) FROM public.pm_time_entries
                        WHERE opportunity_id = _opportunity_id AND internal_category = 'Pursuit'), 0)
         ELSE NULL END
$function$;
CREATE OR REPLACE FUNCTION public.pm_linkable_opportunities()
 RETURNS TABLE(id uuid, name text, company_name text, stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.name, c.nome, o.stage::text
  FROM public.crm_opportunities o LEFT JOIN public.companies c ON c.id = o.company_id
  WHERE public.pm_can_see_project_financials(auth.uid())
  ORDER BY o.name
$function$;
CREATE OR REPLACE FUNCTION public.pm_link_project_opportunity(_project_id uuid, _opportunity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.pm_can_see_project_financials(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.pm_projects SET opportunity_id = _opportunity_id WHERE id = _project_id;
END $function$;
-- Preserve the live ACLs, including PUBLIC execute on the trigger function only.
REVOKE ALL ON FUNCTION public.crm_leads_directory(), public.pm_can_see_project_financials(uuid), public.pm_project_pursuit_totals(uuid[]), public.crm_opportunity_pursuit_hours(uuid), public.pm_linkable_opportunities(), public.pm_link_project_opportunity(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_leads_directory(), public.pm_can_see_project_financials(uuid), public.pm_project_pursuit_totals(uuid[]), public.crm_opportunity_pursuit_hours(uuid), public.pm_linkable_opportunities(), public.pm_link_project_opportunity(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pm_time_entry_pursuit_guard() TO PUBLIC, authenticated, service_role;