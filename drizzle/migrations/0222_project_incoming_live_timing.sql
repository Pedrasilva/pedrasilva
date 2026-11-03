ALTER TABLE public.pm_payment_schedule_items
 ADD COLUMN timing_month_index integer,
 ADD COLUMN appointment_date date,
 ADD COLUMN timing_evidence jsonb,
 ADD COLUMN contract_baseline_payment_id uuid REFERENCES public.pm_project_contract_baseline_payments(id),
 ADD COLUMN planned_invoice_date_override date,
 ADD COLUMN planned_payment_date_override date,
 ADD COLUMN date_override_by uuid,
 ADD COLUMN date_override_at timestamptz,
 ADD COLUMN frozen_invoice_date date,
 ADD COLUMN frozen_payment_date date,
 ADD COLUMN dates_frozen_at timestamptz,
 ADD COLUMN dates_frozen_document_id uuid;
CREATE TABLE public.pm_payment_date_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
 payment_item_id uuid NOT NULL REFERENCES public.pm_payment_schedule_items(id) ON DELETE CASCADE,
 actor uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL,
 before_values jsonb NOT NULL, after_values jsonb NOT NULL
);
GRANT SELECT ON public.pm_payment_date_audit TO authenticated;
GRANT ALL ON public.pm_payment_date_audit TO service_role;
REVOKE TRUNCATE ON public.pm_payment_date_audit FROM anon, authenticated;
ALTER TABLE public.pm_payment_date_audit ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.pm_payment_finance_access(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR
 (public.is_psa_staff() AND public.has_permission(auth.uid(),'finance.dashboard') AND
 public.fin_row_visible('00000000-0000-4000-a000-000000000001'::uuid)))
 AND EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project)
$$;
CREATE OR REPLACE FUNCTION public.pm_unique_viewer_resource()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN count(*)=1 THEN (array_agg(r.id))[1] ELSE NULL END
 FROM public.pm_resources r JOIN auth.users u ON u.id=auth.uid()
 WHERE lower(r.email)=lower(u.email) OR r.collaborator_id IN
 (SELECT c.id FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL)
$$;
CREATE OR REPLACE FUNCTION public.can_edit_project_payment_dates(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.pm_payment_finance_access(_project) OR
 (auth.uid() IS NOT NULL AND public.is_psa_staff() AND EXISTS(
 SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND role='manager'
 AND resource_id=public.pm_unique_viewer_resource()))
$$;
CREATE OR REPLACE FUNCTION public.pm_can_read_incoming_dates(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.can_edit_project_payment_dates(_project) OR
 (public.is_psa_staff() AND (public.has_module_permission(auth.uid(),'projects.view_financials','all') OR
 (public.has_module_permission(auth.uid(),'projects.view_financials','assigned') AND public.pm_has_assigned_access(auth.uid(),_project)))))
 AND EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project)
$$;
CREATE POLICY payment_date_audit_read ON public.pm_payment_date_audit FOR SELECT TO authenticated USING(public.pm_can_read_incoming_dates(project_id));
CREATE OR REPLACE FUNCTION public.pm_payment_date_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.pm_projects WHERE id=OLD.project_id) THEN
 RAISE EXCEPTION 'Payment date audit is append-only' USING ERRCODE='42501'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER payment_date_audit_immutable BEFORE UPDATE OR DELETE ON public.pm_payment_date_audit FOR EACH ROW EXECUTE FUNCTION public.pm_payment_date_audit_immutable();
CREATE OR REPLACE FUNCTION public.pm_incoming_resolve(_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_row public.pm_payment_schedule_items; v_stage public.pm_stages; v_project public.pm_projects;
 v_snap jsonb; v_src jsonb; v_source_stage jsonb; v_contract public.pm_project_contract_baseline_payments;
 v_baseline uuid; v_count integer; v_month integer; v_invoice date; v_payment date; v_contract_invoice date; v_contract_payment date;
 v_slip integer; v_problem text[]:=ARRAY[]::text[]; v_evidence jsonb:='{}'; v_frozen boolean;
BEGIN
 SELECT * INTO v_row FROM public.pm_payment_schedule_items WHERE id=_item;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_project FROM public.pm_projects WHERE id=v_row.project_id;
 SELECT * INTO v_stage FROM public.pm_stages WHERE id=v_row.stage_id AND project_id=v_row.project_id;
 SELECT s.snapshot->'quote_data'->'raw' INTO v_snap FROM public.fee_proposals q
 JOIN public.psa_proposal_snapshots s ON s.id=q.accepted_snapshot_id WHERE q.id=v_project.quote_id AND q.pm_project_id=v_project.id;
 SELECT value INTO v_src FROM jsonb_array_elements(coalesce(v_snap->'quote_payment_schedule_items','[]'))
 WHERE value->>'id'=v_row.source_quote_payment_item_id::text;
 SELECT value INTO v_source_stage FROM jsonb_array_elements(coalesce(v_snap->'quote_stages','[]')) WHERE value->>'id'=v_src->>'stage_id';
 IF v_src IS NOT NULL THEN
 v_evidence:=jsonb_build_object('sourcePayment',v_src->>'id','sourceStage',v_src->>'stage_id','acceptedSnapshot',true);
 END IF;
 IF v_row.contract_baseline_payment_id IS NOT NULL THEN
 SELECT b.* INTO v_contract FROM public.pm_project_contract_baseline_payments b JOIN public.pm_project_contract_baseline h ON h.id=b.baseline_id
 WHERE b.id=v_row.contract_baseline_payment_id AND h.project_id=v_row.project_id AND v_row.timing_evidence IS NOT NULL;
 ELSE
 SELECT count(*), (array_agg(b.id))[1] INTO v_count,v_baseline
 FROM public.pm_project_contract_baseline_payments b JOIN public.pm_project_contract_baseline h ON h.id=b.baseline_id
 WHERE h.project_id=v_row.project_id AND h.quote_id=v_project.quote_id AND v_src IS NOT NULL
 AND b.label=v_src->>'label' AND b.trigger_type::text=v_src->>'trigger_type'
 AND b.amount=(v_src->>'amount_value')::numeric AND b.sort_order=(v_src->>'sort_order')::integer
 AND b.stage_name IS NOT DISTINCT FROM v_source_stage->>'name'
 AND v_src->>'amount_type'='fixed';
 IF v_count=1 THEN SELECT * INTO v_contract FROM public.pm_project_contract_baseline_payments WHERE id=v_baseline;
 ELSE v_problem:=array_append(v_problem,'contractUnproven'); END IF;
 END IF;
 v_contract_invoice:=v_contract.expected_invoice_date; v_contract_payment:=v_contract.expected_payment_date;
 IF v_contract_invoice < DATE '2010-01-01' THEN v_contract_invoice:=NULL; END IF;
 IF v_contract_payment < DATE '2010-01-01' THEN v_contract_payment:=NULL; END IF;
 IF v_row.trigger_type::text='project_start' THEN
 v_invoice:=coalesce(v_row.appointment_date,CASE WHEN v_contract.id IS NOT NULL THEN v_contract.expected_invoice_date END);
 IF v_invoice IS NULL THEN v_problem:=array_append(v_problem,'appointmentUnproven'); END IF;
 ELSIF v_row.trigger_type::text='manual_date' THEN v_invoice:=v_row.expected_invoice_date;
 ELSIF v_row.trigger_type::text IN ('stage_start','stage_end','monthly') THEN
 IF v_stage.id IS NULL OR (v_src IS NOT NULL AND v_row.timing_evidence IS NULL AND v_stage.source_quote_stage_id::text IS DISTINCT FROM v_src->>'stage_id') THEN
 v_problem:=array_append(v_problem,'stageUnmapped');
 ELSIF v_row.trigger_type::text='stage_end' THEN v_invoice:=v_stage.end_date;
 ELSIF v_row.trigger_type::text='stage_start' THEN v_invoice:=v_stage.start_date;
 ELSE
 v_month:=v_row.timing_month_index;
 IF v_month IS NULL AND v_src IS NOT NULL THEN
 SELECT count(*)::integer INTO v_month FROM jsonb_array_elements(coalesce(v_snap->'quote_payment_schedule_items','[]')) x
 WHERE x->>'stage_id'=v_src->>'stage_id' AND x->>'trigger_type'='monthly' AND coalesce(x->>'direction','inflow')=coalesce(v_src->>'direction','inflow')
 AND ((x->>'sort_order')::integer,x->>'id')<((v_src->>'sort_order')::integer,v_src->>'id');
 END IF;
 IF v_month IS NULL OR v_stage.start_date IS NULL THEN v_problem:=array_append(v_problem,'monthUnproven');
 ELSE v_invoice:=public.pm_calendar_shift((date_trunc('month',v_stage.start_date)+make_interval(months=>v_month))::date,0); END IF;
 END IF;
 END IF;
 IF v_invoice < DATE '2010-01-01' THEN v_invoice:=NULL; v_problem:=array_append(v_problem,'placeholderDate'); END IF;
 v_frozen:=v_row.dates_frozen_at IS NOT NULL OR v_row.billing_status::text IN ('issued','paid','cancelled');
 IF v_frozen THEN
 v_invoice:=CASE WHEN v_row.dates_frozen_at IS NOT NULL THEN v_row.frozen_invoice_date ELSE v_row.expected_invoice_date END;
 v_payment:=CASE WHEN v_row.dates_frozen_at IS NOT NULL THEN v_row.frozen_payment_date ELSE v_row.expected_payment_date END;
 ELSE
 v_invoice:=coalesce(v_row.planned_invoice_date_override,v_invoice);
 v_payment:=coalesce(v_row.planned_payment_date_override,v_invoice+coalesce(v_row.payment_offset_days,0));
 END IF;
 IF v_invoice IS NULL THEN v_problem:=array_append(v_problem,'dateUndefined'); END IF;
 IF v_invoice IS NOT NULL AND (extract(isodow FROM v_invoice)>5 OR EXISTS(SELECT 1 FROM public.holidays WHERE data=v_invoice)) THEN v_problem:=array_append(v_problem,'nonWorkingDate'); END IF;
 IF v_invoice IS NOT NULL AND v_contract_invoice IS NOT NULL THEN
 SELECT count(*)::integer * CASE WHEN v_invoice>=v_contract_invoice THEN 1 ELSE -1 END INTO v_slip
 FROM generate_series(least(v_invoice,v_contract_invoice)+1,greatest(v_invoice,v_contract_invoice),interval '1 day') d
 WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM public.holidays WHERE data=d::date);
 END IF;
 RETURN to_jsonb(v_row)||jsonb_build_object('stage_name',v_stage.name,'planned_invoice_date',v_invoice,'planned_payment_date',v_payment,
 'contract_invoice_date',v_contract_invoice,'contract_payment_date',v_contract_payment,'slippage_working_days',v_slip,
 'slippage_calendar_days',v_invoice-v_contract_invoice,'resolved_month_index',v_month,'resolved_contract_payment_id',v_contract.id,
 'frozen',v_frozen,'problems',to_jsonb(v_problem),'resolved_evidence',v_evidence);
END $$;
REVOKE ALL ON FUNCTION public.pm_incoming_resolve(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_incoming_resolve(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.pm_project_incoming_timing(_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb;
BEGIN
 IF NOT public.pm_can_read_incoming_dates(_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(public.pm_incoming_resolve(i.id) ORDER BY i.sort_order,i.id),'[]') INTO v_rows
 FROM public.pm_payment_schedule_items i WHERE i.project_id=_project AND i.direction='inflow';
 RETURN jsonb_build_object('rows',v_rows,'can_edit_dates',public.can_edit_project_payment_dates(_project),
 'stages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'source_quote_stage_id',source_quote_stage_id) ORDER BY sort_order,id),'[]') FROM public.pm_stages WHERE project_id=_project));
END $$;
CREATE OR REPLACE FUNCTION public.pm_change_payment_dates(_item uuid,_patch jsonb,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.pm_payment_schedule_items; v_before jsonb; v_after jsonb; v_stage uuid;
BEGIN
 SELECT * INTO v_row FROM public.pm_payment_schedule_items WHERE id=_item FOR UPDATE;
 IF NOT FOUND OR NOT public.can_edit_project_payment_dates(v_row.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF v_row.dates_frozen_at IS NOT NULL OR v_row.billing_status::text IN ('issued','paid','cancelled') THEN RAISE EXCEPTION 'Issued or paid payment dates are frozen'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('planned_invoice_date_override','planned_payment_date_override','trigger_type','stage_id','timing_month_index','appointment_date')) THEN RAISE EXCEPTION 'Only payment dates and stage links may be edited' USING ERRCODE='42501'; END IF;
 IF _patch ? 'stage_id' THEN
 v_stage:=(_patch->>'stage_id')::uuid;
 IF v_stage IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pm_stages WHERE id=v_stage AND project_id=v_row.project_id) THEN RAISE EXCEPTION 'Stage belongs to another project'; END IF;
 ELSE v_stage:=v_row.stage_id; END IF;
 IF _patch ? 'timing_month_index' AND (_patch->>'timing_month_index')::integer NOT BETWEEN 0 AND 1199 THEN RAISE EXCEPTION 'Invalid construction month'; END IF;
 v_before:=to_jsonb(v_row);
 PERFORM set_config('pm.payment_date_action','yes',true);
 UPDATE public.pm_payment_schedule_items SET
 planned_invoice_date_override=CASE WHEN _patch ? 'planned_invoice_date_override' THEN (_patch->>'planned_invoice_date_override')::date ELSE planned_invoice_date_override END,
 planned_payment_date_override=CASE WHEN _patch ? 'planned_payment_date_override' THEN (_patch->>'planned_payment_date_override')::date ELSE planned_payment_date_override END,
 trigger_type=CASE WHEN _patch ? 'trigger_type' THEN (_patch->>'trigger_type')::public.quote_payment_trigger ELSE trigger_type END,
 stage_id=v_stage,
 timing_month_index=CASE WHEN _patch ? 'timing_month_index' THEN (_patch->>'timing_month_index')::integer ELSE timing_month_index END,
 appointment_date=CASE WHEN _patch ? 'appointment_date' THEN (_patch->>'appointment_date')::date ELSE appointment_date END,
 timing_evidence=coalesce(timing_evidence,'{}')||jsonb_build_object('dateAction',true,'actor',auth.uid()),
 date_override_by=auth.uid(),date_override_at=now()
 WHERE id=_item RETURNING to_jsonb(pm_payment_schedule_items.*) INTO v_after;
 PERFORM set_config('pm.payment_date_action','',true);
 INSERT INTO public.pm_payment_date_audit(project_id,payment_item_id,actor,reason,before_values,after_values) VALUES(v_row.project_id,_item,auth.uid(),_reason,v_before,v_after);
 RETURN public.pm_incoming_resolve(_item);
END $$;
REVOKE ALL ON FUNCTION public.pm_payment_finance_access(uuid),public.pm_unique_viewer_resource(),public.can_edit_project_payment_dates(uuid),public.pm_can_read_incoming_dates(uuid),public.pm_project_incoming_timing(uuid),public.pm_change_payment_dates(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_payment_finance_access(uuid),public.pm_unique_viewer_resource(),public.can_edit_project_payment_dates(uuid),public.pm_can_read_incoming_dates(uuid),public.pm_project_incoming_timing(uuid),public.pm_change_payment_dates(uuid,jsonb,text) TO authenticated,service_role;