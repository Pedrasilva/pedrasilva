-- No existing rows are updated: synchronization runs only on explicit future edits.
CREATE OR REPLACE FUNCTION public.pm_retainer_month_date(_start date,_index integer,_relative boolean DEFAULT false) RETURNS date LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE d date:=(_start+make_interval(months=>_index))::date;
BEGIN
 WHILE extract(isodow FROM d)>5 OR (NOT _relative AND EXISTS(SELECT 1 FROM holidays WHERE data=d)) LOOP d:=d+1; END LOOP;
 RETURN d;
END $$;
CREATE OR REPLACE FUNCTION public.pm_retainer_prepare() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE n integer; relative boolean;
BEGIN
 IF NEW.stage_kind<>'retainer_monthly' THEN RETURN NEW; END IF;
 relative:=TG_TABLE_NAME='quote_stages';
 IF TG_OP='UPDATE' AND NEW.end_date IS DISTINCT FROM OLD.end_date AND NEW.retainer_months IS NOT DISTINCT FROM OLD.retainer_months THEN
  n:=greatest(1,round((NEW.end_date-NEW.start_date+1)/30.4375)::integer); NEW.retainer_months:=n;
 END IF;
 NEW.retainer_months:=greatest(1,coalesce(NEW.retainer_months,12));
 NEW.retainer_anchor_month:=NEW.start_date;
 NEW.end_date:=(NEW.start_date+make_interval(months=>NEW.retainer_months)-interval '1 day')::date;
 IF relative AND coalesce(NEW.is_fee_only,true) THEN NEW.budget:=coalesce(NEW.retainer_monthly_amount,0)*NEW.retainer_months; NEW.sale_source:='budget'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retainer_prepare BEFORE INSERT OR UPDATE OF start_date,end_date,retainer_months,retainer_monthly_amount ON public.quote_stages FOR EACH ROW EXECUTE FUNCTION public.pm_retainer_prepare();
CREATE TRIGGER retainer_prepare BEFORE INSERT OR UPDATE OF start_date,end_date,retainer_months ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_retainer_prepare();
CREATE OR REPLACE FUNCTION public.pm_retainer_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i integer; d date; child public.pm_stages; p record; amount numeric; total numeric:=0; previous_action text:=coalesce(current_setting('pm.gantt_value_action',true),'');
BEGIN
 IF NEW.stage_kind<>'retainer_monthly' OR pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='quote_stages' THEN
  DELETE FROM quote_payment_schedule_items WHERE stage_id=NEW.id AND generator_source='gantt_retainer' AND sort_order>=NEW.retainer_months AND NOT coalesce(manual_override,false);
  FOR i IN 0..NEW.retainer_months-1 LOOP
   d:=public.pm_retainer_month_date(NEW.start_date,i,true);
   SELECT id INTO p FROM quote_payment_schedule_items WHERE stage_id=NEW.id AND trigger_type::text='monthly' ORDER BY sort_order,id OFFSET i LIMIT 1;
   IF p.id IS NULL THEN
    INSERT INTO quote_payment_schedule_items(quote_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,sort_order,generator_source,direction,payment_offset_days,payment_terms)
    VALUES(NEW.quote_id,NEW.id,NEW.name,'monthly','fixed',coalesce(NEW.retainer_monthly_amount,0),d,d,i,'gantt_retainer','inflow',0,'0');
   ELSE
    UPDATE quote_payment_schedule_items SET expected_invoice_date=d,expected_payment_date=d,amount_value=CASE WHEN generator_source='gantt_retainer' THEN coalesce(NEW.retainer_monthly_amount,0) ELSE amount_value END WHERE id=p.id AND NOT coalesce(manual_override,false);
   END IF;
  END LOOP;
 ELSE
  PERFORM set_config('pm.gantt_value_action','yes',true);
  IF TG_OP='UPDATE' AND NEW.retainer_months<coalesce(OLD.retainer_months,0) THEN RAISE EXCEPTION 'Retainer shortening requires review of monthly history'; END IF;
  FOR i IN 0..NEW.retainer_months-1 LOOP
   d:=public.pm_retainer_month_date(NEW.start_date,i,false);
   SELECT * INTO child FROM pm_stages WHERE parent_stage_id=NEW.id AND stage_kind='retainer_month' ORDER BY sort_order,id OFFSET i LIMIT 1;
   IF child.id IS NULL THEN
    INSERT INTO pm_stages(project_id,parent_stage_id,name,start_date,end_date,budget,sort_order,stage_kind,is_self,color)
    VALUES(NEW.project_id,NEW.id,NEW.name||' '||(i+1),d,(NEW.start_date+make_interval(months=>i+1)-interval '1 day')::date,NEW.retainer_monthly_amount,i,'retainer_month',true,NEW.color) RETURNING * INTO child;
    IF TG_OP='UPDATE' THEN PERFORM pm_gantt_record_value(child,NULL,child.budget,'retainer_extension','Construction continued; additional retainer month',d); END IF;
   END IF;
   total:=total+child.budget;
   SELECT p1.* INTO p FROM pm_payment_schedule_items p1 WHERE (p1.stage_id=child.id OR (p1.stage_id=NEW.id AND p1.trigger_type::text='monthly' AND coalesce(p1.timing_month_index,p1.sort_order)=i)) AND p1.direction='inflow' ORDER BY p1.sort_order,p1.id LIMIT 1;
   IF p.id IS NULL THEN
    INSERT INTO pm_payment_schedule_items(project_id,stage_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,sort_order,generator_source,direction,timing_month_index,payment_terms,entity_id)
    VALUES(NEW.project_id,child.id,NEW.name||' '||(i+1),'monthly','fixed',child.budget,d,d,i,'gantt_retainer','inflow',i,'0',(SELECT entity_id FROM pm_invoice_settings WHERE singleton=true LIMIT 1));
   ELSIF p.dates_frozen_at IS NULL AND p.billing_status::text NOT IN ('issued','paid','cancelled') AND NOT EXISTS(SELECT 1 FROM financial_document_lines l JOIN financial_documents f ON f.id=l.document_id WHERE l.payment_schedule_item_id=p.id AND f.status::text NOT IN ('draft','cancelled')) THEN
    UPDATE pm_payment_schedule_items SET expected_invoice_date=d,expected_payment_date=d WHERE id=p.id;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM pm_time_entries WHERE pm_stage_id=child.id) THEN UPDATE pm_stages SET start_date=d,end_date=(NEW.start_date+make_interval(months=>i+1)-interval '1 day')::date WHERE id=child.id; END IF;
  END LOOP;
  UPDATE pm_stages SET budget=total WHERE id=NEW.id AND budget IS DISTINCT FROM total;
  PERFORM set_config('pm.gantt_value_action',previous_action,true);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retainer_sync AFTER INSERT OR UPDATE OF start_date,end_date,retainer_months,retainer_monthly_amount ON public.quote_stages FOR EACH ROW EXECUTE FUNCTION public.pm_retainer_sync();
CREATE TRIGGER retainer_sync AFTER INSERT OR UPDATE OF start_date,end_date,retainer_months ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_retainer_sync();
CREATE OR REPLACE FUNCTION public.pm_retainer_create(_mode text,_scope uuid,_name text,_group_name text,_months integer DEFAULT 12,_amount numeric DEFAULT 0) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent uuid; predecessor uuid; d date; result uuid; ord integer;
BEGIN
 IF auth.uid() IS NULL OR NOT is_psa_staff() OR (_mode='quote' AND NOT has_role(auth.uid(),'admin')) OR (_mode='project' AND NOT pm_can_edit_gantt(_scope)) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _mode NOT IN ('quote','project') OR _months NOT BETWEEN 1 AND 120 OR _amount<0 OR length(trim(_name))=0 THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('gantt:'||_mode||':'||_scope::text,0)) THEN RAISE EXCEPTION 'gantt.schedule.busy'; END IF;
 IF _mode='quote' THEN
  IF NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope AND NOT is_locked AND pm_project_id IS NULL) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
  SELECT id INTO parent FROM quote_stages WHERE quote_id=_scope AND parent_stage_id IS NULL AND name IN ('Construction','Obra',_group_name) ORDER BY sort_order LIMIT 1;
  SELECT id,end_date INTO predecessor,d FROM quote_stages s WHERE quote_id=_scope AND stage_kind='regular' AND coalesce(stage_role,'architecture')='architecture' AND coalesce(is_self,true) AND NOT EXISTS(SELECT 1 FROM quote_stages c WHERE c.parent_stage_id=s.id) AND (parent IS NULL OR parent_stage_id IS DISTINCT FROM parent) ORDER BY end_date DESC,sort_order DESC LIMIT 1;
  d:=public.pm_retainer_month_date(coalesce(d+1,'2000-01-03'::date),0,true);
  SELECT coalesce(max(sort_order),0)+10 INTO ord FROM quote_stages WHERE quote_id=_scope;
  IF parent IS NULL THEN INSERT INTO quote_stages(quote_id,name,start_date,end_date,budget,sort_order,stage_role,is_self) VALUES(_scope,_group_name,d,d,0,ord,'architecture',true) RETURNING id INTO parent; END IF;
  INSERT INTO quote_stages(quote_id,parent_stage_id,name,start_date,end_date,budget,sort_order,stage_kind,billing_model,retainer_months,retainer_monthly_amount,is_fee_only,sale_source,is_self,stage_role)
  VALUES(_scope,parent,_name,d,d,_amount*_months,ord+10,'retainer_monthly','retainer',_months,_amount,true,'budget',true,'architecture') RETURNING id INTO result;
  IF predecessor IS NOT NULL THEN INSERT INTO quote_stage_dependencies(quote_id,predecessor_stage_id,successor_stage_id,type,lag_days) VALUES(_scope,predecessor,result,'FS',0); END IF;
 ELSE
  SELECT id INTO parent FROM pm_stages WHERE project_id=_scope AND parent_stage_id IS NULL AND name IN ('Construction','Obra',_group_name) ORDER BY sort_order LIMIT 1;
  SELECT id,end_date INTO predecessor,d FROM pm_stages s WHERE project_id=_scope AND stage_kind='regular' AND coalesce(stage_role,'architecture')='architecture' AND coalesce(is_self,true) AND NOT EXISTS(SELECT 1 FROM pm_stages c WHERE c.parent_stage_id=s.id) AND (parent IS NULL OR parent_stage_id IS DISTINCT FROM parent) ORDER BY end_date DESC,sort_order DESC LIMIT 1;
  d:=public.pm_retainer_month_date(coalesce(d+1,(SELECT start_date FROM pm_projects WHERE id=_scope),current_date),0,false);
  SELECT coalesce(max(sort_order),0)+10 INTO ord FROM pm_stages WHERE project_id=_scope;
  IF parent IS NULL THEN INSERT INTO pm_stages(project_id,name,start_date,end_date,budget,sort_order,stage_role,is_self) VALUES(_scope,_group_name,d,d,0,ord,'client',true) RETURNING id INTO parent; END IF;
  INSERT INTO pm_stages(project_id,parent_stage_id,name,start_date,end_date,budget,sort_order,stage_kind,billing_model,retainer_months,retainer_monthly_amount,is_fee_only,is_self,stage_role)
  VALUES(_scope,parent,_name,d,d,_amount*_months,ord+10,'retainer_monthly','retainer',_months,_amount,true,true,'architecture') RETURNING id INTO result;
  IF predecessor IS NOT NULL THEN INSERT INTO pm_stage_dependencies(predecessor_id,successor_id,type,lag_days) VALUES(predecessor,result,'FS',0); END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pm_retainer_create(text,uuid,text,text,integer,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_retainer_create(text,uuid,text,text,integer,numeric) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.pm_retainer_sync() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pm_retainer_prepare() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_quote_calendar_stages(uuid,date)'::regprocedure) INTO body;
 body:=replace(body,'best_start:=date_trunc(''month'',best_start)::date;','best_start:=pm_calendar_shift(best_start,0);');
 EXECUTE body;
 SELECT pg_get_functiondef('public.pm_quote_preview_payment_date(uuid,date,uuid,jsonb,boolean)'::regprocedure) INTO body;
 body:=replace(body,'public.pm_calendar_shift((date_trunc(''month'',(v_stage->>''start_date'')::date)+make_interval(months=>v_month_index))::date,0)','public.pm_retainer_month_date((v_stage->>''start_date'')::date,v_month_index,false)');
 EXECUTE body;
END $$;