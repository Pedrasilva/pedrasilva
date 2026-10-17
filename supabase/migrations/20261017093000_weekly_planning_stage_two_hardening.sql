-- Stage 2 only: no allocation, stage-date, timesheet or approval writes.
REVOKE ALL ON public.pm_week_plans, public.pm_week_plan_slots FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_week_plans, public.pm_week_plan_slots TO authenticated;
ALTER POLICY week_plans_planners ON public.pm_week_plans USING (public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all'))) WITH CHECK (public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')));
ALTER POLICY week_slots_planners ON public.pm_week_plan_slots USING (public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all'))) WITH CHECK (public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')));
CREATE OR REPLACE FUNCTION public.pm_week_draft_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE applying boolean:=coalesce(current_setting('app.pm_week_plan_apply',true),'')='1'; parent public.pm_week_plans; note jsonb; key text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='pm_week_plans' THEN
  IF TG_OP<>'INSERT' AND OLD.status='approved' AND NOT applying THEN RAISE EXCEPTION 'Approved plans are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NOT applying AND (NEW.status<>'draft' OR (TG_OP='UPDATE' AND (OLD.status<>'draft' OR NEW.week_start<>OLD.week_start))) THEN RAISE EXCEPTION 'Draft editing only'; END IF;
  IF NEW.notes IS NULL OR jsonb_typeof(NEW.notes)<>'array' THEN RAISE EXCEPTION 'Notes must be an array'; END IF;
  IF jsonb_array_length(NEW.notes)>50 THEN RAISE EXCEPTION 'At most 50 notes'; END IF;
  FOR note IN SELECT value FROM jsonb_array_elements(NEW.notes) LOOP
   IF jsonb_typeof(note)<>'object' OR NOT (note ?& ARRAY['project_id','stage_id','until']) THEN RAISE EXCEPTION 'Invalid note shape'; END IF;
   FOR key IN SELECT jsonb_object_keys(note) LOOP
    IF key NOT IN ('project_id','stage_id','until','from','resource_id') OR jsonb_typeof(note->key)<>'string' THEN RAISE EXCEPTION 'Invalid note field'; END IF;
    IF key IN ('project_id','stage_id','resource_id') THEN
     IF (note->>key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid note UUID'; END IF;
     PERFORM (note->>key)::uuid;
    ELSE
     IF (note->>key) !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid note date'; END IF;
     PERFORM (note->>key)::date;
    END IF;
   END LOOP;
   IF note ? 'from' AND (note->>'from')::date>(note->>'until')::date THEN RAISE EXCEPTION 'Invalid note range'; END IF;
  END LOOP;
  NEW.updated_at:=clock_timestamp(); NEW.updated_by:=auth.uid();
  SELECT r.name INTO NEW.updated_by_name FROM public.pm_resources r WHERE r.collaborator_id=public.get_my_collaborator_id() LIMIT 1;
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' THEN
  SELECT * INTO parent FROM public.pm_week_plans WHERE id=OLD.plan_id FOR UPDATE;
  IF parent.status='approved' AND NOT applying THEN RAISE EXCEPTION 'Approved plan slots are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO parent FROM public.pm_week_plans WHERE id=NEW.plan_id FOR UPDATE;
 IF parent.id IS NULL OR (parent.status<>'draft' AND NOT applying) OR NEW.day NOT BETWEEN parent.week_start AND parent.week_start+4 THEN RAISE EXCEPTION 'Slot must belong to an editable weekday'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pm_resources r WHERE r.id=NEW.resource_id AND r.active=true) OR NOT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id=NEW.project_id AND p.status='active') THEN RAISE EXCEPTION 'Inactive resource or project'; END IF;
 IF EXISTS (SELECT 1 FROM public.holidays h WHERE h.data=NEW.day) OR EXISTS (SELECT 1 FROM public.vacation_requests v JOIN public.pm_resources r ON r.collaborator_id=v.collaborator_id WHERE r.id=NEW.resource_id AND v.estado IN ('aprovada','aprovado') AND NEW.day BETWEEN v.data_inicio AND v.data_fim) THEN RAISE EXCEPTION 'Leave and holidays cannot be painted'; END IF;
 IF NEW.stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pm_stages s WHERE s.id=NEW.stage_id AND s.project_id=NEW.project_id AND NEW.day BETWEEN s.start_date AND s.end_date AND NOT coalesce(s.is_milestone,false) AND coalesce(s.stage_kind,'')<>'retainer_monthly' AND s.archived_at IS NULL AND coalesce(s.status::text,'planned')<>'cancelled' AND NOT EXISTS (SELECT 1 FROM public.pm_stages c WHERE c.parent_stage_id=s.id AND c.archived_at IS NULL AND coalesce(c.status::text,'planned')<>'cancelled')) THEN RAISE EXCEPTION 'Stage is not allocatable for this project and day'; END IF;
 RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.pm_week_draft_guard() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.pm_week_slot_touch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 IF TG_OP<>'INSERT' THEN UPDATE public.pm_week_plans SET updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=OLD.plan_id; END IF;
 IF TG_OP<>'DELETE' AND (TG_OP='INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN UPDATE public.pm_week_plans SET updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=NEW.plan_id; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.pm_week_slot_touch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pm_week_slot_touch AFTER INSERT OR UPDATE OR DELETE ON public.pm_week_plan_slots FOR EACH ROW EXECUTE FUNCTION public.pm_week_slot_touch();
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pm_week_board(date)'::regprocedure) INTO definition;
 IF position('''notes'',p.notes' in definition)=0 THEN RAISE EXCEPTION 'Board notes projection not found'; END IF;
 definition:=replace(definition,'''notes'',p.notes','''notes'',CASE WHEN planner THEN p.notes ELSE ''[]''::jsonb END');
 EXECUTE definition;
END $patch$;