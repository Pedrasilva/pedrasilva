CREATE OR REPLACE FUNCTION public.pm_quote_preview_payment_date(_quote uuid, _start date, _item uuid, _stages jsonb, _payment boolean DEFAULT false)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO public AS $function$
DECLARE v_item public.quote_payment_schedule_items; v_original date; v_mapped date; v_stage jsonb; v_original_start date; v_month_index integer;
BEGIN
 SELECT * INTO v_item FROM public.quote_payment_schedule_items WHERE id=_item AND quote_id=_quote;
 v_original:=CASE WHEN _payment THEN v_item.expected_payment_date ELSE v_item.expected_invoice_date END;
 IF coalesce(v_item.manual_override,false) OR v_item.trigger_type::text='manual_date' THEN RETURN v_original; END IF;
 v_original:=v_item.expected_invoice_date;
 SELECT value INTO v_stage FROM jsonb_array_elements(_stages) WHERE value->>'id'=v_item.stage_id::text;
 IF v_item.trigger_type::text='project_start' THEN v_mapped:=_start;
 ELSIF v_item.trigger_type::text='stage_start' THEN v_mapped:=(v_stage->>'start_date')::date;
 ELSIF v_item.trigger_type::text='stage_end' THEN v_mapped:=(v_stage->>'end_date')::date;
 ELSIF v_item.trigger_type::text='monthly' AND v_stage->>'stage_kind'='retainer_monthly' THEN
  SELECT count(*)::integer INTO v_month_index FROM public.quote_payment_schedule_items sibling
  WHERE sibling.quote_id=_quote AND sibling.stage_id=v_item.stage_id AND sibling.trigger_type::text='monthly'
    AND coalesce(sibling.direction,'inflow')=coalesce(v_item.direction,'inflow')
    AND (coalesce(sibling.sort_order,0),sibling.id)<(coalesce(v_item.sort_order,0),v_item.id);
  v_mapped:=public.pm_calendar_shift((date_trunc('month',(v_stage->>'start_date')::date)+make_interval(months=>v_month_index))::date,0);
 ELSIF v_item.trigger_type::text='monthly' AND v_original IS NOT NULL THEN
  SELECT min((value->>'start_date')::date) INTO v_original_start FROM public.quote_relative_schedules r CROSS JOIN LATERAL jsonb_array_elements(r.original_dates->'stages') WHERE r.quote_id=_quote;
  v_original_start:=coalesce(v_original_start,(SELECT min(start_date) FROM public.quote_stages WHERE quote_id=_quote));
  v_mapped:=(date_trunc('month',_start)+make_interval(months=>((extract(year FROM v_original)-extract(year FROM v_original_start))*12+extract(month FROM v_original)-extract(month FROM v_original_start))::integer))::date;
 ELSE v_mapped:=public.pm_quote_payment_date(_quote,_start,v_original,false);
 END IF;
 IF _payment THEN RETURN v_mapped+coalesce(v_item.payment_offset_days,coalesce(v_item.expected_payment_date-v_item.expected_invoice_date,0)); END IF;
 RETURN v_mapped;
END $function$;