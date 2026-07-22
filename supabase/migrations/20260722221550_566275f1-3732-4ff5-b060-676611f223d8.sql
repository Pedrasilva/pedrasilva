
-- 1. Extend template blocks with PSA payload columns
ALTER TABLE public.quote_template_blocks
  ADD COLUMN IF NOT EXISTS block_type public.psa_block_type,
  ADD COLUMN IF NOT EXISTS source_type public.psa_block_source_type,
  ADD COLUMN IF NOT EXISTS source_ref jsonb,
  ADD COLUMN IF NOT EXISTS content_rich jsonb,
  ADD COLUMN IF NOT EXISTS contract_relevance public.psa_contract_relevance;

-- 2. Rewrite quote_save_as_template to snapshot PSA blocks when present
CREATE OR REPLACE FUNCTION public.quote_save_as_template(
  _quote_id uuid, _name text, _description text,
  _category crm_quote_category, _project_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_template_id uuid;
  v_psa_id uuid;
  v_psa_block_count integer := 0;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  INSERT INTO public.quote_templates(name, description, category, project_type, created_by)
  VALUES (trim(_name), _description, COALESCE(_category, 'project'::crm_quote_category),
          COALESCE(NULLIF(trim(_project_type), ''), 'generic'), v_caller)
  RETURNING id INTO v_template_id;

  -- Stages
  INSERT INTO public.quote_template_stages(
    template_id, stage_temp_key, sort_order, title, duration_days, fee_percentage, color, billing_trigger_default
  )
  SELECT v_template_id,
         's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8),
         s.sort_order, s.name,
         GREATEST(1, (s.end_date - s.start_date) + 1),
         0, s.color, 'stage_end'::quote_payment_trigger
  FROM public.quote_stages s WHERE s.quote_id = _quote_id;

  INSERT INTO public.quote_template_dependencies(
    template_id, predecessor_stage_temp_key, successor_stage_temp_key, dependency_type, lag_days
  )
  SELECT v_template_id,
         's' || ps.sort_order::text || '_' || substring(ps.id::text, 1, 8),
         's' || ss.sort_order::text || '_' || substring(ss.id::text, 1, 8),
         d.type, d.lag_days
  FROM public.quote_stage_dependencies d
  JOIN public.quote_stages ps ON ps.id = d.predecessor_stage_id
  JOIN public.quote_stages ss ON ss.id = d.successor_stage_id
  WHERE d.quote_id = _quote_id;

  INSERT INTO public.quote_template_allocations(
    template_id, stage_temp_key, resource_role, default_allocation_pct, estimated_hours
  )
  SELECT v_template_id,
         's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8),
         COALESCE(r.role, 'member'),
         COALESCE(a.allocation_percentage, 50),
         COALESCE(a.hours_per_day * GREATEST(1, (a.end_date - a.start_date) + 1), 0)
  FROM public.quote_allocations a
  JOIN public.quote_stages s ON s.id = a.stage_id
  LEFT JOIN public.pm_resources r ON r.id = a.resource_id
  WHERE a.quote_id = _quote_id;

  INSERT INTO public.quote_template_external_services(
    template_id, stage_temp_key, description, quantity, unit_cost, markup_type, markup_value
  )
  SELECT v_template_id,
         CASE WHEN s.id IS NOT NULL
              THEN 's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8) END,
         e.description, e.quantity, e.unit_cost, e.markup_type, e.markup_value
  FROM public.quote_external_services e
  LEFT JOIN public.quote_stages s ON s.id = e.stage_id
  WHERE e.quote_id = _quote_id;

  INSERT INTO public.quote_template_payment_rules(
    template_id, stage_temp_key, sort_order, label, trigger_type, amount_type, amount_value, payment_terms_days
  )
  SELECT v_template_id,
         CASE WHEN s.id IS NOT NULL
              THEN 's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8) END,
         p.sort_order, p.label, p.trigger_type, p.amount_type, p.amount_value, 30
  FROM public.quote_payment_schedule_items p
  LEFT JOIN public.quote_stages s ON s.id = p.stage_id
  WHERE p.quote_id = _quote_id;

  -- Prefer newest PSA proposal for this quote
  SELECT id INTO v_psa_id
  FROM public.psa_proposals
  WHERE quote_id = _quote_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_psa_id IS NOT NULL THEN
    INSERT INTO public.quote_template_blocks(
      template_id, block_title, sort_order, required,
      block_type, source_type, source_ref, content_rich, contract_relevance
    )
    SELECT v_template_id,
           COALESCE(b.title, 'Bloco'),
           b.sort_order,
           false,
           b.block_type,
           b.source_type,
           b.source_ref,
           b.content_rich,
           b.contract_relevance
    FROM public.psa_proposal_blocks b
    WHERE b.proposal_id = v_psa_id;
    GET DIAGNOSTICS v_psa_block_count = ROW_COUNT;
  END IF;

  -- Legacy fallback (only if no PSA blocks were snapshotted)
  IF v_psa_block_count = 0 THEN
    INSERT INTO public.quote_template_blocks(
      template_id, proposal_block_id, block_title, sort_order, required
    )
    SELECT v_template_id, b.proposal_block_id, b.block_title, b.sort_order, false
    FROM public.quote_proposal_document_blocks b
    WHERE b.proposal_document_id = (
      SELECT id FROM public.quote_proposal_documents
        WHERE quote_id = _quote_id
        ORDER BY created_at DESC LIMIT 1
    );
  END IF;

  RETURN v_template_id;
END $function$;

-- 3. Rewrite psa_import_template_blocks to restore rich PSA payload when present
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
      COALESCE(tb.source_ref, jsonb_build_object('template_id', _template_id, 'template_block_id', tb.id)),
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

-- 4. Remove all existing (broken/legacy) templates so the list starts clean.
--    Child rows (stages, blocks, dependencies, allocations, external services,
--    payment rules) cascade via their FK definitions.
DELETE FROM public.quote_templates;
