-- D41: additive calculator links; existing quotes/data and B1 unchanged.
ALTER TABLE public.quote_stages ADD COLUMN IF NOT EXISTS calculator_row_id text;
ALTER TABLE public.quote_stages ADD COLUMN IF NOT EXISTS calculator_last_value numeric;
ALTER TABLE public.quote_stages ADD COLUMN IF NOT EXISTS calculator_payment_unconfigured boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS quote_stage_calculator_row ON public.quote_stages(quote_id,calculator_row_id) WHERE calculator_row_id IS NOT NULL;
COMMENT ON COLUMN public.quote_stages.calculator_row_id IS 'Stable row key in fee_proposals.project_fee_calculation.stages; NULL means not calculator-owned.';
CREATE OR REPLACE FUNCTION public.quote_stage_snapshot_insert(_row jsonb,_quote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;cols text;vals text;
BEGIN
 r:=_row||jsonb_build_object('quote_id',_quote);
 IF r->>'date_mode'='relative' THEN r:=r||jsonb_build_object('date_mode','calculated');END IF;
 SELECT string_agg(quote_ident(e.key),','),string_agg(format('(jsonb_populate_record(NULL::public.quote_stages,$1)).%I',e.key),',') INTO cols,vals FROM jsonb_each(r) e JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name='quote_stages' AND c.column_name=e.key AND c.is_generated='NEVER';
 EXECUTE 'INSERT INTO public.quote_stages ('||cols||') SELECT '||vals USING r;
END $$;
REVOKE ALL ON FUNCTION public.quote_stage_snapshot_insert(jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.quote_template_insert_rows(_table text,_rows jsonb,_ids jsonb,_quote uuid,_keep_ids boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;cols text;vals text;key_name text;field_value jsonb;
BEGIN
 IF NOT(_table=ANY(ARRAY['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_stage_supplier_costs','quote_supplier_markups','quote_supplier_phase_splits','quote_site_trips','quote_billable_hourly_rates','quote_payment_schedule_items','psa_proposal_blocks'])) THEN RAISE EXCEPTION 'Invalid snapshot table';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_rows,'[]')) LOOP IF NOT _keep_ids THEN r:=public.quote_template_rewrite(r,_ids,false);END IF;IF _table<>'psa_proposal_blocks' THEN r:=r||jsonb_build_object('quote_id',_quote);END IF;
 IF _table='quote_stages' THEN PERFORM public.quote_stage_snapshot_insert(r,_quote);CONTINUE;END IF;
 cols:=NULL;vals:=NULL;FOR key_name,field_value IN SELECT e.key,e.value FROM jsonb_each(r) e JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=_table AND c.column_name=e.key WHERE c.is_generated='NEVER' LOOP cols:=concat_ws(',',cols,quote_ident(key_name));vals:=concat_ws(',',vals,format('(jsonb_populate_record(NULL::public.%I,$1)).%I',_table,key_name));END LOOP;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s',_table,cols,vals) USING r;END LOOP;
END $$;
CREATE TABLE public.quote_planning_defaults(id boolean PRIMARY KEY DEFAULT true CHECK(id),stage_start_percent numeric,stage_end_percent numeric,updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.quote_planning_defaults TO authenticated;
GRANT ALL ON public.quote_planning_defaults TO service_role;
REVOKE ALL ON public.quote_planning_defaults FROM anon;
REVOKE TRUNCATE ON public.quote_planning_defaults FROM anon,authenticated;
ALTER TABLE public.quote_planning_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_planning_defaults_admin ON public.quote_planning_defaults FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK(public.has_role(auth.uid(),'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.quote_calculator_value(_inputs jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE c numeric;f numeric;l numeric;p numeric;cat int;
BEGIN
 c:=coalesce(nullif((_inputs->>'constructionValue')::numeric,0),(_inputs->>'area')::numeric*(_inputs->>'costPerSqm')::numeric,0);
 f:=c*(1-0.008+coalesce((_inputs->>'heritageUplift')::numeric,0)+coalesce((_inputs->>'extensionUplift')::numeric,0));cat:=coalesce((_inputs->>'category')::int,3);
 IF f<=0 THEN RAISE EXCEPTION 'Calculator fee must be positive';END IF;
 IF f>5985574.76 THEN p:=CASE WHEN cat=2 THEN 1.21+2.5*sqrt(5985574.76/f) ELSE 1.5+3.2*sqrt(5985574.76/f) END;
 ELSE l:=log(f/59.85);p:=CASE WHEN cat=2 THEN 11.16841-1.96841*l+7.80462/l+0.000008*f/59.85 ELSE 8.97879-1.49598*l+13.44813/l+0.000005*f/59.85 END;END IF;
 RETURN round(f*p/100*(1-least(1,greatest(0,coalesce((_inputs->>'discount')::numeric,0)))));
END $$;
CREATE OR REPLACE FUNCTION public.quote_calculator_preview(_quote_id uuid,_row_ids jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.fee_proposals;b jsonb;existing jsonb;manual jsonb;removed jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM public.fee_proposals WHERE id=_quote_id;IF NOT FOUND OR q.is_locked OR q.pm_project_id IS NOT NULL OR q.locked_project_id IS NOT NULL OR q.quote_status<>'draft' THEN RAISE EXCEPTION 'Calculator requires an editable unconverted draft';END IF;
 b:=public.quote_template_capture(_quote_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) ORDER BY sort_order),'[]') INTO existing FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NULL AND stage_role='architecture' AND stage_kind='regular' AND phase_group<>'construction' AND archived_at IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order,'value',budget,'previous',calculator_last_value) ORDER BY sort_order),'[]') INTO manual FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NOT NULL AND _row_ids ? calculator_row_id AND budget IS DISTINCT FROM calculator_last_value;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'sort_order',sort_order) ORDER BY sort_order),'[]') INTO removed FROM public.quote_stages WHERE quote_id=_quote_id AND calculator_row_id IS NOT NULL AND NOT(_row_ids ? calculator_row_id);
 RETURN jsonb_build_object('revision',md5(b::text),'existing',existing,'manual',manual,'removed',removed,'paymentDefaults',(SELECT to_jsonb(d) FROM public.quote_planning_defaults d WHERE id));
END $$;
CREATE OR REPLACE FUNCTION public.quote_apply_calculator(_quote_id uuid,_inputs jsonb,_revision text,_existing_action text DEFAULT 'cancel',_overwrite_manual boolean DEFAULT false,_delete_removed boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.fee_proposals;b jsonb;preview jsonb;fee numeric;rows jsonb;row jsonb;keys jsonb;largest text;remainder numeric;sid uuid;previous_id uuid;next_date date;finish date;ordering int;value numeric;operation uuid;start_pct numeric;end_pct numeric;defaults public.quote_planning_defaults;delete_ids uuid[];removed_ids uuid[];c numeric;p numeric;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM public.fee_proposals WHERE id=_quote_id FOR UPDATE;IF NOT FOUND OR q.is_locked OR q.pm_project_id IS NOT NULL OR q.locked_project_id IS NOT NULL OR q.quote_status<>'draft' THEN RAISE EXCEPTION 'Calculator requires an editable unconverted draft';END IF;
 b:=public.quote_template_capture(_quote_id);IF md5(b::text) IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'Quote changed; review replacement again';END IF;
 rows:=_inputs->'stages';IF jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE length(trim(coalesce(r->>'name','')))=0 OR coalesce((r->>'percentage')::numeric,-1)<0 OR coalesce(r->>'id','')='') OR (SELECT abs(sum((r->>'percentage')::numeric)-1) FROM jsonb_array_elements(rows) r)>0.000001 OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(rows) r)<>jsonb_array_length(rows) THEN RAISE EXCEPTION 'Calculator rows need names, unique keys and percentages totalling 100';END IF;
 SELECT jsonb_agg(r->>'id') INTO keys FROM jsonb_array_elements(rows) r;preview:=public.quote_calculator_preview(_quote_id,keys);
 IF jsonb_array_length(preview->'existing')>0 AND _existing_action NOT IN('replace','add') THEN RAISE EXCEPTION 'Confirm replace or add architecture stages';END IF;
 IF jsonb_array_length(preview->'manual')>0 AND NOT _overwrite_manual THEN RAISE EXCEPTION 'Confirm overwrite of manually changed calculator values';END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.quote_calculator_value(jsonb),public.quote_calculator_preview(uuid,jsonb),public.quote_apply_calculator(uuid,jsonb,text,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_calculator_preview(uuid,jsonb),public.quote_apply_calculator(uuid,jsonb,text,text,boolean,boolean) TO authenticated,service_role;