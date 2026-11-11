-- Complete standalone fee imports and bind layout references to destination stages.
CREATE OR REPLACE FUNCTION public.quote_import_full_template_v2(_quote_id uuid,_template_id uuid,_sections jsonb,_revision text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE operation_id uuid;snapshot jsonb;r jsonb;maps jsonb:='{}';destination uuid;p uuid;keep_values boolean:=coalesce((_sections->>'feeValues')::boolean,true);
BEGIN
 -- Original action verifies identity, editable draft, overwrite revision and captures the full undo state atomically.
 operation_id:=public.quote_import_full_template(_quote_id,_template_id,_sections,_revision);
 SELECT full_quote_snapshot INTO snapshot FROM public.quote_templates WHERE id=_template_id;
 IF snapshot IS NULL THEN RETURN operation_id;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(snapshot->'tables'->'quote_stages') LOOP
 SELECT id INTO destination FROM public.quote_stages WHERE quote_id=_quote_id AND sort_order=(r->>'sort_order')::integer AND name=r->>'name';
 IF destination IS NOT NULL THEN maps:=maps||jsonb_build_object(r->>'id',destination);END IF;
 IF r->>'quote_id' IS NOT NULL THEN maps:=maps||jsonb_build_object(r->>'quote_id',_quote_id);END IF;
 IF coalesce((_sections->>'fees')::boolean,false) AND NOT coalesce((_sections->>'planning')::boolean,false) THEN
 UPDATE public.quote_stages SET budget=CASE WHEN keep_values THEN coalesce((r->>'budget')::numeric,0) ELSE 0 END,retainer_monthly_amount=CASE WHEN keep_values THEN coalesce((r->>'retainer_monthly_amount')::numeric,0) ELSE 0 END,markup_pct=coalesce((r->>'markup_pct')::numeric,markup_pct),sale_source=r->>'sale_source' WHERE id=destination;
 END IF;
 END LOOP;
 SELECT id INTO p FROM public.psa_proposals WHERE quote_id=_quote_id ORDER BY updated_at DESC,id LIMIT 1;
 IF coalesce((_sections->>'layout')::boolean,false) THEN UPDATE public.psa_proposals SET style_settings=public.quote_template_rewrite(coalesce(snapshot->'layout','{}'),maps,true) WHERE id=p;END IF;
 IF coalesce((_sections->>'blocks')::boolean,false) THEN
 UPDATE public.psa_proposal_blocks SET source_ref=public.quote_template_rewrite(source_ref,maps,true)||jsonb_build_object('quote_id',_quote_id),content_rich=public.quote_template_rewrite(content_rich,maps,true) WHERE proposal_id=p;
 END IF;
 UPDATE public.quote_template_imports SET after_hash=md5(public.quote_template_capture(_quote_id)::text) WHERE id=operation_id;
 RETURN operation_id;
END $$;
REVOKE ALL ON FUNCTION public.quote_import_full_template_v2(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_import_full_template_v2(uuid,uuid,jsonb,text) TO authenticated,service_role;
-- Existing old creation entry point now uses the same full importer and never introduces today's date.
CREATE OR REPLACE FUNCTION public.quote_instantiate_template(_quote_id uuid,_template_id uuid,_base_start_date date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE preview jsonb;operation_id uuid;
BEGIN
 IF _base_start_date IS NOT NULL THEN RAISE EXCEPTION 'Quote templates import relative durations only, never absolute start dates';END IF;
 preview:=public.quote_template_preview(_quote_id,_template_id);
 IF EXISTS(SELECT 1 FROM jsonb_each_text(preview->'existing') WHERE value::integer>0) THEN RAISE EXCEPTION 'Use quote-level Import template to review and confirm replacement of existing content';END IF;
 operation_id:=public.quote_import_full_template_v2(_quote_id,_template_id,'{"planning":true,"fees":true,"payments":true,"blocks":true,"layout":true,"feeValues":true}',preview->>'revision');
 RETURN jsonb_build_object('stages',preview->'counts'->'planning','dependencies',(SELECT count(*) FROM public.quote_stage_dependencies WHERE quote_id=_quote_id),'external_services',(SELECT count(*) FROM public.quote_external_services WHERE quote_id=_quote_id),'payment_items',preview->'counts'->'payments','proposal_blocks',preview->'counts'->'blocks','allocations_skipped',0,'undo_id',operation_id);
END $$;
-- Retire the destructive block-only door instead of leaving a bypass usable by old clients.
CREATE OR REPLACE FUNCTION public.psa_import_template_blocks(_proposal_id uuid,_template_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RAISE EXCEPTION 'Use quote-level Import template to review sections, remap stages and preserve undo';
END $$;