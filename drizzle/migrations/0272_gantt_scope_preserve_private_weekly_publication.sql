CREATE OR REPLACE FUNCTION public.pm_gantt_write_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_project uuid; new_project uuid; other_project uuid; weekly boolean;
BEGIN
 IF auth.uid() IS NULL THEN
  IF session_user IN ('postgres','supabase_admin') OR coalesce(auth.role(),'')='service_role' THEN RETURN coalesce(NEW,OLD); END IF;
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND public.is_psa_staff() AND public.has_role(auth.uid(),'admin') THEN RETURN OLD; END IF;
 weekly:=coalesce(current_setting('app.pm_week_plan_apply',true),'')='1' AND public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all'));
 IF TG_TABLE_NAME='pm_stages' THEN
  IF weekly AND TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['start_date','end_date','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['start_date','end_date','updated_at']) THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN old_project:=OLD.project_id; END IF;
  IF TG_OP<>'DELETE' THEN
   new_project:=NEW.project_id;
   IF NEW.parent_stage_id IS NOT NULL THEN
    SELECT project_id INTO other_project FROM pm_stages WHERE id=NEW.parent_stage_id;
    IF other_project IS DISTINCT FROM new_project THEN RAISE EXCEPTION 'Cross-project stage parent' USING ERRCODE='42501'; END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='pm_allocations' THEN
  IF TG_OP='INSERT' AND NEW.source='timesheet_link' AND NEW.planning_removed_at IS NOT NULL AND NEW.hours_per_day=0 AND NEW.resource_id=public.pm_get_my_resource_id() THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN SELECT project_id INTO old_project FROM pm_stages WHERE id=OLD.stage_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT project_id INTO new_project FROM pm_stages WHERE id=NEW.stage_id; END IF;
  IF weekly THEN RETURN coalesce(NEW,OLD); END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN
   SELECT project_id INTO old_project FROM pm_stages WHERE id=OLD.predecessor_id;
   SELECT project_id INTO other_project FROM pm_stages WHERE id=OLD.successor_id;
   IF NOT coalesce(public.pm_can_edit_gantt(other_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
   SELECT project_id INTO new_project FROM pm_stages WHERE id=NEW.predecessor_id;
   SELECT project_id INTO other_project FROM pm_stages WHERE id=NEW.successor_id;
   IF NOT coalesce(public.pm_can_edit_gantt(other_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'INSERT' AND NOT coalesce(public.pm_can_edit_gantt(old_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'DELETE' AND NOT coalesce(public.pm_can_edit_gantt(new_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;