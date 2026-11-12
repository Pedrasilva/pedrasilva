-- D50: no historical backfill, no data deletion, no B1 changes.
CREATE TABLE public.quote_contract_references (
 quote_id uuid PRIMARY KEY REFERENCES public.fee_proposals(id), captured_at timestamptz NOT NULL DEFAULT now(),
 boundary text NOT NULL, stages jsonb NOT NULL, total numeric, evidence_snapshot_id uuid
);
GRANT SELECT ON public.quote_contract_references TO authenticated;
GRANT ALL ON public.quote_contract_references TO service_role;
REVOKE ALL ON public.quote_contract_references FROM anon;
REVOKE TRUNCATE ON public.quote_contract_references FROM anon,authenticated;
ALTER TABLE public.quote_contract_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_contract_reference_read ON public.quote_contract_references FOR SELECT TO authenticated USING(public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline')));
CREATE TABLE public.quote_gantt_value_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL, stage_id uuid NOT NULL,
 actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), old_value numeric, new_value numeric NOT NULL, reason text NOT NULL
);
GRANT SELECT ON public.quote_gantt_value_history TO authenticated;
GRANT ALL ON public.quote_gantt_value_history TO service_role;
REVOKE ALL ON public.quote_gantt_value_history FROM anon;
REVOKE TRUNCATE ON public.quote_gantt_value_history FROM anon,authenticated;
ALTER TABLE public.quote_gantt_value_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_gantt_value_history_read ON public.quote_gantt_value_history FOR SELECT TO authenticated USING(public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline')));
CREATE TRIGGER quote_gantt_history_immutable BEFORE UPDATE OR DELETE ON public.quote_gantt_value_history FOR EACH ROW EXECUTE FUNCTION public.quote_retainer_history_immutable();
CREATE TRIGGER quote_contract_reference_immutable BEFORE UPDATE OR DELETE ON public.quote_contract_references FOR EACH ROW EXECUTE FUNCTION public.quote_retainer_history_immutable();
CREATE FUNCTION public.quote_has_contract(_quote uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT signed_at IS NOT NULL OR pm_project_id IS NOT NULL OR EXISTS(SELECT 1 FROM quote_contract_references r WHERE r.quote_id=q.id) FROM fee_proposals q WHERE q.id=_quote),true)
$$;
REVOKE ALL ON FUNCTION public.quote_has_contract(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_has_gantt_contract(_project uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p pm_projects; q fee_proposals;
BEGIN
 SELECT * INTO p FROM pm_projects WHERE id=_project;
 IF p.id IS NULL THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM pm_project_contract_baseline WHERE project_id=_project) OR EXISTS(SELECT 1 FROM pm_project_commercial_baselines WHERE project_id=_project) OR EXISTS(SELECT 1 FROM contracts WHERE source_project_id=_project AND signed_at IS NOT NULL) OR EXISTS(SELECT 1 FROM fee_proposals WHERE pm_project_id=_project) THEN RETURN true; END IF;
 SELECT * INTO q FROM fee_proposals WHERE id=p.quote_id;
 IF q.id IS NULL THEN RETURN true; END IF; -- legacy/direct projects fail closed
 RETURN public.quote_has_contract(q.id);
END $$;
REVOKE ALL ON FUNCTION public.pm_has_gantt_contract(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.quote_capture_contract_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb;
BEGIN
 IF (NEW.signed_at IS NOT NULL OR NEW.pm_project_id IS NOT NULL) AND OLD.signed_at IS NULL AND OLD.pm_project_id IS NULL THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'parentId',s.parent_stage_id,'kind',s.stage_kind,'budget',s.budget,'fee',public.pm_quote_stage_billing_fee(s.id),'monthly',s.retainer_monthly_amount,'months',s.retainer_months) ORDER BY s.sort_order,s.id),'[]') INTO rows FROM quote_stages s WHERE s.quote_id=NEW.id;
 INSERT INTO quote_contract_references(quote_id,boundary,stages,total,evidence_snapshot_id) VALUES(NEW.id,CASE WHEN NEW.signed_at IS NOT NULL THEN 'signature' ELSE 'conversion' END,rows,(public.pm_quote_conversion_totals(NEW.id)->>'total_fee')::numeric,NEW.accepted_snapshot_id) ON CONFLICT(quote_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.quote_capture_contract_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER quote_capture_contract_reference AFTER UPDATE OF signed_at,pm_project_id ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.quote_capture_contract_reference();
CREATE FUNCTION public.quote_commercial_state(_quote uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q fee_proposals; r quote_contract_references;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT(public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM fee_proposals WHERE id=_quote;
 IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
 SELECT * INTO r FROM quote_contract_references WHERE quote_id=_quote;
 RETURN jsonb_build_object('hasContract',public.quote_has_contract(_quote),'stages',coalesce(r.stages,'[]'),'contractedTotal',r.total,'referencePending',r.quote_id IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.quote_commercial_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_commercial_state(uuid) TO authenticated,service_role;
CREATE FUNCTION public.quote_gantt_change_value(_stage uuid,_expected numeric,_value numeric,_reason text DEFAULT '',_responsibility boolean DEFAULT false,_client_agreed boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s quote_stages; q fee_proposals; contracted boolean; previous text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT quote_id INTO q.id FROM quote_stages WHERE id=_stage;
 SELECT * INTO q FROM fee_proposals WHERE id=q.id FOR UPDATE;
 SELECT * INTO s FROM quote_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR q.id IS NULL OR q.is_locked OR q.locked_at IS NOT NULL OR q.pm_project_id IS NOT NULL OR q.locked_project_id IS NOT NULL THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
 contracted:=public.quote_has_contract(q.id);
 IF contracted AND (_responsibility IS DISTINCT FROM true OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 240 OR (s.stage_kind='retainer_monthly' AND _client_agreed IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'Responsibility confirmation and a short reason are required'; END IF;
 IF _value IS NULL OR _value<0 OR _value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF (CASE WHEN s.stage_kind='retainer_monthly' THEN s.retainer_monthly_amount ELSE s.budget END) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Value changed elsewhere; reload before confirming' USING ERRCODE='40001'; END IF;
 previous:=coalesce(current_setting('quote.retainer_value_action',true),'');
 PERFORM set_config('quote.retainer_value_action','yes',true);
 IF s.stage_kind='retainer_monthly' THEN
 UPDATE quote_stages SET retainer_monthly_amount=_value,manual_override=true WHERE id=_stage;
 IF contracted THEN INSERT INTO quote_retainer_value_history(quote_id,stage_id,actor,old_value,new_value,reason) VALUES(q.id,s.id,auth.uid(),_expected,_value,trim(_reason)); END IF;
 ELSE
 UPDATE quote_stages SET budget=_value,manual_override=true WHERE id=_stage;
 IF contracted THEN INSERT INTO quote_gantt_value_history(quote_id,stage_id,actor,old_value,new_value,reason) VALUES(q.id,s.id,auth.uid(),_expected,_value,trim(_reason)); END IF;
 END IF;
 PERFORM set_config('quote.retainer_value_action',previous,true);
END $$;
REVOKE ALL ON FUNCTION public.quote_gantt_change_value(uuid,numeric,numeric,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_gantt_change_value(uuid,numeric,numeric,text,boolean,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.quote_retainer_change_value(_stage uuid,_expected numeric,_value numeric,_reason text,_responsibility boolean,_client_agreed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM quote_stages WHERE id=_stage AND stage_kind='retainer_monthly') THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
 PERFORM public.quote_gantt_change_value(_stage,_expected,_value,_reason,_responsibility,_client_agreed);
END $$;
CREATE OR REPLACE FUNCTION public.quote_retainer_value_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN RAISE EXCEPTION 'Stage quote origin is immutable'; END IF;
 -- Serialize with the signature/conversion transaction before deciding the boundary.
 PERFORM 1 FROM fee_proposals WHERE id=NEW.quote_id FOR UPDATE;
 IF (NEW.retainer_monthly_amount,NEW.budget) IS DISTINCT FROM (OLD.retainer_monthly_amount,OLD.budget) AND public.quote_has_contract(NEW.quote_id) AND coalesce(current_setting('quote.retainer_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Confirm responsibility and give a reason before changing a value' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_gantt_budget_contract_guard BEFORE UPDATE OF budget,quote_id ON public.quote_stages FOR EACH ROW EXECUTE FUNCTION public.quote_retainer_value_guard();

CREATE OR REPLACE FUNCTION public.quote_calculator_preview(_quote_id uuid, _row_ids jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.fee_proposals;b jsonb;existing jsonb;manual jsonb;removed jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM public.fee_proposals WHERE id=_quote_id;IF NOT FOUND OR q.is_locked OR q.pm_project_id IS NOT NULL OR q.locked_project_id IS NOT NULL OR q.quote_status NOT IN ('draft','sent','approved') OR public.quote_has_contract(q.id) THEN RAISE EXCEPTION 'Calculator requires an editable unconverted draft';END IF;
 b:=public.quote_template_capture(_quote_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) ORDER BY sort_order),'[]') INTO existing FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NULL AND stage_role='architecture' AND stage_kind='regular' AND phase_group<>'construction' AND archived_at IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order,'value',budget,'previous',calculator_last_value) ORDER BY sort_order),'[]') INTO manual FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NOT NULL AND _row_ids ? calculator_row_id AND budget IS DISTINCT FROM calculator_last_value;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) ORDER BY sort_order),'[]') INTO removed FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NOT NULL AND NOT(_row_ids ? calculator_row_id);
 RETURN jsonb_build_object('revision',md5(b::text),'existing',existing,'manual',CASE WHEN public.quote_has_contract(q.id) THEN manual ELSE '[]'::jsonb END,'hasContract',public.quote_has_contract(q.id),'removed',removed,'paymentDefaults',(SELECT to_jsonb(d) FROM public.quote_planning_defaults d WHERE id));
END $function$
;

CREATE OR REPLACE FUNCTION public.quote_apply_calculator(_quote_id uuid, _inputs jsonb, _revision text, _existing_action text DEFAULT 'cancel'::text, _overwrite_manual boolean DEFAULT false, _delete_removed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.fee_proposals;b jsonb;preview jsonb;fee numeric;rows jsonb;row jsonb;keys jsonb;largest text;remainder numeric;sid uuid;previous_id uuid;next_date date;finish date;ordering int;value numeric;operation uuid;start_pct numeric;end_pct numeric;defaults public.quote_planning_defaults;delete_ids uuid[];removed_ids uuid[];c numeric;p numeric;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM public.fee_proposals WHERE id=_quote_id FOR UPDATE;IF NOT FOUND OR q.is_locked OR q.pm_project_id IS NOT NULL OR q.locked_project_id IS NOT NULL OR q.quote_status NOT IN ('draft','sent','approved') OR public.quote_has_contract(q.id) THEN RAISE EXCEPTION 'Calculator requires an editable unconverted draft';END IF;
 b:=public.quote_template_capture(_quote_id);IF md5(b::text) IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'Quote changed; review replacement again';END IF;
 rows:=_inputs->'stages';IF jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE length(trim(coalesce(r->>'name','')))=0 OR coalesce((r->>'percentage')::numeric,-1)<0 OR coalesce(r->>'id','')='') OR (SELECT abs(sum((r->>'percentage')::numeric)-1) FROM jsonb_array_elements(rows) r)>0.000001 OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(rows) r)<>jsonb_array_length(rows) THEN RAISE EXCEPTION 'Calculator rows need names, unique keys and percentages totalling 100';END IF;
 SELECT jsonb_agg(r->>'id') INTO keys FROM jsonb_array_elements(rows) r;preview:=public.quote_calculator_preview(_quote_id,keys);
 IF jsonb_array_length(preview->'existing')>0 AND _existing_action NOT IN('replace','add') THEN RAISE EXCEPTION 'Confirm replace or add architecture stages';END IF;
 IF public.quote_has_contract(q.id) AND jsonb_array_length(preview->'manual')>0 AND NOT _overwrite_manual THEN RAISE EXCEPTION 'Confirm overwrite of manually changed calculator values';END IF;
 SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) INTO removed_ids FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NOT NULL AND NOT(keys ? calculator_row_id);
 delete_ids:=CASE WHEN _delete_removed THEN removed_ids ELSE ARRAY[]::uuid[] END;
 IF _existing_action='replace' THEN SELECT delete_ids||coalesce(array_agg(id),ARRAY[]::uuid[]) INTO delete_ids FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NULL AND stage_role='architecture' AND stage_kind='regular' AND phase_group<>'construction' AND archived_at IS NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.quote_stages WHERE quote_id=_quote_id AND parent_stage_id=ANY(delete_ids) AND NOT(id=ANY(delete_ids))) THEN RAISE EXCEPTION 'Replacement would affect protected child stages; choose add instead';END IF;
 IF EXISTS(SELECT 1 FROM public.quote_payment_schedule_items WHERE quote_id=_quote_id AND stage_id=ANY(delete_ids) AND (direction='outflow' OR billing_status::text<>'planned')) THEN RAISE EXCEPTION 'Replacement would affect protected payments; choose add instead';END IF;
 IF cardinality(delete_ids)>0 THEN
 DELETE FROM public.quote_payment_schedule_items WHERE quote_id=_quote_id AND stage_id=ANY(delete_ids) AND direction='inflow';
 DELETE FROM public.quote_stage_dependencies WHERE quote_id=_quote_id AND (predecessor_stage_id=ANY(delete_ids) OR successor_stage_id=ANY(delete_ids));
 DELETE FROM public.quote_stages WHERE quote_id=_quote_id AND id=ANY(delete_ids);
 END IF;
 IF NOT _delete_removed THEN UPDATE public.quote_stages SET calculator_row_id=NULL,calculator_last_value=NULL WHERE quote_id=_quote_id AND id=ANY(removed_ids);END IF;
 fee:=public.quote_calculator_value(_inputs);
 SELECT r->>'id' INTO largest FROM jsonb_array_elements(rows) WITH ORDINALITY t(r,i) ORDER BY (r->>'percentage')::numeric DESC,i LIMIT 1;
 SELECT fee-sum(round(fee*(r->>'percentage')::numeric)) INTO remainder FROM jsonb_array_elements(rows) r;
 SELECT * INTO defaults FROM public.quote_planning_defaults WHERE id;start_pct:=defaults.stage_start_percent;end_pct:=defaults.stage_end_percent;
 IF start_pct IS NOT NULL AND (start_pct<0 OR end_pct<0 OR start_pct+end_pct<>100) THEN RAISE EXCEPTION 'Payment milestone percentages must total 100';END IF;
 SELECT coalesce(max(sort_order),0),greatest(date '2000-01-03',coalesce(max(end_date)+1,date '2000-01-03')) INTO ordering,next_date FROM public.quote_stages WHERE quote_id=_quote_id AND stage_role='architecture' AND stage_kind='regular' AND phase_group<>'construction' AND archived_at IS NULL;
 IF next_date>=date '2010-01-01' THEN RAISE EXCEPTION 'Relative quote stages required';END IF;
 SELECT id INTO previous_id FROM public.quote_stages WHERE quote_id=_quote_id AND stage_role='architecture' AND stage_kind='regular' AND phase_group<>'construction' AND archived_at IS NULL ORDER BY end_date DESC,sort_order DESC LIMIT 1;
 FOR row IN SELECT r FROM jsonb_array_elements(rows) WITH ORDINALITY t(r,i) ORDER BY i LOOP
 value:=round(fee*(row->>'percentage')::numeric)+CASE WHEN row->>'id'=largest THEN remainder ELSE 0 END;
 SELECT id INTO sid FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id=row->>'id';
 IF sid IS NOT NULL THEN
 UPDATE public.quote_stages SET name=row->>'name',budget=value/coalesce(nullif(q.pricing_multiplier,0),1),calculator_last_value=value/coalesce(nullif(q.pricing_multiplier,0),1) WHERE quote_id=_quote_id AND id=sid;
 ELSE
 sid:=gen_random_uuid();ordering:=ordering+1;finish:=(next_date+interval '1 month')::date-1;
 PERFORM public.quote_stage_snapshot_insert(jsonb_build_object('id',sid,'name',row->>'name','start_date',next_date,'end_date',finish,'sort_order',ordering,'budget',value/coalesce(nullif(q.pricing_multiplier,0),1),'calculator_last_value',value/coalesce(nullif(q.pricing_multiplier,0),1),'calculator_row_id',row->>'id','stage_role','architecture','stage_kind','regular','phase_group','project','is_self',true,'budget_mode','fixed','sale_source','budget','generator_source','calculator','is_generated',true,'calculator_payment_unconfigured',start_pct IS NULL),_quote_id);
 IF previous_id IS NOT NULL THEN INSERT INTO public.quote_stage_dependencies(quote_id,predecessor_stage_id,successor_stage_id,type,lag_days,generator_source,is_generated) VALUES(_quote_id,previous_id,sid,'FS',0,'calculator',true);END IF;
 IF start_pct IS NOT NULL THEN
 IF start_pct>0 THEN INSERT INTO public.quote_payment_schedule_items(quote_id,stage_id,label,trigger_type,amount_type,amount_value,sort_order,direction,generator_source,vat_rate,payment_terms,payment_offset_days) VALUES(_quote_id,sid,row->>'name','stage_start','percent',start_pct,ordering*2,'inflow','calculator',CASE WHEN q.quote_build_settings->>'vatEnabled'='false' THEN 0 ELSE coalesce(q.default_vat_rate,23) END,q.default_payment_terms,30);END IF;
 IF end_pct>0 THEN INSERT INTO public.quote_payment_schedule_items(quote_id,stage_id,label,trigger_type,amount_type,amount_value,sort_order,direction,generator_source,vat_rate,payment_terms,payment_offset_days) VALUES(_quote_id,sid,row->>'name','stage_end','percent',end_pct,ordering*2+1,'inflow','calculator',CASE WHEN q.quote_build_settings->>'vatEnabled'='false' THEN 0 ELSE coalesce(q.default_vat_rate,23) END,q.default_payment_terms,30);END IF;
 END IF;
 next_date:=finish+1;previous_id:=sid;
 END IF;
 UPDATE public.quote_payment_schedule_items SET label=row->>'name' WHERE quote_id=_quote_id AND stage_id=sid AND generator_source='calculator' AND NOT manual_override;
 END LOOP;
 c:=coalesce(nullif((_inputs->>'constructionValue')::numeric,0),(_inputs->>'area')::numeric*(_inputs->>'costPerSqm')::numeric,0);
 p:=fee/nullif(c*(1-.008+coalesce((_inputs->>'heritageUplift')::numeric,0)+coalesce((_inputs->>'extensionUplift')::numeric,0)),0)*100;
 UPDATE public.fee_proposals SET project_fee_calculation=_inputs,valor=fee,construction_cost=c,fee_percentage=p WHERE id=_quote_id;
 INSERT INTO public.quote_template_imports(quote_id,actor_id,before_state,after_hash) VALUES(_quote_id,auth.uid(),b,md5(public.quote_template_capture(_quote_id)::text)) RETURNING id INTO operation;
 RETURN operation;
END $function$
;

CREATE OR REPLACE FUNCTION public.pm_gantt_record_value(_stage pm_stages, _old numeric, _new numeric, _event text, _reason text, _month date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE actor text;
BEGIN
 IF NOT public.pm_has_gantt_contract(_stage.project_id) THEN RETURN; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''),email,auth.uid()::text) INTO actor FROM auth.users WHERE id=auth.uid();
 INSERT INTO pm_gantt_value_history(project_id,stage_id,stage_name,actor_id,actor_name,event_type,old_value,new_value,reason,effective_month) VALUES(_stage.project_id,_stage.id,_stage.name,auth.uid(),coalesce(actor,auth.uid()::text),_event,_old,_new,_reason,_month);
END $function$
;

CREATE OR REPLACE FUNCTION public.pm_gantt_value_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE parent public.pm_stages; sibling_total numeric; child_total numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.commercial_value_owned:=true;
  NEW.outside_contract:=public.pm_has_gantt_contract(NEW.project_id) AND NEW.source_quote_stage_id IS NULL AND NEW.source_contract_id IS NULL AND NEW.stage_kind<>'retainer_month';
 ELSE
  IF NEW.outside_contract IS DISTINCT FROM OLD.outside_contract THEN RAISE EXCEPTION 'Contract origin is immutable' USING ERRCODE='42501'; END IF;
  IF (NEW.budget,NEW.retainer_monthly_amount) IS DISTINCT FROM (OLD.budget,OLD.retainer_monthly_amount) AND public.pm_has_gantt_contract(NEW.project_id) AND coalesce(current_setting('pm.gantt_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Confirm responsibility and give a reason before changing a value' USING ERRCODE='42501'; END IF;
  IF NEW.commercial_value_owned IS DISTINCT FROM OLD.commercial_value_owned AND public.pm_has_gantt_contract(NEW.project_id) AND coalesce(current_setting('pm.gantt_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Use the confirmed value action' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.budget IS NULL OR NEW.budget<0 THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF NEW.parent_stage_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_stage_id IS DISTINCT FROM OLD.parent_stage_id OR NEW.budget IS DISTINCT FROM OLD.budget) THEN
  SELECT * INTO parent FROM pm_stages WHERE id=NEW.parent_stage_id FOR UPDATE;
  IF parent.project_id IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'Cross-project split is forbidden' USING ERRCODE='42501'; END IF;
  IF parent.stage_kind<>'retainer_monthly' AND coalesce(parent.stage_role,'architecture') NOT IN ('client','supplier_group') THEN
   SELECT coalesce(sum(budget),0) INTO sibling_total FROM pm_stages WHERE parent_stage_id=parent.id AND id<>NEW.id AND stage_kind<>'retainer_month' AND status<>'cancelled';
   IF sibling_total+NEW.budget>parent.budget THEN RAISE EXCEPTION 'Substage values cannot exceed the stage value'; END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.budget IS DISTINCT FROM OLD.budget AND NEW.stage_kind<>'retainer_monthly' AND coalesce(NEW.stage_role,'architecture') NOT IN ('client','supplier_group') THEN
  SELECT coalesce(sum(budget),0) INTO child_total FROM pm_stages WHERE parent_stage_id=NEW.id AND status<>'cancelled' AND stage_kind<>'retainer_month';
  IF child_total>NEW.budget THEN RAISE EXCEPTION 'Substage values cannot exceed the stage value'; END IF;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.pm_gantt_change_value(_stage uuid, _expected numeric, _value numeric, _reason text, _responsibility boolean, _client_agreed boolean DEFAULT false, _effective_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.pm_stages; c public.pm_stages; old_total numeric; new_total numeric; m date; n integer; d date;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR NOT public.pm_can_edit_gantt(s.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gantt-value:'||s.project_id::text,0));
 IF public.pm_has_gantt_contract(s.project_id) AND (_responsibility IS DISTINCT FROM true OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 240) THEN RAISE EXCEPTION 'Responsibility confirmation and a short reason are required'; END IF;
 IF _value IS NULL OR _value<0 OR _value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF (CASE WHEN s.stage_kind='retainer_monthly' THEN s.retainer_monthly_amount ELSE s.budget END) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Value changed elsewhere; reload before confirming' USING ERRCODE='40001'; END IF;
 PERFORM set_config('pm.gantt_value_action','yes',true); PERFORM set_config('pm.gantt_value_reason',trim(_reason),true);
 IF s.stage_kind='retainer_monthly' AND NOT public.pm_has_gantt_contract(s.project_id) THEN
  UPDATE pm_stages SET retainer_monthly_amount=_value WHERE id=s.id;
  RETURN jsonb_build_object('value',_value);
 END IF;
 IF s.stage_kind='retainer_monthly' THEN
  IF _client_agreed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm whether the client agreed to the new retainer value'; END IF;
  m:=date_trunc('month',coalesce(_effective_month,current_date))::date;
  IF m<date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Retainer changes apply going forward only'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month') THEN
   IF coalesce(s.retainer_months,0)<1 THEN RAISE EXCEPTION 'Retainer duration is missing'; END IF;
   FOR n IN 0..s.retainer_months-1 LOOP
    d:=(date_trunc('month',coalesce(s.retainer_anchor_month,s.start_date))+make_interval(months=>n))::date;
    INSERT INTO pm_stages(project_id,parent_stage_id,name,budget,start_date,end_date,color,sort_order,stage_kind,is_self) VALUES(s.project_id,s.id,to_char(d,'YYYY-MM'),s.retainer_monthly_amount,d,(d+interval '1 month - 1 day')::date,s.color,n,'retainer_month',s.is_self);
   END LOOP;
  END IF;
  old_total:=s.budget; new_total:=s.budget;
  FOR c IN SELECT * FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month' AND start_date>=m ORDER BY start_date FOR UPDATE LOOP
   IF EXISTS(SELECT 1 FROM pm_payment_schedule_items p WHERE (p.stage_id=c.id OR (p.stage_id=s.id AND p.trigger_type::text='monthly' AND coalesce(p.timing_month_index, (SELECT count(*)-1 FROM pm_payment_schedule_items prior WHERE prior.stage_id=s.id AND prior.trigger_type::text='monthly' AND (prior.sort_order,prior.id)<=(p.sort_order,p.id)))=(SELECT count(*)-1 FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month' AND start_date<=c.start_date))) AND (p.dates_frozen_at IS NOT NULL OR p.billing_status::text IN ('issued','paid','cancelled'))) THEN CONTINUE; END IF;
   PERFORM public.pm_gantt_reconcile_value(c.id,c.budget,_value);
   UPDATE pm_stages SET budget=_value,commercial_value_owned=true WHERE id=c.id;
   PERFORM public.pm_gantt_record_value(c,c.budget,_value,'retainer_month',trim(_reason),m);
   new_total:=new_total+_value-c.budget;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month') THEN
   RAISE EXCEPTION 'Retainer month breakdown required before changing monthly values';
  END IF;
  UPDATE pm_stages SET retainer_monthly_amount=_value,budget=new_total,commercial_value_owned=true WHERE id=s.id;
  PERFORM public.pm_gantt_record_value(s,s.retainer_monthly_amount,_value,'retainer_value',trim(_reason),m);
 ELSE
  IF s.stage_kind='retainer_month' THEN RAISE EXCEPTION 'Change the retainer monthly value through its parent'; END IF;
  PERFORM public.pm_gantt_reconcile_value(s.id,s.budget,_value);
  UPDATE pm_stages SET budget=_value,budget_mode='fixed',commercial_value_owned=true WHERE id=s.id;
  PERFORM public.pm_gantt_record_value(s,s.budget,_value,'stage_value',trim(_reason));
 END IF;
 PERFORM set_config('pm.gantt_value_action','',true); PERFORM set_config('pm.gantt_value_reason','',true);
 RETURN jsonb_build_object('id',s.id,'value',_value);
END $function$
;

CREATE OR REPLACE FUNCTION public.pm_gantt_commercial_read(_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE stages jsonb; total numeric;
BEGIN
 IF NOT public.pm_can_edit_gantt(_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',s.id,'contracted',public.pm_gantt_contract_value(s.id),'outsideContract',s.outside_contract,'valueOwned',s.commercial_value_owned) ORDER BY s.sort_order,s.id) INTO stages FROM pm_stages s WHERE s.project_id=_project;
 SELECT coalesce((SELECT CASE WHEN count(*)=1 THEN min(total_fee) END FROM pm_project_contract_baseline WHERE project_id=_project), (SELECT CASE WHEN count(*)=1 THEN min(sold_fee_total) END FROM pm_project_commercial_baselines WHERE project_id=_project)) INTO total;
 RETURN jsonb_build_object('stages',coalesce(stages,'[]'),'contractedTotal',total,'hasContract',public.pm_has_gantt_contract(_project));
END $function$
;

CREATE OR REPLACE FUNCTION public.pm_gantt_contract_value(_stage uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT CASE WHEN public.pm_can_edit_gantt(s.project_id) THEN coalesce(
 (SELECT (x->>'budget')::numeric FROM pm_stages live JOIN pm_projects p ON p.id=live.project_id JOIN quote_contract_references r ON r.quote_id=p.quote_id CROSS JOIN LATERAL jsonb_array_elements(r.stages) x WHERE live.id=s.id AND x->>'id'=live.source_quote_stage_id::text LIMIT 1),
 (SELECT CASE WHEN count(*)=1 THEN min(b.budget) END FROM pm_project_contract_baseline_stages b JOIN pm_project_contract_baseline h ON h.id=b.baseline_id WHERE h.project_id=s.project_id AND b.live_stage_id=s.id),
 (SELECT CASE WHEN count(*)=1 THEN min(b.sold_fee) END FROM pm_stage_commercial_baselines b WHERE b.project_id=s.project_id AND b.project_stage_id=s.id),
 (SELECT CASE WHEN count(*)=1 THEN min((x->>'budget')::numeric) END FROM pm_projects p JOIN fee_proposals q ON q.id=p.quote_id AND q.pm_project_id=p.id JOIN psa_proposal_snapshots snap ON snap.id=q.accepted_snapshot_id CROSS JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot#>'{quote_data,raw,quote_stages}','[]')) x WHERE p.id=s.project_id AND x->>'id'=s.source_quote_stage_id::text AND x->>'sale_source'='budget')
 ) END FROM pm_stages s WHERE s.id=_stage;
$function$
;
