DO $$ BEGIN
  CREATE TYPE public.pm_project_team_role AS ENUM ('manager','coordinator','co_author','support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.pm_project_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.pm_resources(id) ON DELETE CASCADE,
  role public.pm_project_team_role NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, resource_id, role)
);

CREATE INDEX pm_project_team_project_idx ON public.pm_project_team(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_project_team TO authenticated;
GRANT ALL ON public.pm_project_team TO service_role;

ALTER TABLE public.pm_project_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_select" ON public.pm_project_team
  FOR SELECT TO authenticated
  USING (public.pm_can_view_projects(auth.uid()) OR public.pm_has_assigned_access(auth.uid(), project_id));

CREATE POLICY "team_write" ON public.pm_project_team
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.pm_can_view_projects(auth.uid()) OR public.pm_has_assigned_access(auth.uid(), project_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.pm_can_view_projects(auth.uid()) OR public.pm_has_assigned_access(auth.uid(), project_id));

CREATE TRIGGER pm_project_team_updated_at BEFORE UPDATE ON public.pm_project_team
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();