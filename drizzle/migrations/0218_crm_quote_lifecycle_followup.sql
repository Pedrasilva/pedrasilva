-- Display unsent content without changing proposal records.
DO $patch$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.crm_quote_lifecycle(uuid)'::regprocedure) INTO v_definition;
 v_definition := replace(v_definition, '''missing'',v_missing);', '''missing'',v_missing,''latestSentMatchesCurrent'',CASE WHEN v_sent.id IS NULL THEN false ELSE public.crm_quote_snapshot_matches(_quote,v_sent.id) END,''currentRevision'',CASE WHEN v_sent.id IS NULL THEN greatest(coalesce(v_quote.revision_number,1)-1,0) WHEN public.crm_quote_snapshot_matches(_quote,v_sent.id) THEN v_sent.rev_number ELSE greatest(coalesce(v_quote.revision_number,1)-1,v_sent.rev_number+1) END);');
 IF strpos(v_definition,'''latestSentMatchesCurrent''')=0 THEN RAISE EXCEPTION 'Lifecycle display patch anchor missing'; END IF;
 EXECUTE v_definition;
END $patch$;
CREATE OR REPLACE FUNCTION public.crm_opportunity_quote_stage_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_stage public.crm_opportunity_stage; v_quote_id uuid; v_previous text;
BEGIN
 IF NEW.stage='lost' AND OLD.stage IS DISTINCT FROM NEW.stage AND pg_trigger_depth()=1 THEN
  IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.fee_proposals q WHERE q.opportunity_id=NEW.id AND q.pm_project_id IS NOT NULL AND q.archived_at IS NULL AND q.deleted_at IS NULL) THEN RAISE EXCEPTION 'Converted opportunity cannot be marked lost'; END IF;
  v_previous:=current_setting('app.crm_opportunity_losing',true);
  PERFORM set_config('app.crm_opportunity_losing',NEW.id::text,true);
  FOR v_quote_id IN SELECT q.id FROM public.fee_proposals q WHERE q.opportunity_id=NEW.id AND q.archived_at IS NULL AND q.deleted_at IS NULL AND q.pm_project_id IS NULL AND q.quote_status<>'rejected' ORDER BY q.id FOR UPDATE LOOP
   PERFORM public.crm_quote_transition(v_quote_id,'lose');
  END LOOP;
  PERFORM set_config('app.crm_opportunity_losing',coalesce(v_previous,''),true);
  RETURN NEW;
 END IF;
 v_stage:=public.crm_quote_opportunity_stage(NEW.id);
 IF v_stage IS NOT NULL THEN NEW.stage:=v_stage; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.sync_opportunity_stage_from_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_stage public.crm_opportunity_stage;
BEGIN
 v_id:=COALESCE(NEW.opportunity_id,OLD.opportunity_id);
 IF current_setting('app.crm_opportunity_losing',true)=v_id::text THEN RETURN COALESCE(NEW,OLD); END IF;
 v_stage:=public.crm_quote_opportunity_stage(v_id);
 IF v_stage IS NOT NULL THEN UPDATE public.crm_opportunities SET stage=v_stage WHERE id=v_id AND stage IS DISTINCT FROM v_stage; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;