-- 1) Backfill new granular HR permissions for existing users (additive)
INSERT INTO public.user_permissions (user_id, permission_key, granted)
SELECT DISTINCT up.user_id, k.new_key, true
FROM public.user_permissions up
CROSS JOIN LATERAL (
  VALUES ('hr.colaborador.view'), ('hr.colaborador.compensation.view'), ('hr.colaborador.edit')
) AS k(new_key)
WHERE up.permission_key = 'hr.colaboradores' AND up.granted = true
ON CONFLICT DO NOTHING;

INSERT INTO public.user_permissions (user_id, permission_key, granted)
SELECT DISTINCT up.user_id, 'hr.resumo.compensation.view', true
FROM public.user_permissions up
WHERE up.permission_key = 'hr.resumo' AND up.granted = true
ON CONFLICT DO NOTHING;

-- 2) salary_snapshots SELECT: admin OR own OR has hr.colaborador.compensation.view OR has hr.resumo.compensation.view
DROP POLICY IF EXISTS "Admins read snapshots" ON public.salary_snapshots;
DROP POLICY IF EXISTS "Collaborators read own snapshots" ON public.salary_snapshots;
CREATE POLICY "Read salary snapshots"
ON public.salary_snapshots FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR collaborator_id = public.get_my_collaborator_id()
  OR public.has_permission(auth.uid(), 'hr.colaborador.compensation.view')
  OR public.has_permission(auth.uid(), 'hr.resumo.compensation.view')
);

-- 3) bo_settings SELECT: admin OR has any HR compensation/config permission
DROP POLICY IF EXISTS "Admins read bo_settings" ON public.bo_settings;
CREATE POLICY "Read bo_settings"
ON public.bo_settings FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_permission(auth.uid(), 'hr.colaborador.compensation.view')
  OR public.has_permission(auth.uid(), 'hr.resumo.compensation.view')
  OR public.has_permission(auth.uid(), 'hr.valor-bo')
  OR public.has_permission(auth.uid(), 'hr.dias-uteis')
);

-- 4) collaborators SELECT: keep admin + own + benefit approvers; add hr.colaborador.view
DROP POLICY IF EXISTS "Admins or own read collaborators" ON public.collaborators;
CREATE POLICY "Read collaborators"
ON public.collaborators FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR id = public.get_my_collaborator_id()
  OR public.has_permission(auth.uid(), 'hr.colaborador.view')
  OR public.has_permission(auth.uid(), 'hr.colaboradores')
);