ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS commercial_value_owned boolean NOT NULL DEFAULT false;
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS outside_contract boolean NOT NULL DEFAULT false;
CREATE TABLE public.pm_gantt_value_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, stage_id uuid NOT NULL,
 stage_name text NOT NULL, actor_id uuid NOT NULL, actor_name text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),
 event_type text NOT NULL, old_value numeric, new_value numeric NOT NULL, reason text NOT NULL,
 effective_month date, details jsonb NOT NULL DEFAULT '{}'
);
GRANT SELECT ON public.pm_gantt_value_history TO authenticated;
GRANT ALL ON public.pm_gantt_value_history TO service_role;
REVOKE TRUNCATE ON public.pm_gantt_value_history FROM anon,authenticated;
ALTER TABLE public.pm_gantt_value_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project financial history" ON public.pm_gantt_value_history FOR SELECT TO authenticated USING(public.pm_can_edit_gantt(project_id));
CREATE INDEX pm_gantt_value_history_project_idx ON public.pm_gantt_value_history(project_id,changed_at DESC);
CREATE FUNCTION public.pm_gantt_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commercial history is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER pm_gantt_history_immutable BEFORE UPDATE OR DELETE ON public.pm_gantt_value_history FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_history_immutable();
REVOKE ALL ON FUNCTION public.pm_gantt_history_immutable() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_gantt_contract_value(_stage uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.pm_can_edit_gantt(s.project_id) THEN coalesce(
 (SELECT CASE WHEN count(*)=1 THEN min(b.budget) END FROM pm_project_contract_baseline_stages b JOIN pm_project_contract_baseline h ON h.id=b.baseline_id WHERE h.project_id=s.project_id AND b.live_stage_id=s.id),
 (SELECT CASE WHEN count(*)=1 THEN min(b.sold_fee) END FROM pm_stage_commercial_baselines b WHERE b.project_id=s.project_id AND b.project_stage_id=s.id),
 (SELECT CASE WHEN count(*)=1 THEN min((x->>'budget')::numeric) END FROM pm_projects p JOIN fee_proposals q ON q.id=p.quote_id AND q.pm_project_id=p.id JOIN psa_proposal_snapshots snap ON snap.id=q.accepted_snapshot_id CROSS JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot#>'{quote_data,raw,quote_stages}','[]')) x WHERE p.id=s.project_id AND x->>'id'=s.source_quote_stage_id::text AND x->>'sale_source'='budget')
 ) END FROM pm_stages s WHERE s.id=_stage;
$$;
REVOKE ALL ON FUNCTION public.pm_gantt_contract_value(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_contract_value(uuid) TO authenticated,service_role;
CREATE FUNCTION public.pm_gantt_commercial_read(_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE stages jsonb; total numeric;
BEGIN
 IF NOT public.pm_can_edit_gantt(_project) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',s.id,'contracted',public.pm_gantt_contract_value(s.id),'outsideContract',s.outside_contract,'valueOwned',s.commercial_value_owned) ORDER BY s.sort_order,s.id) INTO stages FROM pm_stages s WHERE s.project_id=_project;
 SELECT coalesce((SELECT CASE WHEN count(*)=1 THEN min(total_fee) END FROM pm_project_contract_baseline WHERE project_id=_project), (SELECT CASE WHEN count(*)=1 THEN min(sold_fee_total) END FROM pm_project_commercial_baselines WHERE project_id=_project)) INTO total;
 RETURN jsonb_build_object('stages',coalesce(stages,'[]'),'contractedTotal',total);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_commercial_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_commercial_read(uuid) TO authenticated,service_role;
CREATE FUNCTION public.pm_gantt_record_value(_stage public.pm_stages,_old numeric,_new numeric,_event text,_reason text,_month date DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''),email,auth.uid()::text) INTO actor FROM auth.users WHERE id=auth.uid();
 INSERT INTO pm_gantt_value_history(project_id,stage_id,stage_name,actor_id,actor_name,event_type,old_value,new_value,reason,effective_month) VALUES(_stage.project_id,_stage.id,_stage.name,auth.uid(),coalesce(actor,auth.uid()::text),_event,_old,_new,_reason,_month);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_record_value(public.pm_stages,numeric,numeric,text,text,date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_gantt_value_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.pm_stages; sibling_total numeric; child_total numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.commercial_value_owned:=true;
  NEW.outside_contract:=NEW.source_quote_stage_id IS NULL AND NEW.source_contract_id IS NULL AND NEW.stage_kind<>'retainer_month';
 ELSE
  IF NEW.outside_contract IS DISTINCT FROM OLD.outside_contract THEN RAISE EXCEPTION 'Contract origin is immutable' USING ERRCODE='42501'; END IF;
  IF (NEW.budget,NEW.retainer_monthly_amount) IS DISTINCT FROM (OLD.budget,OLD.retainer_monthly_amount) AND coalesce(current_setting('pm.gantt_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Confirm responsibility and give a reason before changing a value' USING ERRCODE='42501'; END IF;
  IF NEW.commercial_value_owned IS DISTINCT FROM OLD.commercial_value_owned AND coalesce(current_setting('pm.gantt_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Use the confirmed value action' USING ERRCODE='42501'; END IF;
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
END $$;
CREATE TRIGGER z1_pm_gantt_value_guard BEFORE INSERT OR UPDATE ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_value_guard();
CREATE FUNCTION public.pm_gantt_new_stage_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.outside_contract THEN PERFORM public.pm_gantt_record_value(NEW,NULL,NEW.budget,'new_stage',coalesce(nullif(current_setting('pm.gantt_value_reason',true),''),'New stage outside the contract')); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z2_pm_gantt_new_stage_history AFTER INSERT ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_new_stage_history();
REVOKE ALL ON FUNCTION public.pm_gantt_value_guard(),public.pm_gantt_new_stage_history() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_gantt_payment_amount_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.amount_type,NEW.amount_value) IS DISTINCT FROM (OLD.amount_type,OLD.amount_value) AND (OLD.dates_frozen_at IS NOT NULL OR OLD.billing_status::text IN ('issued','paid','cancelled') OR EXISTS(SELECT 1 FROM pm_invoice_items i JOIN pm_invoices inv ON inv.id=i.invoice_id WHERE i.stage_id=OLD.stage_id AND (inv.status::text<>'draft' OR inv.financial_document_id IS NOT NULL))) THEN RAISE EXCEPTION 'Issued invoices and confirmed payments are protected'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z3_pm_gantt_payment_amount_guard BEFORE UPDATE ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_payment_amount_guard();
REVOKE ALL ON FUNCTION public.pm_gantt_payment_amount_guard() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_gantt_reconcile_value(_stage uuid,_old numeric,_new numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages; rows_ids uuid[]; frozen numeric; weights numeric; n integer; original_n integer; r public.pm_payment_schedule_items; target numeric; used numeric:=0; v numeric;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage;
 IF s.stage_kind<>'retainer_month' AND s.parent_stage_id IS NOT NULL AND EXISTS(SELECT 1 FROM pm_stages WHERE id=s.parent_stage_id AND coalesce(stage_role,'architecture') NOT IN ('client','supplier_group')) THEN RETURN; END IF;
 WITH RECURSIVE family AS(SELECT id FROM pm_stages WHERE id=_stage UNION ALL SELECT c.id FROM pm_stages c JOIN family f ON c.parent_stage_id=f.id)
 SELECT array_agg(p.id) INTO rows_ids FROM pm_payment_schedule_items p WHERE p.project_id=s.project_id AND p.direction='inflow' AND p.stage_id IN(SELECT id FROM family);
 IF rows_ids IS NULL AND s.stage_kind='retainer_month' THEN
  SELECT array_agg(id) INTO rows_ids FROM pm_payment_schedule_items WHERE stage_id=s.parent_stage_id AND trigger_type::text='monthly' AND coalesce(timing_month_index,sort_order)=(SELECT count(*)-1 FROM pm_stages WHERE parent_stage_id=s.parent_stage_id AND stage_kind='retainer_month' AND start_date<=s.start_date);
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
 SELECT coalesce(sum(amount_value) FILTER(WHERE dates_frozen_at IS NOT NULL OR billing_status::text IN ('issued','paid','cancelled') OR EXISTS(SELECT 1 FROM pm_invoice_items i JOIN pm_invoices inv ON inv.id=i.invoice_id WHERE i.stage_id=p.stage_id AND (inv.status::text<>'draft' OR inv.financial_document_id IS NOT NULL))),0) INTO frozen FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids);
 target:=coalesce(target,_new)-frozen;
 IF target<0 THEN RAISE EXCEPTION 'New value is below protected issued or paid amounts'; END IF;
 SELECT coalesce(sum(amount_value),0),count(*) INTO weights,n FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids) AND dates_frozen_at IS NULL AND billing_status::text NOT IN ('issued','paid','cancelled') AND NOT EXISTS(SELECT 1 FROM pm_invoice_items i JOIN pm_invoices inv ON inv.id=i.invoice_id WHERE i.stage_id=p.stage_id AND (inv.status::text<>'draft' OR inv.financial_document_id IS NOT NULL));
 IF n=0 THEN
  IF target>0 THEN INSERT INTO pm_payment_schedule_items(project_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,direction,generator_source,entity_id) VALUES(s.project_id,s.id,s.name,'stage_end','fixed',target,s.end_date,s.end_date,'inflow','gantt_value',(SELECT entity_id FROM pm_invoice_settings WHERE singleton=true LIMIT 1)); END IF; RETURN;
 END IF;
 original_n:=n;
 FOR r IN SELECT * FROM pm_payment_schedule_items p WHERE id=ANY(rows_ids) AND dates_frozen_at IS NULL AND billing_status::text NOT IN ('issued','paid','cancelled') AND NOT EXISTS(SELECT 1 FROM pm_invoice_items i JOIN pm_invoices inv ON inv.id=i.invoice_id WHERE i.stage_id=p.stage_id AND (inv.status::text<>'draft' OR inv.financial_document_id IS NOT NULL)) ORDER BY sort_order,id LOOP
  n:=n-1; v:=CASE WHEN n=0 THEN target-used ELSE round(target*CASE WHEN weights=0 THEN 1.0/original_n ELSE r.amount_value/weights END,2) END;
  UPDATE pm_payment_schedule_items SET amount_value=v WHERE id=r.id; used:=used+v;
 END LOOP;
 PERFORM public.pm_invoice_regroup('pm_payment_schedule_items',s.project_id);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_reconcile_value(uuid,numeric,numeric) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_gantt_change_value(_stage uuid,_expected numeric,_value numeric,_reason text,_responsibility boolean,_client_agreed boolean DEFAULT false,_effective_month date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages; c public.pm_stages; old_total numeric; new_total numeric; m date;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR NOT public.pm_can_edit_gantt(s.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gantt-value:'||s.project_id::text,0));
 IF NOT _responsibility OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 240 THEN RAISE EXCEPTION 'Responsibility confirmation and a short reason are required'; END IF;
 IF _value IS NULL OR _value<0 OR _value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF (CASE WHEN s.stage_kind='retainer_monthly' THEN s.retainer_monthly_amount ELSE s.budget END) IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Value changed elsewhere; reload before confirming' USING ERRCODE='40001'; END IF;
 PERFORM set_config('pm.gantt_value_action','yes',true); PERFORM set_config('pm.gantt_value_reason',trim(_reason),true);
 IF s.stage_kind='retainer_monthly' THEN
  IF NOT _client_agreed THEN RAISE EXCEPTION 'Confirm whether the client agreed to the new retainer value'; END IF;
  m:=date_trunc('month',coalesce(_effective_month,current_date))::date;
  IF m<date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Retainer changes apply going forward only'; END IF;
  old_total:=s.budget; new_total:=s.budget;
  FOR c IN SELECT * FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month' AND start_date>=m ORDER BY start_date FOR UPDATE LOOP
   IF EXISTS(SELECT 1 FROM pm_payment_schedule_items WHERE stage_id=c.id AND (dates_frozen_at IS NOT NULL OR billing_status::text IN ('issued','paid','cancelled'))) THEN CONTINUE; END IF;
   PERFORM public.pm_gantt_reconcile_value(c.id,c.budget,_value);
   UPDATE pm_stages SET budget=_value,commercial_value_owned=true WHERE id=c.id;
   PERFORM public.pm_gantt_record_value(c,c.budget,_value,'retainer_month',trim(_reason),m);
   new_total:=new_total+_value-c.budget;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month') THEN new_total:=_value*coalesce(s.retainer_months,1); PERFORM public.pm_gantt_reconcile_value(s.id,old_total,new_total); END IF;
  UPDATE pm_stages SET retainer_monthly_amount=_value,budget=new_total,commercial_value_owned=true WHERE id=s.id;
  PERFORM public.pm_gantt_record_value(s,s.retainer_monthly_amount,_value,'retainer_value',trim(_reason),m);
 ELSE
  PERFORM public.pm_gantt_reconcile_value(s.id,s.budget,_value);
  UPDATE pm_stages SET budget=_value,budget_mode='fixed',commercial_value_owned=true WHERE id=s.id;
  PERFORM public.pm_gantt_record_value(s,s.budget,_value,'stage_value',trim(_reason));
 END IF;
 PERFORM set_config('pm.gantt_value_action','',true); PERFORM set_config('pm.gantt_value_reason','',true);
 RETURN jsonb_build_object('id',s.id,'value',_value);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_change_value(uuid,numeric,numeric,text,boolean,boolean,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_change_value(uuid,numeric,numeric,text,boolean,boolean,date) TO authenticated,service_role;
CREATE FUNCTION public.pm_gantt_extend_retainer(_stage uuid,_months integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages; child public.pm_stages; d date; n integer; old_budget numeric; next_order integer;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR s.stage_kind<>'retainer_monthly' OR NOT public.pm_can_edit_gantt(s.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _months IS NULL OR _months<1 OR _months>120 THEN RAISE EXCEPTION 'Invalid month count'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gantt-value:'||s.project_id::text,0));
 PERFORM set_config('pm.gantt_value_action','yes',true);
 SELECT coalesce(max(end_date),s.end_date),coalesce(max(sort_order),0) INTO d,next_order FROM pm_stages WHERE parent_stage_id=s.id AND stage_kind='retainer_month';
 old_budget:=s.budget;
 FOR n IN 1.._months LOOP
  d:=(date_trunc('month',d)+interval '1 month')::date;
  INSERT INTO pm_stages(project_id,parent_stage_id,name,budget,start_date,end_date,color,sort_order,stage_kind,is_self) VALUES(s.project_id,s.id,to_char(d,'YYYY-MM'),s.retainer_monthly_amount,d,(d+interval '1 month - 1 day')::date,s.color,next_order+n,'retainer_month',s.is_self) RETURNING * INTO child;
  INSERT INTO pm_payment_schedule_items(project_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,direction,generator_source,entity_id) VALUES(s.project_id,child.id,child.name,'stage_start','fixed',s.retainer_monthly_amount,d,d,'inflow','gantt_retainer',(SELECT entity_id FROM pm_invoice_settings WHERE singleton=true LIMIT 1));
  PERFORM public.pm_gantt_record_value(child,NULL,s.retainer_monthly_amount,'retainer_extension','Construction continued; additional retainer month',d);
 END LOOP;
 UPDATE pm_stages SET budget=old_budget+_months*s.retainer_monthly_amount,retainer_months=coalesce(s.retainer_months,0)+_months,end_date=(d+interval '1 month - 1 day')::date,commercial_value_owned=true WHERE id=s.id;
 PERFORM set_config('pm.gantt_value_action','',true);
 RETURN jsonb_build_object('monthsAdded',_months);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_extend_retainer(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_extend_retainer(uuid,integer) TO authenticated,service_role;