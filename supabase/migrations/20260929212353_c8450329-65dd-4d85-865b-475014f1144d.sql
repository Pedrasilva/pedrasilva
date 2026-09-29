CREATE OR REPLACE FUNCTION public.marketing_is_project_team_member(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pm_project_team t
    JOIN public.pm_resources r ON r.id = t.resource_id
    JOIN auth.users u ON u.id = _user_id
    WHERE t.project_id = _project_id
      AND r.email IS NOT NULL AND u.email IS NOT NULL
      AND lower(trim(r.email)) = lower(trim(u.email))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_is_project_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_is_project_team_member(uuid, uuid) TO authenticated, service_role;

CREATE TYPE public.marketing_name_rule AS ENUM ('name', 'describe_only', 'never_mention');

CREATE TABLE public.marketing_project_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  sector public.marketing_sector NULL,
  location text NULL,
  stage public.marketing_stage NULL,
  year_completed integer NULL,
  client_ambition text NULL,
  central_idea text NULL,
  challenges text NULL,
  proud_of text NULL,
  key_facts text NULL,
  name_rule public.marketing_name_rule NOT NULL DEFAULT 'describe_only',
  public_description text NULL,
  clearance public.marketing_clearance NOT NULL DEFAULT 'unknown',
  rules_notes text NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  created_by uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_project_profiles TO authenticated;
GRANT ALL ON public.marketing_project_profiles TO service_role;
ALTER TABLE public.marketing_project_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY mpp_select ON public.marketing_project_profiles FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.view','all')
  OR (public.has_module_permission(auth.uid(),'marketing.view','own')
      AND public.marketing_is_project_team_member(auth.uid(), project_id)));
CREATE POLICY mpp_insert ON public.marketing_project_profiles FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all'));
CREATE POLICY mpp_update ON public.marketing_project_profiles FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.curate','all')
  OR (public.has_module_permission(auth.uid(),'marketing.contribute','own')
      AND public.marketing_is_project_team_member(auth.uid(), project_id)))
WITH CHECK (public.has_module_permission(auth.uid(),'marketing.curate','all')
  OR (public.has_module_permission(auth.uid(),'marketing.contribute','own')
      AND public.marketing_is_project_team_member(auth.uid(), project_id)));
CREATE POLICY mpp_delete ON public.marketing_project_profiles FOR DELETE TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.curate','all'));

CREATE OR REPLACE FUNCTION public.marketing_project_profiles_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, auth AS $$
DECLARE is_curator boolean;
BEGIN
  NEW.aliases := COALESCE((
    SELECT array_agg(a ORDER BY first_pos) FROM (
      SELECT a, min(ord) AS first_pos
      FROM unnest(COALESCE(NEW.aliases, '{}')) WITH ORDINALITY AS x(raw, ord),
           LATERAL (SELECT lower(trim(raw)) AS a) l
      WHERE a IS NOT NULL AND a <> ''
      GROUP BY a
    ) d), '{}');
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  -- service role / no session (server jobs) skip the curator check
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  is_curator := public.has_module_permission(auth.uid(),'marketing.curate','all');
  IF NOT is_curator THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.name_rule <> 'describe_only' OR NEW.public_description IS NOT NULL
         OR NEW.clearance <> 'unknown' OR NEW.rules_notes IS NOT NULL THEN
        RAISE EXCEPTION 'Only marketing curators can set public rules' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.name_rule IS DISTINCT FROM OLD.name_rule
         OR NEW.public_description IS DISTINCT FROM OLD.public_description
         OR NEW.clearance IS DISTINCT FROM OLD.clearance
         OR NEW.rules_notes IS DISTINCT FROM OLD.rules_notes THEN
        RAISE EXCEPTION 'Only marketing curators can change public rules' USING ERRCODE = '42501';
      END IF;
      NEW.project_id := OLD.project_id;
      NEW.created_by := OLD.created_by;
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_project_profiles_before_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER marketing_project_profiles_before_write
BEFORE INSERT OR UPDATE ON public.marketing_project_profiles
FOR EACH ROW EXECUTE FUNCTION public.marketing_project_profiles_before_write();

CREATE OR REPLACE FUNCTION public.marketing_effective_clearance(_capture_id uuid)
RETURNS public.marketing_clearance LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH v AS (
    SELECT c.clearance AS own, p.clearance AS proj
    FROM public.marketing_captures c
    LEFT JOIN public.marketing_project_profiles p ON p.project_id = c.project_id
    WHERE c.id = _capture_id
  ), ranked AS (
    SELECT x.cl, CASE x.cl WHEN 'internal_only' THEN 0 WHEN 'needs_client_approval' THEN 1
                          WHEN 'unknown' THEN 2 ELSE 3 END AS r
    FROM v, LATERAL (VALUES (v.own), (v.proj)) AS x(cl)
    WHERE x.cl IS NOT NULL
  )
  SELECT cl FROM ranked ORDER BY r LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_effective_clearance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_effective_clearance(uuid) TO authenticated, service_role;