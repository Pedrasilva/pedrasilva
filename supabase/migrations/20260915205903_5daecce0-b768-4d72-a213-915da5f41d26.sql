-- 1. Inventory access list
CREATE TABLE public.inventory_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_managers TO authenticated;
GRANT ALL ON public.inventory_managers TO service_role;

ALTER TABLE public.inventory_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read inventory managers"
  ON public.inventory_managers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage inventory managers"
  ON public.inventory_managers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.can_manage_inventory(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.inventory_managers m WHERE m.user_id = _user_id)
  )
$$;

COMMENT ON TABLE public.inventory_managers IS 'Staff allowed to create/edit inventory records. Admins always allowed.';

-- 2. Scope inventory write policies to inventory managers (reads stay open)
DROP POLICY IF EXISTS inv_assets_insert ON public.inventory_assets;
CREATE POLICY inv_assets_insert ON public.inventory_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_assets_update ON public.inventory_assets;
CREATE POLICY inv_assets_update ON public.inventory_assets FOR UPDATE TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS inv_assign_write ON public.inventory_assignments;
CREATE POLICY inv_assign_write ON public.inventory_assignments FOR ALL TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS inv_categories_write ON public.inventory_categories;
CREATE POLICY inv_categories_write ON public.inventory_categories FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_inventory(auth.uid()));
DROP POLICY IF EXISTS inv_categories_update ON public.inventory_categories;
CREATE POLICY inv_categories_update ON public.inventory_categories FOR UPDATE TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS inv_kits_write ON public.inventory_kits;
CREATE POLICY inv_kits_write ON public.inventory_kits FOR ALL TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS inv_docs_write ON public.inventory_asset_documents;
CREATE POLICY inv_docs_write ON public.inventory_asset_documents FOR ALL TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS inv_events_insert ON public.inventory_asset_events;
CREATE POLICY inv_events_insert ON public.inventory_asset_events FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can manage inventory line skips" ON public.inventory_line_skips;
CREATE POLICY "Inventory managers manage line skips" ON public.inventory_line_skips FOR ALL TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

-- 3. Seed the access list with existing admins so current work is uninterrupted
INSERT INTO public.inventory_managers (user_id, note)
SELECT ur.user_id, 'seeded: existing admin'
FROM public.user_roles ur
WHERE ur.role = 'admin'::app_role
ON CONFLICT (user_id) DO NOTHING;

-- 4. Remote work request policies: scope to authenticated role
DROP POLICY IF EXISTS "Approved visible to all; own + approvers see all" ON public.remote_work_requests;
CREATE POLICY "Approved visible to all; own + approvers see all"
  ON public.remote_work_requests FOR SELECT TO authenticated
  USING (
    (estado = ANY (ARRAY['aprovada'::text, 'declarada'::text]))
    OR (collaborator_id = get_my_collaborator_id())
    OR remote_work_can_approve(auth.uid(), collaborator_id)
  );

DROP POLICY IF EXISTS "Approvers decide; users cancel own" ON public.remote_work_requests;
CREATE POLICY "Approvers decide; users cancel own"
  ON public.remote_work_requests FOR UPDATE TO authenticated
  USING (
    remote_work_can_approve(auth.uid(), collaborator_id)
    OR ((collaborator_id = get_my_collaborator_id()) AND (estado = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'declarada'::text])))
  )
  WITH CHECK (
    remote_work_can_approve(auth.uid(), collaborator_id)
    OR ((collaborator_id = get_my_collaborator_id()) AND (estado = ANY (ARRAY['pendente'::text, 'declarada'::text, 'cancelada'::text])))
  );