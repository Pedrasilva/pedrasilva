
-- 1. Backfill pm_resources from existing collaborators
INSERT INTO public.pm_resources (collaborator_id, name, email, team, active, color)
SELECT
  c.id,
  c.nome,
  c.email,
  CASE WHEN c.departamento = 'Backoffice' THEN 'back_office' ELSE 'project' END,
  true,
  '#a78bfa'
FROM public.collaborators c
WHERE NOT EXISTS (
  SELECT 1 FROM public.pm_resources r
  WHERE r.collaborator_id = c.id
     OR (r.email IS NOT NULL AND r.email = c.email)
);

-- Link any pre-existing pm_resources matched by email to their collaborator
UPDATE public.pm_resources r
SET collaborator_id = c.id
FROM public.collaborators c
WHERE r.collaborator_id IS NULL
  AND r.email IS NOT NULL
  AND r.email = c.email;

-- 2. Trigger: auto-create pm_resource when a collaborator is inserted
CREATE OR REPLACE FUNCTION public.pm_create_resource_for_collaborator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pm_resources (collaborator_id, name, email, team, active, color)
  VALUES (
    NEW.id,
    NEW.nome,
    NEW.email,
    CASE WHEN NEW.departamento = 'Backoffice' THEN 'back_office' ELSE 'project' END,
    true,
    '#a78bfa'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_create_resource_for_collaborator ON public.collaborators;
CREATE TRIGGER trg_pm_create_resource_for_collaborator
AFTER INSERT ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.pm_create_resource_for_collaborator();

-- 3. Trigger: sync name/email/team when collaborator updates
CREATE OR REPLACE FUNCTION public.pm_sync_resource_from_collaborator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pm_resources
  SET
    name = NEW.nome,
    email = NEW.email,
    team = CASE WHEN NEW.departamento = 'Backoffice' THEN 'back_office' ELSE 'project' END,
    updated_at = now()
  WHERE collaborator_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_sync_resource_from_collaborator ON public.collaborators;
CREATE TRIGGER trg_pm_sync_resource_from_collaborator
AFTER UPDATE OF nome, email, departamento ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.pm_sync_resource_from_collaborator();
