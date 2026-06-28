
create or replace function public.clone_fee_proposal_as_revision(p_source uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
  v_root uuid;
  v_max_rev int;
  v_stage_map jsonb := '{}'::jsonb;
  v_payment_map jsonb := '{}'::jsonb;
  r record;
  v_new_id_tmp uuid;
begin
  select coalesce(parent_quote_id, id) into v_root from fee_proposals where id = p_source;
  if v_root is null then
    raise exception 'Source proposal % not found', p_source;
  end if;

  select coalesce(max(revision_number), 0) into v_max_rev
    from fee_proposals
   where id = v_root or parent_quote_id = v_root;

  insert into fee_proposals (
    titulo, company_id, contact_id, valor, probabilidade, pipeline_status,
    data_proposta, notas, opportunity_id, account_id, fee_structure_type,
    quote_status, construction_cost, fee_percentage, pricing_multiplier,
    revision_number, parent_quote_id, proposal_description, quote_mode_ready,
    quote_type, time_based_settings, quote_category, project_fee_calculation,
    ontology_family_code, ontology_preset_code, ontology_delivery_mode,
    ontology_flags, ontology_metadata, default_vat_rate, default_payment_terms,
    first_payment_terms
  )
  select
    titulo || ' (rev ' || (v_max_rev + 1) || ')', company_id, contact_id, valor,
    probabilidade, 'lead', current_date, notas, opportunity_id, account_id,
    fee_structure_type, 'draft', construction_cost, fee_percentage,
    pricing_multiplier, v_max_rev + 1, v_root, proposal_description,
    quote_mode_ready, quote_type, time_based_settings, quote_category,
    project_fee_calculation, ontology_family_code, ontology_preset_code,
    ontology_delivery_mode, ontology_flags, ontology_metadata, default_vat_rate,
    default_payment_terms, first_payment_terms
  from fee_proposals where id = p_source
  returning id into v_new_id;

  for r in select * from quote_stages where quote_id = p_source loop
    insert into quote_stages (
      quote_id, name, description, start_date, end_date, sort_order, color, budget,
      external_id, phase_code, addon_module_code, is_generated, manual_override,
      generator_source, phase_group, billing_model, retainer_monthly_amount,
      stage_kind, retainer_months, retainer_anchor_month,
      retainer_capacity_hours_per_month, is_fee_only, retainer_review_months,
      stage_role, supplier_company_id, is_milestone, budget_mode,
      stage_billing_timing, supplier_id, supplier_placeholder, is_self,
      children_bill_independently, bill_to_client, markup_pct
    ) values (
      v_new_id, r.name, r.description, r.start_date, r.end_date, r.sort_order,
      r.color, r.budget, r.external_id, r.phase_code, r.addon_module_code,
      r.is_generated, r.manual_override, r.generator_source, r.phase_group,
      r.billing_model, r.retainer_monthly_amount, r.stage_kind, r.retainer_months,
      r.retainer_anchor_month, r.retainer_capacity_hours_per_month, r.is_fee_only,
      r.retainer_review_months, r.stage_role, r.supplier_company_id, r.is_milestone,
      r.budget_mode, r.stage_billing_timing, r.supplier_id, r.supplier_placeholder,
      r.is_self, r.children_bill_independently, r.bill_to_client, r.markup_pct
    ) returning id into v_new_id_tmp;
    v_stage_map := v_stage_map || jsonb_build_object(r.id::text, v_new_id_tmp::text);
  end loop;

  update quote_stages s
     set parent_stage_id = nullif(v_stage_map ->> (old.parent_stage_id::text), '')::uuid,
         linked_stage_id = nullif(v_stage_map ->> (old.linked_stage_id::text), '')::uuid
    from quote_stages old
   where old.quote_id = p_source
     and s.id = (v_stage_map ->> (old.id::text))::uuid
     and (old.parent_stage_id is not null or old.linked_stage_id is not null);

  insert into quote_allocations (quote_id, stage_id, resource_id, start_date, end_date,
    hours_per_day, allocation_percentage, cost_rate_snapshot, sale_rate_snapshot, notes)
  select v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, resource_id,
    start_date, end_date, hours_per_day, allocation_percentage, cost_rate_snapshot,
    sale_rate_snapshot, notes
  from quote_allocations where quote_id = p_source;

  insert into quote_external_services (quote_id, stage_id, supplier_id, description,
    quantity, unit_cost, purchase_price, markup_type, markup_value, sale_price,
    sale_price_manual, status, notes, supplier_company_id)
  select v_new_id, nullif(v_stage_map ->> (stage_id::text), '')::uuid, supplier_id,
    description, quantity, unit_cost, purchase_price, markup_type, markup_value,
    sale_price, sale_price_manual, status, notes, supplier_company_id
  from quote_external_services where quote_id = p_source;

  insert into quote_stage_dependencies (quote_id, predecessor_stage_id,
    successor_stage_id, type, lag_days, is_generated, manual_override, generator_source)
  select v_new_id, (v_stage_map ->> (predecessor_stage_id::text))::uuid,
    (v_stage_map ->> (successor_stage_id::text))::uuid, type, lag_days, is_generated,
    manual_override, generator_source
  from quote_stage_dependencies where quote_id = p_source;

  insert into quote_stage_supplier_costs (quote_id, stage_id, supplier_id,
    supplier_label, description, amount, billing_trigger, custom_date, payment_terms,
    payment_offset_days, vat_rate, sort_order)
  select v_new_id, (v_stage_map ->> (stage_id::text))::uuid, supplier_id,
    supplier_label, description, amount, billing_trigger, custom_date, payment_terms,
    payment_offset_days, vat_rate, sort_order
  from quote_stage_supplier_costs where quote_id = p_source;

  insert into quote_supplier_phase_splits (quote_id, supplier_company_id,
    linked_stage_id, percent)
  select v_new_id, supplier_company_id,
    nullif(v_stage_map ->> (linked_stage_id::text), '')::uuid, percent
  from quote_supplier_phase_splits where quote_id = p_source;

  for r in select * from quote_payment_schedule_items where quote_id = p_source loop
    insert into quote_payment_schedule_items (quote_id, stage_id, label, trigger_type,
      amount_type, amount_value, expected_invoice_date, expected_payment_date,
      sort_order, notes, manual_override, generator_source, direction,
      supplier_company_id, payment_offset_days, vat_rate, vat_rate_override,
      payment_terms, supplier_id, supplier_label, invoice_group_id, billing_status)
    values (v_new_id, nullif(v_stage_map ->> (r.stage_id::text), '')::uuid, r.label,
      r.trigger_type, r.amount_type, r.amount_value, r.expected_invoice_date,
      r.expected_payment_date, r.sort_order, r.notes, r.manual_override,
      r.generator_source, r.direction, r.supplier_company_id, r.payment_offset_days,
      r.vat_rate, r.vat_rate_override, r.payment_terms, r.supplier_id,
      r.supplier_label, r.invoice_group_id, 'draft')
    returning id into v_new_id_tmp;
    v_payment_map := v_payment_map || jsonb_build_object(r.id::text, v_new_id_tmp::text);
  end loop;

  update quote_payment_schedule_items p
     set linked_payment_item_id = (v_payment_map ->> (old.linked_payment_item_id::text))::uuid
    from quote_payment_schedule_items old
   where old.quote_id = p_source
     and p.id = (v_payment_map ->> (old.id::text))::uuid
     and old.linked_payment_item_id is not null;

  return v_new_id;
end $$;

grant execute on function public.clone_fee_proposal_as_revision(uuid) to authenticated;
