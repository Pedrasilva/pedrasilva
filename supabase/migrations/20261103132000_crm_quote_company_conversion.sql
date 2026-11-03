-- Linkage and bookkeeping are excluded from commercial acceptance evidence.
CREATE OR REPLACE FUNCTION public.crm_quote_content_hash(_quote uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT md5(jsonb_build_object(
 'quote',(SELECT to_jsonb(q)-ARRAY['company_id','account_id','opportunity_id','created_at','quote_status','is_locked','locked_at','locked_project_id','pm_project_id','approved_at','signed_at','signed_method','signed_notes','updated_at','accepted_snapshot_id','acceptance_date','acceptance_note','acceptance_attachment_path','acceptance_actor','accepted_content_hash'] FROM fee_proposals q WHERE id=_quote),
 'stages',(SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','updated_at'] ORDER BY s.id) FROM quote_stages s WHERE s.quote_id=_quote),
 'payments',(SELECT jsonb_agg(to_jsonb(p)-ARRAY['created_at','updated_at'] ORDER BY p.id) FROM quote_payment_schedule_items p WHERE p.quote_id=_quote),
 'blocks',(SELECT jsonb_agg(to_jsonb(b)-ARRAY['created_at','updated_at'] ORDER BY b.id) FROM psa_proposal_blocks b JOIN psa_proposals p ON p.id=b.proposal_id WHERE p.quote_id=_quote))::text)
$$;
DO $patch$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.crm_quote_snapshot_matches(uuid,uuid)'::regprocedure) INTO v_definition;
 v_definition:=replace(v_definition,'''quote_status'',''is_locked''','''company_id'',''account_id'',''opportunity_id'',''created_at'',''quote_status'',''is_locked''');
 v_definition:=replace(v_definition,'to_jsonb(r)-''updated_at''','to_jsonb(r)-ARRAY[''created_at'',''updated_at'']');
 v_definition:=replace(v_definition,'value-''updated_at''','value-ARRAY[''created_at'',''updated_at'']');
 v_definition:=replace(v_definition,'to_jsonb(b)-''updated_at''','to_jsonb(b)-ARRAY[''created_at'',''updated_at'']');
 IF strpos(v_definition,'''company_id''')=0 THEN RAISE EXCEPTION 'Snapshot linkage anchor missing'; END IF;
 EXECUTE v_definition;
 SELECT pg_get_functiondef('public.crm_quote_lifecycle(uuid)'::regprocedure) INTO v_definition;
 IF strpos(v_definition,'IF v_quote.company_id IS NULL THEN')=0 THEN RAISE EXCEPTION 'Lifecycle company anchor missing'; END IF;
 v_definition:=replace(v_definition,'IF v_quote.company_id IS NULL THEN','IF coalesce(v_quote.company_id,(SELECT o.company_id FROM public.crm_opportunities o WHERE o.id=v_quote.opportunity_id)) IS NULL THEN');
 EXECUTE v_definition;
 SELECT pg_get_functiondef('public.pm_convert_relative_quote(uuid,date,text)'::regprocedure) INTO v_definition;
 IF strpos(v_definition,'IF q.company_id IS NULL THEN')=0 OR strpos(v_definition,'IF q.accepted_content_hash IS DISTINCT FROM crm_quote_content_hash(_quote) THEN RAISE EXCEPTION ''Accepted content changed''; END IF;')=0 THEN RAISE EXCEPTION 'Conversion guard anchors missing'; END IF;
 v_definition:=replace(v_definition,'IF q.company_id IS NULL THEN','q.company_id:=coalesce(q.company_id,(SELECT o.company_id FROM public.crm_opportunities o WHERE o.id=q.opportunity_id FOR SHARE)); IF q.company_id IS NULL THEN');
 -- Strict normalized sent-snapshot comparison is authoritative. Historical hashes
 -- used the old normalization and must not be rewritten or invalidate acceptance.
 v_definition:=replace(v_definition,'IF q.accepted_content_hash IS DISTINCT FROM crm_quote_content_hash(_quote) THEN RAISE EXCEPTION ''Accepted content changed''; END IF;','');
 v_definition:=replace(v_definition,'INSERT INTO pm_projects(name,status,start_date,company_id','UPDATE public.fee_proposals SET company_id=q.company_id WHERE id=_quote AND company_id IS DISTINCT FROM q.company_id; INSERT INTO pm_projects(name,status,start_date,company_id');
 EXECUTE v_definition;
END $patch$;
CREATE OR REPLACE FUNCTION public.crm_opportunity_propagate_company() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
  UPDATE public.fee_proposals q SET company_id=NEW.company_id
  WHERE q.opportunity_id=NEW.id AND q.pm_project_id IS NULL AND q.locked_project_id IS NULL
    AND (q.company_id IS NULL OR q.company_id=OLD.company_id)
    AND q.company_id IS DISTINCT FROM NEW.company_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crm_opportunity_propagate_company() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_opportunity_propagate_company AFTER UPDATE OF company_id ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_opportunity_propagate_company();
-- Authorized one-time linkage backfill accompanying the new propagation rule.
UPDATE public.fee_proposals q SET company_id=o.company_id FROM public.crm_opportunities o WHERE q.opportunity_id=o.id AND q.company_id IS NULL AND o.company_id IS NOT NULL;
