CREATE OR REPLACE FUNCTION public.clone_fee_proposal_as_revision_impl(p_source uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id uuid;
  v_root uuid;
  v_max_rev int;
  v_stage_map jsonb := '{}'::jsonb;
  v_payment_map jsonb := '{}'::jsonb;
  v_source_proposal_id uuid;
  v_new_proposal_id uuid;
  v_new_title text;
  v_new_doc_id uuid;
  r record;
  v_new_id_tmp uuid;
BEGIN
  SELECT coalesce(parent_quote_id, id) INTO v_root
  FROM public.fee_proposals
  WHERE id = p_source;

  IF v_root IS NULL THEN
    RAISE EXCEPTION 'Source proposal % not found', p_source;
  END IF;

  SELECT coalesce(max(revision_number), 0) INTO v_max_rev
  FROM public.fee_proposals
  WHERE id = v_root OR parent_quote_id = v_root;

  INSERT INTO public.fee_proposals (
    titulo, company_id, contact_id, valor, probabilidade, pipeline_status,
    data_proposta, notas, opportunity_id, account_id, fee_structure_type,
    quote_status, construction_cost, fee_percentage, pricing_multiplier,
    revision_number, parent_quote_id, proposal_description, quote_mode_ready,
    quote_type, time_based_settings, quote_category, project_fee_calculation,
    ontology_family_code, ontology_preset_code, ontology_delivery_mode,
    ontology_flags, ontology_metadata, default_vat_rate, default_payment_terms,
    first_payment_terms, quote_build_settings, trip_billing_mode, sale_margin_pct
  )
  SELECT
    titulo || ' (rev ' || (v_max_rev + 1) || ')', company_id, contact_id, valor,
    probabilidade, 'lead', current_date, notas, opportunity_id, account_id,
    fee_structure_type, 'draft', construction_cost, fee_percentage,
    pricing_multiplier, v_max_rev + 1, v_root, proposal_description,
    quote_mode_ready, quote_type, time_based_settings, quote_category,
    project_fee_calculation, ontology_family_code, ontology_preset_code,
    ontology_delivery_mode, ontology_flags, ontology_metadata, default_vat_rate,
    default_payment_terms, first_payment_terms, quote_build_settings,
    trip_billing_mode, sale_margin_pct
  FROM public.fee_proposals
  WHERE id = p_source
  RETURNING id, titulo INTO v_new_id, v_new_title;

  FOR r IN SELECT * FROM public.quote_stages WHERE quote_id = p_source LOOP
    INSERT INTO public.quote_stages (
      quote_id, name, description, start_date, end_date, sort_order, color, budget,
      external_id, phase_code, addon_module_code, is_generated, manual_override,
      generator_source, phase_group, billing_model, retainer_monthly_amount,
      stage_kind, retainer_months, retainer_anchor_month,
      retainer_capacity_hours_per_month, is_fee_only, retainer_review_months,
      stage_role, supplier_company_id, is_milestone, budget_mode,
      stage_billing_timing, supplier_id, supplier_placeholder, is_self,
      children_bill_independently, bill_to_client, markup_pct
    ) VALUES (
      v_new_id, r.name, r.description, r.start_date, r.end_date, r.sort_order,
      r.color, r.budget, r.external_id, r.phase_code, r.addon_module_code,
      r.is_generated, r.manual_override, r.generator_source, r.phase_group,
      r.billing_model, r.retainer_monthly_amount, r.stage_kind, r.retainer_months,
      r.retainer_anchor_month, r.retainer_capacity_hours_per_month, r.is_fee_only,
      r.retainer_review_months, r.stage_role, r.supplier_company_id, r.is_milestone,
      r.budget_mode, r.stage_billing_timing, r.supplier_id, r.supplier_placeholder,
      r.is_self, r.children_bill_independently, r.bill_to_client, r.markup_pct
    ) RETURNING id INTO v_new_id_tmp;

    v_stage_map := v_stage_map || jsonb_build_object(r.id::text, v_new_id_tmp::text);
  END LOOP;

  UPDATE public.quote_stages s
  SET parent_stage_id = nullif(v_stage_map ->> (old.parent_stage_id::text), '')::uuid,
      linked_stage_id = nullif(v_stage_map ->> (old.linked_stage_id::text), '')::uuid
  FROM public.quote_stages old
  WHERE old.quote_id = p_source
    AND s.id = (v_stage_map ->> (old.id::text))::uuid
    AND (old.parent_stage_id IS NOT NULL OR old.linked_stage_id IS NOT NULL);

  INSERT INTO public.quote_allocations (
    quote_id, stage_id, resource_id, start_date, end_date,
    hours_per_day, allocation_percentage, cost_rate_snapshot, sale_rate_snapshot, notes
  )
  SELECT v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, resource_id,
    start_date, end_date, hours_per_day, allocation_percentage, cost_rate_snapshot,
    sale_rate_snapshot, notes
  FROM public.quote_allocations
  WHERE quote_id = p_source;

  INSERT INTO public.quote_external_services (
    quote_id, stage_id, supplier_id, description, quantity, unit_cost,
    purchase_price, markup_type, markup_value, sale_price, sale_price_manual,
    status, notes, supplier_company_id
  )
  SELECT v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, supplier_id,
    description, quantity, unit_cost, purchase_price, markup_type, markup_value,
    sale_price, sale_price_manual, status, notes, supplier_company_id
  FROM public.quote_external_services
  WHERE quote_id = p_source;

  INSERT INTO public.quote_stage_dependencies (
    quote_id, predecessor_stage_id, successor_stage_id, type, lag_days,
    is_generated, manual_override, generator_source
  )
  SELECT v_new_id, (v_stage_map ->> (predecessor_stage_id::text))::uuid,
    (v_stage_map ->> (successor_stage_id::text))::uuid, type, lag_days,
    is_generated, manual_override, generator_source
  FROM public.quote_stage_dependencies
  WHERE quote_id = p_source;

  INSERT INTO public.quote_stage_supplier_costs (
    quote_id, stage_id, supplier_id, supplier_label, description, amount,
    billing_trigger, custom_date, payment_terms, payment_offset_days,
    vat_rate, sort_order
  )
  SELECT v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, supplier_id,
    supplier_label, description, amount, billing_trigger, custom_date,
    payment_terms, payment_offset_days, vat_rate, sort_order
  FROM public.quote_stage_supplier_costs
  WHERE quote_id = p_source;

  INSERT INTO public.quote_supplier_markups (
    quote_id, supplier_company_id, supplier_id, supplier_label, markup_pct
  )
  SELECT v_new_id, supplier_company_id, supplier_id, supplier_label, markup_pct
  FROM public.quote_supplier_markups
  WHERE quote_id = p_source;

  INSERT INTO public.quote_supplier_phase_splits (
    quote_id, supplier_company_id, linked_stage_id, percent
  )
  SELECT v_new_id, supplier_company_id,
    nullif(v_stage_map ->> (linked_stage_id::text), '')::uuid, percent
  FROM public.quote_supplier_phase_splits
  WHERE quote_id = p_source;

  INSERT INTO public.quote_site_trips (
    quote_id, stage_id, label, km, price_per_km, trip_hours, resource_id,
    resource_hourly_rate, frequency_mode, frequency_value, notes, sort_order,
    resource_ids, duration_months_override, resource_hourly_rates, display_mode
  )
  SELECT v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, label,
    km, price_per_km, trip_hours, resource_id, resource_hourly_rate,
    frequency_mode, frequency_value, notes, sort_order, resource_ids,
    duration_months_override, resource_hourly_rates, display_mode
  FROM public.quote_site_trips
  WHERE quote_id = p_source;

  INSERT INTO public.quote_billable_hourly_rates (
    quote_id, sale_rate, notes, role_name
  )
  SELECT v_new_id, sale_rate, notes, role_name
  FROM public.quote_billable_hourly_rates
  WHERE quote_id = p_source;

  FOR r IN SELECT * FROM public.quote_payment_schedule_items WHERE quote_id = p_source LOOP
    INSERT INTO public.quote_payment_schedule_items (
      quote_id, stage_id, label, trigger_type, amount_type, amount_value,
      expected_invoice_date, expected_payment_date, sort_order, notes,
      manual_override, generator_source, direction, supplier_company_id,
      payment_offset_days, vat_rate, vat_rate_override, payment_terms,
      supplier_id, supplier_label, invoice_group_id, billing_status
    ) VALUES (
      v_new_id, nullif(v_stage_map ->> (r.stage_id::text), '')::uuid, r.label,
      r.trigger_type, r.amount_type, r.amount_value, r.expected_invoice_date,
      r.expected_payment_date, r.sort_order, r.notes, r.manual_override,
      r.generator_source, r.direction, r.supplier_company_id, r.payment_offset_days,
      r.vat_rate, r.vat_rate_override, r.payment_terms, r.supplier_id,
      r.supplier_label, r.invoice_group_id, 'planned'::public.quote_invoice_billing_status
    ) RETURNING id INTO v_new_id_tmp;

    v_payment_map := v_payment_map || jsonb_build_object(r.id::text, v_new_id_tmp::text);
  END LOOP;

  UPDATE public.quote_payment_schedule_items p
  SET linked_payment_item_id = (v_payment_map ->> (old.linked_payment_item_id::text))::uuid
  FROM public.quote_payment_schedule_items old
  WHERE old.quote_id = p_source
    AND p.id = (v_payment_map ->> (old.id::text))::uuid
    AND old.linked_payment_item_id IS NOT NULL;

  SELECT id INTO v_source_proposal_id
  FROM public.psa_proposals
  WHERE quote_id = p_source
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1;

  IF v_source_proposal_id IS NOT NULL THEN
    INSERT INTO public.psa_proposals (
      quote_id, title, status, client_snapshot, project_snapshot, vat_mode,
      language, created_by, style_settings, locked_at, outcome,
      restored_from_snapshot_id
    )
    SELECT
      v_new_id, v_new_title, 'draft'::public.psa_proposal_status,
      client_snapshot, project_snapshot, vat_mode, language,
      COALESCE(auth.uid(), created_by), style_settings, NULL, NULL, NULL
    FROM public.psa_proposals
    WHERE id = v_source_proposal_id
    RETURNING id INTO v_new_proposal_id;

    INSERT INTO public.psa_proposal_blocks (
      proposal_id, sort_order, block_type, title, source_type, source_ref,
      content_rich, contract_relevance, is_visible, is_locked
    )
    SELECT
      v_new_proposal_id,
      b.sort_order,
      b.block_type,
      b.title,
      b.source_type,
      COALESCE(b.source_ref, '{}'::jsonb)
        || CASE
          WHEN COALESCE(b.source_ref, '{}'::jsonb) ? 'quote_id'
          THEN jsonb_build_object('quote_id', v_new_id::text)
          ELSE '{}'::jsonb
        END
        || CASE
          WHEN COALESCE(b.source_ref, '{}'::jsonb) ? 'stage_id'
            AND v_stage_map ? (b.source_ref ->> 'stage_id')
          THEN jsonb_build_object('stage_id', v_stage_map ->> (b.source_ref ->> 'stage_id'))
          ELSE '{}'::jsonb
        END
        || CASE
          WHEN COALESCE(b.source_ref, '{}'::jsonb) ? 'parent_stage_id'
            AND v_stage_map ? (b.source_ref ->> 'parent_stage_id')
          THEN jsonb_build_object('parent_stage_id', v_stage_map ->> (b.source_ref ->> 'parent_stage_id'))
          ELSE '{}'::jsonb
        END,
      b.content_rich,
      b.contract_relevance,
      b.is_visible,
      false
    FROM public.psa_proposal_blocks b
    WHERE b.proposal_id = v_source_proposal_id
    ORDER BY b.sort_order, b.created_at;
  END IF;

  FOR r IN SELECT * FROM public.quote_proposal_documents WHERE quote_id = p_source LOOP
    INSERT INTO public.quote_proposal_documents (
      quote_id, title, language, status, revision_number, snapshot_json,
      generated_at, sent_at, created_by
    ) VALUES (
      v_new_id, r.title, r.language, 'draft'::public.quote_proposal_document_status,
      r.revision_number, r.snapshot_json, NULL, NULL, COALESCE(auth.uid(), r.created_by)
    ) RETURNING id INTO v_new_doc_id;

    INSERT INTO public.quote_proposal_document_blocks (
      proposal_document_id, proposal_block_id, block_title, block_type, content,
      generated_content, sort_order, is_included, is_locked,
      assembly_section_id, assembly_provenance, assembly_locked
    )
    SELECT
      v_new_doc_id, proposal_block_id, block_title, block_type, content,
      generated_content, sort_order, is_included, false,
      assembly_section_id, assembly_provenance, assembly_locked
    FROM public.quote_proposal_document_blocks
    WHERE proposal_document_id = r.id
    ORDER BY sort_order, created_at;
  END LOOP;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM authenticated;