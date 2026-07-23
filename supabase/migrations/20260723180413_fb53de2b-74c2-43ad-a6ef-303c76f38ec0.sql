CREATE OR REPLACE FUNCTION public.psa_import_template_blocks(
  _proposal_id uuid, _template_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.psa_proposals WHERE id = _proposal_id) THEN
    RAISE EXCEPTION 'proposal not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quote_templates WHERE id = _template_id) THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  DELETE FROM public.psa_proposal_blocks WHERE proposal_id = _proposal_id;

  WITH ins AS (
    INSERT INTO public.psa_proposal_blocks(
      proposal_id, sort_order, block_type, title,
      source_type, source_ref, content_rich, contract_relevance
    )
    SELECT
      _proposal_id,
      (row_number() OVER (ORDER BY tb.sort_order, tb.id)) * 10,
      COALESCE(tb.block_type, 'custom_text'::public.psa_block_type),
      COALESCE(tb.block_title, pb.title, 'Bloco'),
      COALESCE(tb.source_type, 'library'::public.psa_block_source_type),
      COALESCE(
        (COALESCE(tb.source_ref, '{}'::jsonb)
          - 'stage_id' - 'parent_stage_id' - 'quote_id'),
        '{}'::jsonb
      ) || jsonb_build_object('template_id', _template_id, 'template_block_id', tb.id),
      COALESCE(tb.content_rich, jsonb_build_object('html', COALESCE(pb.default_content, ''))),
      COALESCE(tb.contract_relevance, 'proposal_only'::public.psa_contract_relevance)
    FROM public.quote_template_blocks tb
    LEFT JOIN public.proposal_blocks pb ON pb.id = tb.proposal_block_id
    WHERE tb.template_id = _template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END $function$;