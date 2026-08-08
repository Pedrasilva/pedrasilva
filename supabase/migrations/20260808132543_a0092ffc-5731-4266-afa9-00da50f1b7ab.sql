DROP POLICY IF EXISTS email_events_auth_read ON public.email_events;
DROP POLICY IF EXISTS email_events_auth_update ON public.email_events;
DROP POLICY IF EXISTS email_events_auth_write ON public.email_events;

CREATE POLICY email_events_admin_read ON public.email_events FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY email_events_admin_update ON public.email_events FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY email_events_admin_insert ON public.email_events FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));