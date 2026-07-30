
-- Resolve a user's resource record (email match, or collaborator link)
CREATE OR REPLACE FUNCTION public.pm_resource_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id
  FROM public.pm_resources r
  WHERE lower(r.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = _user_id))
     OR r.collaborator_id = (
          SELECT c.id FROM public.collaborators c
          JOIN auth.users u ON lower(u.email) = lower(c.email)
          WHERE u.id = _user_id
          LIMIT 1
        )
  LIMIT 1
$$;

-- "assigned" scope: every project the user is staffed on via pm_allocations
CREATE OR REPLACE FUNCTION public.pm_assigned_project_ids(_user_id uuid)
RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT s.project_id
  FROM public.pm_allocations a
  JOIN public.pm_stages s ON s.id = a.stage_id
  WHERE a.resource_id = public.pm_resource_id_for_user(_user_id)
    AND s.project_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.pm_has_assigned_access(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pm_assigned_project_ids(_user_id) p
    WHERE p.project_id = _project_id
  )
$$;

-- "team" scope: every resource allocated to any project the user is assigned to
CREATE OR REPLACE FUNCTION public.pm_team_resource_ids(_user_id uuid)
RETURNS TABLE(resource_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT a.resource_id
  FROM public.pm_allocations a
  JOIN public.pm_stages s ON s.id = a.stage_id
  WHERE s.project_id IN (SELECT p.project_id FROM public.pm_assigned_project_ids(_user_id) p)
    AND a.resource_id IS NOT NULL
$$;

-- Same as above, mapped back to auth user ids
CREATE OR REPLACE FUNCTION public.pm_team_user_ids(_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT u.id
  FROM public.pm_team_resource_ids(_user_id) t
  JOIN public.pm_resources r ON r.id = t.resource_id
  LEFT JOIN public.collaborators c ON c.id = r.collaborator_id
  JOIN auth.users u
    ON lower(u.email) = lower(r.email)
    OR lower(u.email) = lower(c.email)
$$;

CREATE OR REPLACE FUNCTION public.pm_has_team_access(_user_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = _target_user_id
      OR EXISTS (
        SELECT 1 FROM public.pm_team_user_ids(_user_id) t
        WHERE t.user_id = _target_user_id
      )
$$;

REVOKE EXECUTE ON FUNCTION public.pm_resource_id_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pm_assigned_project_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pm_has_assigned_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pm_team_resource_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pm_team_user_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pm_has_team_access(uuid, uuid) FROM anon;
