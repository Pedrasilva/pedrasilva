CREATE OR REPLACE FUNCTION public.pm_gantt_reconcile_value(_stage uuid,_old numeric,_new numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages; rows_ids uuid[]; frozen numeric; weights numeric; n integer; original_n integer; r public.pm_payment_schedule_items; target numeric; used numeric:=0; v numeric;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage;
 IF s.stage_kind<>'retainer_month' AND s.parent_stage_id IS NOT NULL AND EXISTS(SELECT 1 FROM pm_stages WHERE id=s.parent_stage_id AND coalesce(stage_role,'architecture') NOT IN ('client','supplier_group')) THEN RETURN; END IF;
 WITH RECURSIVE family AS(SELECT id FROM pm_stages WHERE id=_stage UNION ALL SELECT c.id FROM pm_stages c JOIN family f ON c.parent_stage_id=f.id)
 SELECT array_agg(p.id) INTO rows_ids FROM pm_payment_schedule_items p WHERE p.project_id=s.project_id AND p.direction='inflow' AND p.stage_id IN(SELECT id FROM family);
 IF rows_ids IS NULL AND s.stage_kind='retainer_month' THEN
  SELECT array_agg(id) INTO rows_ids FROM pm_payment_schedule_items WHERE stage_id=s.parent_stage_id AND trigger_type::text='monthly' AND coalesce(timing_month_index,(SELECT count(*)-1 FROM pm_payment_schedule_items prior WHERE prior.stage_id=s.parent_stage_id AND prior.trigger_type::text='monthly' AND (prior.sort_order,prior.id)<=(pm_payment_schedule_items.sort_order,pm_payment_schedule_items.id)))=(SELECT count(*)-1 FROM pm_stages WHERE parent_stage_id=s.parent_stage_id AND stage_kind='retainer_month' AND start_date<=s.start_date);
 END IF;
 IF rows_ids IS NULL AND s.stage_kind<>'retainer_month' THEN
  SELECT array_agg(id) INTO rows_ids FROM pm_payment_schedule_items WHERE project_id=s.project_id AND direction='inflow' AND stage_id IS NULL;
  IF rows_ids IS NOT NULL THEN SELECT coalesce(sum(amount_value),0)+(_new-_old) INTO target FROM pm_payment_schedule_items WHERE id=ANY(rows_ids) AND amount_type::text='fixed'; END IF;
 END IF;
 IF rows_ids IS NULL THEN
  IF _new>0 AND coalesce(s.stage_role,'architecture') NOT IN ('client','supplier_group') THEN INSERT INTO pm_payment_schedule_items(project_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,direction,generator_source,entity_id) VALUES(s.project_id,s.id,s.name,'stage_end','fixed',_new,s.end_date,s.end_date,'inflow','gantt_value',(SELECT entity_id FROM pm_invoice_settings WHERE singleton=true LIMIT 1)); END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM pm_payment_schedule_items WHERE id=ANY(rows_ids) AND amount_type::text<>'fixed') THEN RAISE EXCEPTION 'Review mixed payment amount types before changing this value'; END IF;
 SELECT coalesce(sum(amount_value) FILTER(WHERE dates_frozen_at IS NOT NULL OR billing_status::text IN ('issued','paid','cancelled') OR EXISTS(SELECT 1 FROM financial_document_lines l JOIN financial_documents d ON d.id=l.document_id WHERE l.payment_schedule_item_id=p.id AND d.status::text NOT IN ('draft','cancelled'))),0) INTO frozen FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids);
 target:=coalesce(target,_new)-frozen;
 IF target<0 THEN RAISE EXCEPTION 'New value is below protected issued or paid amounts'; END IF;
 SELECT coalesce(sum(amount_value),0),count(*) INTO weights,n FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids) AND dates_frozen_at IS NULL AND billing_status::text NOT IN ('issued','paid','cancelled') AND NOT EXISTS(SELECT 1 FROM financial_document_lines l JOIN financial_documents d ON d.id=l.document_id WHERE l.payment_schedule_item_id=p.id AND d.status::text NOT IN ('draft','cancelled'));
 IF n=0 THEN
  IF target>0 THEN INSERT INTO pm_payment_schedule_items(project_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,direction,generator_source,entity_id) VALUES(s.project_id,s.id,s.name,'stage_end','fixed',target,s.end_date,s.end_date,'inflow','gantt_value',(SELECT entity_id FROM pm_invoice_settings WHERE singleton=true LIMIT 1)); END IF; RETURN;
 END IF;
 original_n:=n;
 FOR r IN SELECT * FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids) AND dates_frozen_at IS NULL AND billing_status::text NOT IN ('issued','paid','cancelled') AND NOT EXISTS(SELECT 1 FROM financial_document_lines l JOIN financial_documents d ON d.id=l.document_id WHERE l.payment_schedule_item_id=p.id AND d.status::text NOT IN ('draft','cancelled')) ORDER BY sort_order,id LOOP
  n:=n-1; v:=CASE WHEN n=0 THEN target-used ELSE round(target*CASE WHEN weights=0 THEN 1.0/original_n ELSE r.amount_value/weights END,2) END;
  UPDATE pm_payment_schedule_items SET amount_value=v WHERE id=r.id; used:=used+v;
 END LOOP;
 PERFORM public.pm_invoice_regroup('pm_payment_schedule_items',s.project_id);
END $$;
CREATE OR REPLACE FUNCTION public.pm_gantt_change_value(_stage uuid,_expected numeric,_value numeric,_reason text,_responsibility boolean,_client_agreed boolean DEFAULT false,_effective_month date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages; c public.pm_stages; old_total numeric; new_total numeric; m date; n integer; d date;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR NOT public.pm_can_edit_gantt(s.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gantt-value:'||s.project_id::text,0));
 IF _responsibility IS DISTINCT FROM true OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 240 THEN RAISE EXCEPTION 'Responsibility confirmation and a short reason are required'; END IF;
 IF _value IS NULL OR _value<0 OR _value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF (CASE WHEN s.stage_kind='retainer_monthly' THEN s.retainer_monthly_amount ELSE s.budget END) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Value changed elsewhere; reload before confirming' USING ERRCODE='40001'; END IF;
 PERFORM set_config('pm.gantt_value_action','yes',true); PERFORM set_config('pm.gantt_value_reason',trim(_reason),true);
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
END $$;
CREATE OR REPLACE FUNCTION public.pm_gantt_new_stage_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.outside_contract THEN
  PERFORM public.pm_gantt_record_value(NEW,NULL,NEW.budget,'new_stage',coalesce(nullif(current_setting('pm.gantt_value_reason',true),''),'New stage outside the contract'));
  IF NEW.stage_kind<>'retainer_monthly' THEN PERFORM public.pm_gantt_reconcile_value(NEW.id,0,NEW.budget); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.pm_gantt_save(_mode text, _scope uuid, _revision text, _patch jsonb, _initialize boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE before_state jsonb; after_state jsonb; r jsonb; n integer; ids uuid[]; dep_changed boolean; stages_changed boolean; allocs_changed boolean;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode='quote' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode NOT IN ('quote','project') OR jsonb_typeof(_patch)<>'object' THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF NOT pg_try_advisory_xact_lock(hashtextextended('gantt:'||_mode||':'||_scope::text,0)) THEN RAISE EXCEPTION 'gantt.schedule.busy'; END IF;
IF _mode='project' THEN LOCK TABLE pm_stages,pm_allocations,pm_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
ELSE LOCK TABLE fee_proposals,quote_stages,quote_allocations,quote_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope AND (is_locked OR pm_project_id IS NOT NULL)) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF; END IF;
before_state:=public.pm_gantt_state(_mode,_scope);
IF before_state->>'revision' IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
stages_changed:=jsonb_array_length(coalesce(_patch->'stages','[]'::jsonb))>0;
allocs_changed:=jsonb_array_length(coalesce(_patch->'allocations','[]'::jsonb))>0;
dep_changed:=_patch ? 'dependencies' AND _patch->'dependencies' IS DISTINCT FROM before_state->'dependencies';
IF _mode='project' AND NOT public.pm_can_edit_gantt(_scope) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _initialize THEN
IF _mode<>'quote' OR EXISTS(SELECT 1 FROM quote_relative_schedules WHERE quote_id=_scope) THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(_scope,before_state); END IF;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'stages','[]'::jsonb)) LOOP
IF r->>'start_date' IS NULL OR r->>'end_date' IS NULL OR (r->>'end_date')::date<(r->>'start_date')::date THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF _mode='quote' THEN UPDATE quote_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date,manual_override=true WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE
UPDATE pm_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND project_id=_scope; END IF;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF; END LOOP;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'allocations','[]'::jsonb)) LOOP
IF r->>'start_date' IS NULL OR r->>'end_date' IS NULL OR (r->>'end_date')::date<(r->>'start_date')::date THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF _mode='quote' THEN UPDATE quote_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE IF EXISTS(SELECT 1 FROM pm_allocations WHERE id=(r->>'id')::uuid AND (is_locked OR external_id IS NOT NULL OR source IN('import','imported_accelo'))) THEN RAISE EXCEPTION 'gantt.schedule.lockedAllocation'; END IF;
UPDATE pm_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND planning_removed_at IS NULL AND stage_id IN(SELECT id FROM pm_stages WHERE project_id=_scope); END IF;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF; END LOOP;
IF dep_changed THEN
IF EXISTS(SELECT 1 FROM jsonb_array_elements(_patch->'dependencies') d WHERE d->>'type' NOT IN('FS','SS','FF','SF') OR (d->>'predecessor_id')::uuid=(d->>'successor_id')::uuid OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=d->>'predecessor_id') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=d->>'successor_id')) THEN RAISE EXCEPTION 'gantt.schedule.invalidLink'; END IF;
WITH RECURSIVE links AS(SELECT d->>'predecessor_id' p,d->>'successor_id' s FROM jsonb_array_elements(_patch->'dependencies') d), walk AS(SELECT p,s,ARRAY[p,s] path,p=s cycle FROM links UNION ALL SELECT w.p,l.s,w.path||l.s,l.s=ANY(w.path) FROM walk w JOIN links l ON l.p=w.s WHERE NOT w.cycle) SELECT count(*) INTO n FROM walk WHERE cycle; IF n>0 THEN RAISE EXCEPTION 'gantt.schedule.circular'; END IF;
IF _mode='quote' THEN
DELETE FROM quote_stage_dependencies WHERE quote_id=_scope;
INSERT INTO quote_stage_dependencies(id,quote_id,predecessor_stage_id,successor_stage_id,type,lag_days) SELECT coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()),_scope,(d->>'predecessor_id')::uuid,(d->>'successor_id')::uuid,(d->>'type')::quote_dep_type,coalesce((d->>'lag_days')::integer,0) FROM jsonb_array_elements(_patch->'dependencies') d;
ELSE
DELETE FROM pm_stage_dependencies WHERE predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope);
INSERT INTO pm_stage_dependencies(id,predecessor_id,successor_id,type,lag_days) SELECT coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()),(d->>'predecessor_id')::uuid,(d->>'successor_id')::uuid,d->>'type',coalesce((d->>'lag_days')::integer,0) FROM jsonb_array_elements(_patch->'dependencies') d; END IF; END IF;
after_state:=public.pm_gantt_state(_mode,_scope);
IF _mode='project' THEN UPDATE pm_projects SET start_date=(SELECT min(start_date) FROM pm_stages WHERE project_id=_scope AND stage_kind<>'retainer_month') WHERE id=_scope; END IF;
RETURN jsonb_build_object('before',before_state,'after',after_state);
END $function$;