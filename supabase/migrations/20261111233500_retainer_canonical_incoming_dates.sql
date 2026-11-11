CREATE OR REPLACE FUNCTION public.pm_retainer_month_date(_start date,_index integer,_relative boolean DEFAULT false) RETURNS date LANGUAGE plpgsql STABLE SET search_path=public AS $$ DECLARE d date:=CASE WHEN _index=0 THEN _start ELSE (date_trunc('month',_start)+make_interval(months=>_index))::date END; BEGIN WHILE extract(isodow FROM d)>5 OR (NOT _relative AND EXISTS(SELECT 1 FROM holidays WHERE data=d)) LOOP d:=d+1; END LOOP; RETURN d; END $$;
DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_incoming_resolve(uuid)'::regprocedure) INTO body;
 body:=replace(body,'v_invoice:=public.pm_calendar_shift((date_trunc(''month'',v_stage.start_date)+make_interval(months=>v_month))::date,0);','v_invoice:=CASE WHEN v_stage.stage_kind=''retainer_month'' THEN public.pm_retainer_month_date(v_stage.start_date,0,false) ELSE public.pm_retainer_month_date(v_stage.start_date,v_month,false) END;');
 EXECUTE body;
 SELECT pg_get_functiondef('public.pm_retainer_sync()'::regprocedure) INTO body;
 body:=replace(body,'ELSIF p.dates_frozen_at IS NULL','ELSIF p.dates_frozen_at IS NULL');
 body:=replace(body,'WHERE (p1.stage_id=child.id OR (p1.stage_id=NEW.id AND p1.trigger_type::text=''monthly'' AND coalesce(p1.timing_month_index,p1.sort_order)=i))','WHERE (p1.stage_id=child.id OR (p1.stage_id=NEW.id AND p1.trigger_type::text=''monthly'' AND coalesce(p1.timing_month_index,(SELECT count(*) FROM pm_payment_schedule_items prior WHERE prior.stage_id=NEW.id AND prior.trigger_type::text=''monthly'' AND (prior.sort_order,prior.id)<(p1.sort_order,p1.id)))=i))');
 EXECUTE body;
END $$;