-- Permite ao colaborador autenticado ler as suas próprias fichas salariais
CREATE POLICY "Collaborators read own snapshots"
ON public.salary_snapshots
FOR SELECT
TO authenticated
USING (collaborator_id = public.get_my_collaborator_id());