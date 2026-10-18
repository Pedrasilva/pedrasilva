CREATE OR REPLACE FUNCTION public.pm_guard_logged_history_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE has_history boolean;
BEGIN
 IF TG_TABLE_NAME='pm_tasks' THEN SELECT EXISTS(SELECT 1 FROM pm_time_entries WHERE task_id=OLD.id) INTO has_history;
 ELSIF TG_TABLE_NAME='pm_allocations' THEN SELECT EXISTS(SELECT 1 FROM pm_time_entries e JOIN pm_tasks t ON t.id=e.task_id WHERE t.allocation_id=OLD.id) INTO has_history;
 ELSIF TG_TABLE_NAME='pm_stages' THEN
  WITH RECURSIVE descendants AS (SELECT OLD.id id UNION ALL SELECT s.id FROM pm_stages s JOIN descendants d ON s.parent_stage_id=d.id)
  SELECT EXISTS(SELECT 1 FROM pm_time_entries e LEFT JOIN pm_tasks t ON t.id=e.task_id LEFT JOIN pm_allocations a ON a.id=t.allocation_id WHERE e.pm_stage_id IN (SELECT id FROM descendants) OR a.stage_id IN (SELECT id FROM descendants)) OR EXISTS(SELECT 1 FROM historical_time_entries h WHERE h.stage_id IN (SELECT id FROM descendants)) INTO has_history;
 ELSIF TG_TABLE_NAME='pm_projects' THEN SELECT EXISTS(SELECT 1 FROM pm_time_entries e LEFT JOIN pm_tasks t ON t.id=e.task_id LEFT JOIN pm_allocations a ON a.id=t.allocation_id LEFT JOIN pm_stages s ON s.id=coalesce(e.pm_stage_id,a.stage_id) WHERE s.project_id=OLD.id) OR EXISTS(SELECT 1 FROM historical_time_entries WHERE project_id=OLD.id) INTO has_history;
 END IF;
 IF has_history THEN RAISE EXCEPTION 'logged_history_delete_blocked: Retire instead; logged hours must be preserved.' USING ERRCODE='23503'; END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.pm_guard_logged_history_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pm_task_logged_history_delete_guard BEFORE DELETE ON public.pm_tasks FOR EACH ROW EXECUTE FUNCTION public.pm_guard_logged_history_delete();
CREATE TRIGGER pm_allocation_logged_history_delete_guard BEFORE DELETE ON public.pm_allocations FOR EACH ROW EXECUTE FUNCTION public.pm_guard_logged_history_delete();
CREATE TRIGGER pm_stage_logged_history_delete_guard BEFORE DELETE ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_guard_logged_history_delete();
CREATE TRIGGER pm_project_logged_history_delete_guard BEFORE DELETE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.pm_guard_logged_history_delete();
REVOKE ALL ON FUNCTION public.pm_recover_20261018(jsonb) FROM authenticated, service_role;
COMMENT ON FUNCTION public.pm_recover_20261018(jsonb) IS 'Recovery completed: 34 allocations,34 tasks,380 entries,1786.24h; 219 public tables checked unchanged outside approved IDs. Disabled after recovery.';