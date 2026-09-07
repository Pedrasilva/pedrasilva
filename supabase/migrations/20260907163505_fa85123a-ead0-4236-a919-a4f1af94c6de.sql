CREATE POLICY "Approved leave visible to the whole team"
ON public.vacation_requests
FOR SELECT
TO authenticated
USING (estado = 'aprovada');