ALTER TABLE public.crm_opportunities ADD COLUMN IF NOT EXISTS log_hours boolean NOT NULL DEFAULT false;
UPDATE public.crm_opportunities o SET log_hours = true WHERE o.stage NOT IN ('won','lost') AND EXISTS (SELECT 1 FROM public.pm_time_entries e WHERE e.opportunity_id = o.id);
DROP FUNCTION public.crm_leads_directory();
CREATE FUNCTION public.crm_leads_directory()
RETURNS TABLE(id uuid, name text, company_name text, stage text, is_open boolean, can_log_hours boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.crm_leads_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_leads_directory() TO authenticated;
CREATE OR REPLACE FUNCTION public.pm_time_entry_pursuit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;