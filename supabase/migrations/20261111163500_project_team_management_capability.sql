-- Delegate only audited team actions; assigning the capability remains admin-only.
CREATE OR REPLACE FUNCTION public.pm_can_manage_project_teams()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR
 public.has_module_permission(auth.uid(),'projects.manage_teams','all'))
$$;
REVOKE ALL ON FUNCTION public.pm_can_manage_project_teams() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_project_teams() TO authenticated,service_role;

-- Preserve all deployed defaults, revision checks, audit, conflict and cascade guards.
DO $$
DECLARE signature text; definition text; old_guard text := 'public.has_role(auth.uid(),''admin'')';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.pm_preview_project_access(uuid)',
 'public.pm_change_project_access(uuid,uuid,jsonb,integer,text)',
 'public.pm_change_project_team(uuid,uuid,public.pm_project_team_role,boolean,text)',
 'public.pm_team_admin_guard()'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF length(definition)-length(replace(definition,old_guard,''))<>length(old_guard) THEN
   RAISE EXCEPTION 'Expected exactly one administrator guard in %',signature;
  END IF;
  EXECUTE replace(definition,old_guard,'public.pm_can_manage_project_teams()');
 END LOOP;
END $$;

-- A safe picker: identity/display fields only, never salary or resource rate columns.
CREATE OR REPLACE FUNCTION public.pm_project_team_directory()
RETURNS TABLE(id uuid,name text,color text,collaborator_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pm_can_manage_project_teams() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id,r.name,r.color,r.collaborator_id FROM public.pm_resources r
 WHERE r.active IS DISTINCT FROM false ORDER BY r.name,r.id;
END $$;
REVOKE ALL ON FUNCTION public.pm_project_team_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_team_directory() TO authenticated,service_role;

-- Capability is an individual override with all-project scope, not a role baseline.
CREATE OR REPLACE FUNCTION public.pm_team_capability_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND OLD.permission_key='projects.manage_teams') OR
    (TG_OP<>'DELETE' AND NEW.permission_key='projects.manage_teams') THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='role_permissions' THEN RAISE EXCEPTION 'Project team management must be granted per user'; END IF;
  IF TG_OP<>'DELETE' AND NEW.scope<>'all' THEN RAISE EXCEPTION 'Project team management requires all-project scope'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER pm_team_capability_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
 FOR EACH ROW EXECUTE FUNCTION public.pm_team_capability_assignment_guard();
CREATE TRIGGER pm_team_capability_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
 FOR EACH ROW EXECUTE FUNCTION public.pm_team_capability_assignment_guard();
COMMENT ON FUNCTION public.pm_can_manage_project_teams() IS 'Admin or individually granted projects.manage_teams/all. Does not activate B1 or assign any user.';