-- Relative dates use the existing calculated/fixed planner mode, not a new enum.
CREATE OR REPLACE FUNCTION public.quote_template_insert_rows(_table text,_rows jsonb,_ids jsonb,_quote uuid,_keep_ids boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;cols text;vals text;key_name text;field_value jsonb;
BEGIN
 IF NOT(_table=ANY(ARRAY['quote_stages','quote_stage_dependencies','quote_allocations','quote_external_services','quote_stage_supplier_costs','quote_supplier_markups','quote_supplier_phase_splits','quote_site_trips','quote_billable_hourly_rates','quote_payment_schedule_items','psa_proposal_blocks'])) THEN RAISE EXCEPTION 'Invalid snapshot table';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_rows,'[]')) LOOP IF NOT _keep_ids THEN r:=public.quote_template_rewrite(r,_ids,false);END IF;IF _table<>'psa_proposal_blocks' THEN r:=r||jsonb_build_object('quote_id',_quote);END IF;
 IF _table='quote_stages' AND r->>'date_mode'='relative' THEN r:=r||jsonb_build_object('date_mode','calculated');END IF;
 cols:=NULL;vals:=NULL;FOR key_name,field_value IN SELECT e.key,e.value FROM jsonb_each(r) e JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=_table AND c.column_name=e.key WHERE c.is_generated='NEVER' LOOP cols:=concat_ws(',',cols,quote_ident(key_name));vals:=concat_ws(',',vals,format('(jsonb_populate_record(NULL::public.%I,$1)).%I',_table,key_name));END LOOP;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s',_table,cols,vals) USING r;END LOOP;
END $$;