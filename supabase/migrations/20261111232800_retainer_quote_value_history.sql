CREATE TABLE public.quote_retainer_value_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),quote_id uuid NOT NULL,stage_id uuid NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),old_value numeric NOT NULL,new_value numeric NOT NULL,reason text NOT NULL);
GRANT SELECT ON public.quote_retainer_value_history TO authenticated;
GRANT ALL ON public.quote_retainer_value_history TO service_role;
REVOKE TRUNCATE ON public.quote_retainer_value_history FROM anon,authenticated;
ALTER TABLE public.quote_retainer_value_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrator retainer value history" ON public.quote_retainer_value_history FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') AND public.is_psa_staff());
CREATE OR REPLACE FUNCTION public.quote_retainer_change_value(_stage uuid,_expected numeric,_value numeric,_reason text,_responsibility boolean,_client_agreed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.quote_stages;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM quote_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR s.stage_kind<>'retainer_monthly' OR NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=s.quote_id AND NOT is_locked AND pm_project_id IS NULL) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
 IF _client_agreed IS DISTINCT FROM true OR _responsibility IS DISTINCT FROM true OR length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 240 THEN RAISE EXCEPTION 'Responsibility confirmation and a short reason are required'; END IF;
 IF _value IS NULL OR _value<0 OR _value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Stage value must be non-negative'; END IF;
 IF s.retainer_monthly_amount IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Value changed elsewhere; reload before confirming' USING ERRCODE='40001'; END IF;
 PERFORM set_config('quote.retainer_value_action','yes',true);
 UPDATE quote_stages SET retainer_monthly_amount=_value WHERE id=_stage;
 INSERT INTO quote_retainer_value_history(quote_id,stage_id,actor,old_value,new_value,reason) VALUES(s.quote_id,s.id,auth.uid(),_expected,_value,trim(_reason));
 PERFORM set_config('quote.retainer_value_action','',true);
END $$;
REVOKE ALL ON FUNCTION public.quote_retainer_change_value(uuid,numeric,numeric,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_retainer_change_value(uuid,numeric,numeric,text,boolean,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.quote_retainer_value_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND NEW.stage_kind='retainer_monthly' AND NEW.retainer_monthly_amount IS DISTINCT FROM OLD.retainer_monthly_amount AND coalesce(current_setting('quote.retainer_value_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Confirm whether the client agreed to the new retainer value' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_retainer_value_guard BEFORE UPDATE OF retainer_monthly_amount ON public.quote_stages FOR EACH ROW EXECUTE FUNCTION public.quote_retainer_value_guard();
CREATE OR REPLACE FUNCTION public.quote_retainer_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commercial history is append-only'; END $$;
CREATE TRIGGER quote_retainer_history_immutable BEFORE UPDATE OR DELETE ON public.quote_retainer_value_history FOR EACH ROW EXECUTE FUNCTION public.quote_retainer_history_immutable();
-- Scheduling reads use retainer parents; monthly children retain historical allocations independently.
DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_gantt_state(text,uuid)'::regprocedure) INTO body;
 body:=replace(body,'FROM pm_stages WHERE project_id=_scope)','FROM pm_stages WHERE project_id=_scope AND stage_kind<>''retainer_month'')');
 EXECUTE body;
END $$;