REVOKE ALL ON public.pm_invoice_readiness,public.pm_invoice_workflow_audit FROM anon,authenticated;
GRANT SELECT ON public.pm_invoice_readiness,public.pm_invoice_workflow_audit TO authenticated;
REVOKE TRUNCATE ON public.pm_invoice_readiness,public.pm_invoice_workflow_audit FROM anon,authenticated;
ALTER TABLE public.pm_payment_date_audit ADD COLUMN actor_was_project_manager boolean;
CREATE OR REPLACE FUNCTION public.pm_payment_date_actor_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.actor_was_project_manager:=EXISTS(SELECT 1 FROM public.pm_project_team t JOIN public.pm_resources rs ON rs.id=t.resource_id JOIN auth.users u ON u.id=NEW.actor WHERE t.project_id=NEW.project_id AND t.role='manager' AND (lower(u.email)=lower(rs.email) OR rs.collaborator_id IN(SELECT c.id FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL)));
 RETURN NEW;
END $$;
CREATE TRIGGER payment_date_actor_role BEFORE INSERT ON public.pm_payment_date_audit FOR EACH ROW EXECUTE FUNCTION public.pm_payment_date_actor_role();
REVOKE ALL ON FUNCTION public.pm_payment_date_actor_role() FROM PUBLIC,anon,authenticated;
DO $patch$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.fin_invoices_to_issue()'::regprocedure);
 s:=replace(s,'AND EXISTS(SELECT 1 FROM public.pm_project_team t JOIN public.pm_resources rs ON rs.id=t.resource_id JOIN auth.users u ON lower(u.email)=lower(rs.email) WHERE t.project_id=p.id AND t.role=''manager'' AND u.id=a.actor) AND NOT (public.has_role(a.actor,''admin'') OR public.has_permission(a.actor,''finance.dashboard''))','AND (a.actor_was_project_manager IS TRUE OR (a.actor_was_project_manager IS NULL AND EXISTS(SELECT 1 FROM public.pm_project_team t JOIN public.pm_resources rs ON rs.id=t.resource_id JOIN auth.users u ON u.id=a.actor WHERE t.project_id=p.id AND t.role=''manager'' AND (lower(u.email)=lower(rs.email) OR rs.collaborator_id IN(SELECT c.id FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL)))))');
 EXECUTE s;
END $patch$;