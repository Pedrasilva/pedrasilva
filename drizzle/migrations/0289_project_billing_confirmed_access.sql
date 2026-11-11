CREATE TABLE public.pm_billing_fiscal_actors(user_id uuid PRIMARY KEY, granted_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL);
GRANT SELECT ON public.pm_billing_fiscal_actors TO authenticated;
GRANT ALL ON public.pm_billing_fiscal_actors TO service_role;
REVOKE TRUNCATE ON public.pm_billing_fiscal_actors FROM anon,authenticated;
ALTER TABLE public.pm_billing_fiscal_actors ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_fiscal_capability_read ON public.pm_billing_fiscal_actors FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.pm_billing_can_act_fiscal() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND EXISTS(SELECT 1 FROM public.pm_billing_fiscal_actors WHERE user_id=auth.uid()); $$;
REVOKE ALL ON FUNCTION public.pm_billing_can_act_fiscal() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_billing_can_act_fiscal() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.can_edit_project_payment_dates(_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.pm_can_edit_gantt(_project); $$;
DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.pm_billing_plan(uuid)'::regprocedure) INTO d;d:=replace(d,'public.fin_invoice_queue_access() AND public.pm_payment_finance_access(_project)','public.pm_billing_can_act_fiscal() AND public.fin_invoice_queue_access() AND public.pm_payment_finance_access(_project)');EXECUTE d;
SELECT pg_get_functiondef('public.fin_billing_plan_queue()'::regprocedure) INTO d;d:=replace(d,'''can_issue'',true','''can_issue'',public.pm_billing_can_act_fiscal()');EXECUTE d;
SELECT pg_get_functiondef('public.pm_billing_register_issued(uuid[],text,date)'::regprocedure) INTO d;d:=replace(d,'IF NOT public.fin_invoice_queue_access()','IF NOT public.pm_billing_can_act_fiscal() OR NOT public.fin_invoice_queue_access()');EXECUTE d;
SELECT pg_get_functiondef('public.fin_mark_incoming_issued(uuid,text,date)'::regprocedure) INTO d;d:=replace(d,'BEGIN','BEGIN IF NOT public.pm_billing_can_act_fiscal() THEN RAISE EXCEPTION ''Project fiscal access required'' USING ERRCODE=''42501''; END IF;');EXECUTE d;
END $$;
CREATE FUNCTION public.pm_billing_fiscal_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.financial_documents; j jsonb; BEGIN
IF auth.uid() IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
IF public.pm_billing_can_act_fiscal() THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
FOR j IN SELECT value FROM jsonb_array_elements(CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
IF TG_TABLE_NAME='financial_documents' THEN IF j->>'direction'='issued' AND j->>'status'<>'draft' AND j->>'project_id' IS NOT NULL THEN RAISE EXCEPTION 'Project fiscal access required' USING ERRCODE='42501';END IF;
ELSE SELECT * INTO d FROM public.financial_documents WHERE id=(j->>'document_id')::uuid;IF d.project_id IS NOT NULL AND d.direction='issued' AND (d.status<>'draft' OR TG_TABLE_NAME='financial_document_payments') THEN RAISE EXCEPTION 'Project fiscal access required' USING ERRCODE='42501';END IF;END IF;
END LOOP; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END $$;
CREATE TRIGGER pm_billing_fiscal_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.pm_billing_fiscal_write_guard();
CREATE TRIGGER pm_billing_fiscal_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_document_lines FOR EACH ROW EXECUTE FUNCTION public.pm_billing_fiscal_write_guard();
CREATE TRIGGER pm_billing_fiscal_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_document_payments FOR EACH ROW EXECUTE FUNCTION public.pm_billing_fiscal_write_guard();