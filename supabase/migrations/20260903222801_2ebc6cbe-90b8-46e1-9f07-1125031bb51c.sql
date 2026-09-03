CREATE TABLE public.remote_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  data date NOT NULL,
  estado text NOT NULL DEFAULT 'pendente',
  notas text,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remote_work_requests_estado_check CHECK (estado IN ('pendente','aprovada','rejeitada')),
  CONSTRAINT remote_work_requests_unique_day UNIQUE (collaborator_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_work_requests TO authenticated;
GRANT ALL ON public.remote_work_requests TO service_role;

ALTER TABLE public.remote_work_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved visible to all; own + approvers see all"
  ON public.remote_work_requests FOR SELECT
  TO authenticated
  USING (
    estado = 'aprovada'
    OR collaborator_id = public.get_my_collaborator_id()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_module_permission(auth.uid(), 'hr.leave.approve', 'all')
  );

CREATE POLICY "Users create own remote requests"
  ON public.remote_work_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    collaborator_id = public.get_my_collaborator_id()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins update; users update own pending"
  ON public.remote_work_requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_module_permission(auth.uid(), 'hr.leave.approve', 'all')
    OR (collaborator_id = public.get_my_collaborator_id() AND estado = 'pendente')
  );

CREATE POLICY "Admins delete; users delete own pending"
  ON public.remote_work_requests FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (collaborator_id = public.get_my_collaborator_id() AND estado = 'pendente')
  );

CREATE TRIGGER remote_work_requests_updated_at
  BEFORE UPDATE ON public.remote_work_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX remote_work_requests_data_idx ON public.remote_work_requests (data);
