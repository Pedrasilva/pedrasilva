CREATE TABLE public.pm_invoice_readiness (
 payment_item_id uuid PRIMARY KEY REFERENCES public.pm_payment_schedule_items(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
 confirmed_at timestamptz, confirmed_by uuid, note text,
 confirmed_invoice_date date, confirmed_payment_date date, confirmed_amount numeric,
 invoice_number text, issue_date date, issued_at timestamptz, issued_by uuid
);
GRANT SELECT ON public.pm_invoice_readiness TO authenticated;
GRANT ALL ON public.pm_invoice_readiness TO service_role;
REVOKE TRUNCATE ON public.pm_invoice_readiness FROM anon,authenticated;
ALTER TABLE public.pm_invoice_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY readiness_read ON public.pm_invoice_readiness FOR SELECT TO authenticated USING (public.pm_can_read_incoming_dates(project_id));
CREATE TABLE public.pm_invoice_workflow_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
 payment_item_id uuid NOT NULL REFERENCES public.pm_payment_schedule_items(id) ON DELETE CASCADE,
 actor uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), action text NOT NULL, before_values jsonb NOT NULL, after_values jsonb NOT NULL
);
GRANT SELECT ON public.pm_invoice_workflow_audit TO authenticated;
GRANT ALL ON public.pm_invoice_workflow_audit TO service_role;
REVOKE TRUNCATE ON public.pm_invoice_workflow_audit FROM anon,authenticated;
ALTER TABLE public.pm_invoice_workflow_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_audit_read ON public.pm_invoice_workflow_audit FOR SELECT TO authenticated USING (public.pm_can_read_incoming_dates(project_id));
CREATE TRIGGER workflow_audit_immutable BEFORE UPDATE OR DELETE ON public.pm_invoice_workflow_audit FOR EACH ROW EXECUTE FUNCTION public.pm_payment_date_audit_immutable();
CREATE OR REPLACE FUNCTION public.fin_invoice_queue_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR (public.is_psa_staff() AND public.has_permission(auth.uid(),'finance.dashboard'))) AND public.current_finance_entity()='00000000-0000-4000-a000-000000000001'::uuid AND public.fin_row_visible('00000000-0000-4000-a000-000000000001'::uuid)
$$;
CREATE OR REPLACE FUNCTION public.pm_confirm_ready_to_invoice(_item uuid,_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.pm_payment_schedule_items; v jsonb; b jsonb; a jsonb;
BEGIN
 SELECT * INTO r FROM public.pm_payment_schedule_items WHERE id=_item FOR UPDATE;
 IF NOT FOUND OR r.direction<>'inflow' OR NOT public.can_edit_project_payment_dates(r.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF r.billing_status::text IN ('issued','paid','cancelled') OR r.dates_frozen_at IS NOT NULL THEN RAISE EXCEPTION 'Issued or paid payment dates are frozen'; END IF;
 IF length(coalesce(_note,''))>2000 THEN RAISE EXCEPTION 'Invalid confirmation note'; END IF;
 v:=public.pm_project_incoming_timing(r.project_id); SELECT value INTO v FROM jsonb_array_elements(v->'rows') WHERE value->>'id'=_item::text;
 IF v->>'planned_invoice_date' IS NULL THEN RAISE EXCEPTION 'Invoice date required'; END IF;
 SELECT to_jsonb(w) INTO b FROM public.pm_invoice_readiness w WHERE payment_item_id=_item;
 INSERT INTO public.pm_invoice_readiness(payment_item_id,project_id,confirmed_at,confirmed_by,note,confirmed_invoice_date,confirmed_payment_date,confirmed_amount)
 VALUES(_item,r.project_id,now(),auth.uid(),nullif(trim(_note),''),(v->>'planned_invoice_date')::date,(v->>'planned_payment_date')::date,(v->>'amount_value')::numeric)
 ON CONFLICT(payment_item_id) DO UPDATE SET confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by,note=excluded.note,confirmed_invoice_date=excluded.confirmed_invoice_date,confirmed_payment_date=excluded.confirmed_payment_date,confirmed_amount=excluded.confirmed_amount RETURNING to_jsonb(pm_invoice_readiness.*) INTO a;
 INSERT INTO public.pm_invoice_workflow_audit(project_id,payment_item_id,actor,action,before_values,after_values) VALUES(r.project_id,_item,auth.uid(),'confirm',coalesce(b,'{}'),a);
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.fin_mark_incoming_issued(_item uuid,_number text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.pm_payment_schedule_items; v jsonb; b jsonb; a jsonb; w public.pm_invoice_readiness;
BEGIN
 SELECT * INTO r FROM public.pm_payment_schedule_items WHERE id=_item FOR UPDATE;
 IF NOT FOUND OR NOT public.fin_invoice_queue_access() OR NOT public.pm_payment_finance_access(r.project_id) OR NOT public.pm_can_read_incoming_dates(r.project_id) OR r.direction<>'inflow' OR r.entity_id<>'00000000-0000-4000-a000-000000000001'::uuid THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF nullif(trim(_number),'') IS NULL OR length(_number)>100 OR _date IS NULL OR _date<DATE '2010-01-01' OR _date>(now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION 'Invalid invoice number or issue date'; END IF;
 SELECT * INTO w FROM public.pm_invoice_readiness WHERE payment_item_id=_item;
 IF r.billing_status::text='issued' AND w.invoice_number=trim(_number) AND w.issue_date=_date THEN RETURN to_jsonb(w); END IF;
 IF r.billing_status::text IN ('issued','paid','cancelled') OR r.dates_frozen_at IS NOT NULL THEN RAISE EXCEPTION 'Issued or paid payment dates are frozen'; END IF;
 v:=public.pm_project_incoming_timing(r.project_id); SELECT value INTO v FROM jsonb_array_elements(v->'rows') WHERE value->>'id'=_item::text;
 IF w.confirmed_at IS NULL OR w.confirmed_invoice_date IS DISTINCT FROM (v->>'planned_invoice_date')::date OR w.confirmed_payment_date IS DISTINCT FROM (v->>'planned_payment_date')::date OR w.confirmed_amount IS DISTINCT FROM (v->>'amount_value')::numeric THEN RAISE EXCEPTION 'Current PM confirmation required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('incoming-invoice:'||lower(trim(_number)),0));
 IF EXISTS(SELECT 1 FROM public.pm_invoice_readiness WHERE lower(invoice_number)=lower(trim(_number)) AND payment_item_id<>_item) THEN RAISE EXCEPTION 'Invoice number already recorded'; END IF;
 b:=to_jsonb(w);
 UPDATE public.pm_payment_schedule_items SET billing_status='issued' WHERE id=_item;
 UPDATE public.pm_invoice_readiness SET invoice_number=trim(_number),issue_date=_date,issued_at=now(),issued_by=auth.uid() WHERE payment_item_id=_item RETURNING to_jsonb(pm_invoice_readiness.*) INTO a;
 INSERT INTO public.pm_invoice_workflow_audit(project_id,payment_item_id,actor,action,before_values,after_values) VALUES(r.project_id,_item,auth.uid(),'issue',b,a||jsonb_build_object('frozenInvoiceDate',v->'planned_invoice_date','frozenPaymentDate',v->'planned_payment_date'));
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.pm_project_incoming_timing(_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb;
BEGIN
 IF NOT public.pm_can_read_incoming_dates(_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(j.value||jsonb_build_object('workflow',jsonb_build_object('confirmed_at',w.confirmed_at,'confirmed_by',w.confirmed_by,'note',w.note,'invoice_number',w.invoice_number,'issue_date',w.issue_date,'confirmation_current',w.confirmed_at IS NOT NULL AND w.confirmed_invoice_date IS NOT DISTINCT FROM (j.value->>'planned_invoice_date')::date AND w.confirmed_payment_date IS NOT DISTINCT FROM (j.value->>'planned_payment_date')::date AND w.confirmed_amount IS NOT DISTINCT FROM (j.value->>'amount_value')::numeric)) ORDER BY i.sort_order,i.id),'[]') INTO v_rows FROM public.pm_payment_schedule_items i CROSS JOIN LATERAL (SELECT public.pm_incoming_resolve(i.id) AS value) j LEFT JOIN public.pm_invoice_readiness w ON w.payment_item_id=i.id WHERE i.project_id=_project AND i.direction='inflow';
 RETURN jsonb_build_object('rows',v_rows,'can_edit_dates',public.can_edit_project_payment_dates(_project),'stages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'source_quote_stage_id',source_quote_stage_id) ORDER BY sort_order,id),'[]') FROM public.pm_stages WHERE project_id=_project));
END $$;
CREATE OR REPLACE FUNCTION public.fin_invoices_to_issue() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; v jsonb; r jsonb; all_rows jsonb:='[]'; moves integer;
BEGIN
 IF NOT public.fin_invoice_queue_access() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 FOR p IN SELECT x.id,x.name,c.name AS client_name FROM public.pm_projects x LEFT JOIN public.companies c ON c.id=x.company_id WHERE public.pm_can_read_incoming_dates(x.id) AND public.pm_payment_finance_access(x.id) ORDER BY x.name,x.id LOOP
 v:=public.pm_project_incoming_timing(p.id);
 FOR r IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
 SELECT count(*)::integer INTO moves FROM public.pm_payment_date_audit a WHERE a.payment_item_id=(r->>'id')::uuid AND a.changed_at >= (date_trunc('week',now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AND EXISTS(SELECT 1 FROM public.pm_project_team t JOIN public.pm_resources rs ON rs.id=t.resource_id JOIN auth.users u ON lower(u.email)=lower(rs.email) WHERE t.project_id=p.id AND t.role='manager' AND u.id=a.actor) AND NOT (public.has_role(a.actor,'admin') OR public.has_permission(a.actor,'finance.dashboard')) AND (a.before_values->'planned_invoice_date_override',a.before_values->'planned_payment_date_override',a.before_values->'appointment_date',a.before_values->'trigger_type',a.before_values->'stage_id',a.before_values->'timing_month_index') IS DISTINCT FROM (a.after_values->'planned_invoice_date_override',a.after_values->'planned_payment_date_override',a.after_values->'appointment_date',a.after_values->'trigger_type',a.after_values->'stage_id',a.after_values->'timing_month_index');
 all_rows:=all_rows||jsonb_build_array(r||jsonb_build_object('project_name',p.name,'client_name',p.client_name,'pm_date_moves',moves));
 END LOOP; END LOOP;
 RETURN jsonb_build_object('rows',all_rows,'today',(now() AT TIME ZONE 'Europe/Lisbon')::date,'can_issue',true);
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_queue_access(),public.pm_confirm_ready_to_invoice(uuid,text),public.fin_mark_incoming_issued(uuid,text,date),public.fin_invoices_to_issue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_invoice_queue_access(),public.pm_confirm_ready_to_invoice(uuid,text),public.fin_mark_incoming_issued(uuid,text,date),public.fin_invoices_to_issue() TO authenticated,service_role;