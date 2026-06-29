
CREATE OR REPLACE FUNCTION public.backfill_quote_from_project(_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_quote_id uuid;
  v_stage_map jsonb := '{}'::jsonb;
  r RECORD;
  v_new_stage_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.pm_projects WHERE id = _project_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project % not found', _project_id;
  END IF;

  -- Idempotent: if already linked, return existing quote id.
  IF v_project.quote_id IS NOT NULL THEN
    RETURN v_project.quote_id;
  END IF;

  -- 1. Create the back-linked fee proposal (approved + locked to this project).
  INSERT INTO public.fee_proposals (
    titulo, company_id, account_id, opportunity_id,
    quote_status, pricing_multiplier, pm_project_id,
    is_locked, locked_at, locked_project_id,
    notas
  ) VALUES (
    COALESCE(v_project.name, 'Project ' || _project_id::text),
    v_project.company_id, v_project.account_id, v_project.opportunity_id,
    'approved', COALESCE(v_project.sold_pricing_multiplier, 1), _project_id,
    true, now(), _project_id,
    'Auto-generated from project Gantt'
  )
  RETURNING id INTO v_quote_id;

  -- 2. Copy pm_stages → quote_stages. Two passes (parents resolved in pass 2).
  FOR r IN
    SELECT * FROM public.pm_stages
    WHERE project_id = _project_id
    ORDER BY COALESCE(sort_order, 0), created_at
  LOOP
    INSERT INTO public.quote_stages (
      quote_id, name, start_date, end_date, sort_order, color, budget,
      billing_model, retainer_monthly_amount, stage_kind,
      retainer_months, retainer_anchor_month, retainer_capacity_hours_per_month,
      is_fee_only, retainer_review_months, is_milestone, is_self,
      children_bill_independently
    ) VALUES (
      v_quote_id, r.name, r.start_date, r.end_date, COALESCE(r.sort_order, 0),
      COALESCE(r.color, '#22c55e'), COALESCE(r.budget, 0),
      COALESCE(r.billing_model, 'stage'), COALESCE(r.retainer_monthly_amount, 0),
      COALESCE(r.stage_kind, 'regular'),
      r.retainer_months, r.retainer_anchor_month,
      COALESCE(r.retainer_capacity_hours_per_month, 160),
      COALESCE(r.is_fee_only, true), r.retainer_review_months,
      COALESCE(r.is_milestone, false), COALESCE(r.is_self, true),
      COALESCE(r.children_bill_independently, false)
    )
    RETURNING id INTO v_new_stage_id;

    v_stage_map := v_stage_map || jsonb_build_object(r.id::text, v_new_stage_id::text);

    -- Write the back-pointer on pm_stages so live-sync triggers can match.
    UPDATE public.pm_stages SET source_quote_stage_id = v_new_stage_id WHERE id = r.id;
  END LOOP;

  -- 2b. Resolve parent_stage_id on quote_stages.
  FOR r IN
    SELECT id, parent_stage_id FROM public.pm_stages
    WHERE project_id = _project_id AND parent_stage_id IS NOT NULL
  LOOP
    UPDATE public.quote_stages
       SET parent_stage_id = (v_stage_map ->> r.parent_stage_id::text)::uuid
     WHERE id = (v_stage_map ->> r.id::text)::uuid;
  END LOOP;

  -- 3. Dependencies.
  FOR r IN
    SELECT d.* FROM public.pm_stage_dependencies d
    JOIN public.pm_stages s ON s.id = d.predecessor_id
    WHERE s.project_id = _project_id
  LOOP
    IF (v_stage_map ? r.predecessor_id::text) AND (v_stage_map ? r.successor_id::text) THEN
      INSERT INTO public.quote_stage_dependencies
        (quote_id, predecessor_stage_id, successor_stage_id, type, lag_days)
      VALUES (
        v_quote_id,
        (v_stage_map ->> r.predecessor_id::text)::uuid,
        (v_stage_map ->> r.successor_id::text)::uuid,
        COALESCE(r.type, 'FS'), COALESCE(r.lag_days, 0)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- 4. Allocations. Rates default to pm_resources cost/sale/hourly_rate.
  FOR r IN
    SELECT a.*, res.cost_rate AS res_cost, res.sale_rate AS res_sale, res.hourly_rate AS res_hourly
    FROM public.pm_allocations a
    JOIN public.pm_stages s ON s.id = a.stage_id
    LEFT JOIN public.pm_resources res ON res.id = a.resource_id
    WHERE s.project_id = _project_id
  LOOP
    IF v_stage_map ? r.stage_id::text THEN
      INSERT INTO public.quote_allocations (
        quote_id, stage_id, resource_id, start_date, end_date,
        hours_per_day, allocation_percentage,
        cost_rate_snapshot, sale_rate_snapshot
      ) VALUES (
        v_quote_id,
        (v_stage_map ->> r.stage_id::text)::uuid,
        r.resource_id, r.start_date, r.end_date,
        COALESCE(r.hours_per_day, 8), COALESCE(r.allocation_percentage, 100),
        COALESCE(r.res_cost, 0),
        COALESCE(r.res_sale, r.res_hourly, 0)
      );
    END IF;
  END LOOP;

  -- 5. Payment schedule.
  FOR r IN
    SELECT * FROM public.pm_payment_schedule_items
    WHERE project_id = _project_id
    ORDER BY COALESCE(sort_order, 0)
  LOOP
    INSERT INTO public.quote_payment_schedule_items (
      quote_id, stage_id, label, trigger_type, amount_type, amount_value,
      expected_invoice_date, expected_payment_date, sort_order, notes,
      manual_override, generator_source, direction, supplier_company_id,
      linked_payment_item_id, payment_offset_days, vat_rate, vat_rate_override,
      payment_terms, supplier_id, supplier_label, invoice_group_id, billing_status
    ) VALUES (
      v_quote_id,
      CASE WHEN r.stage_id IS NOT NULL AND v_stage_map ? r.stage_id::text
           THEN (v_stage_map ->> r.stage_id::text)::uuid ELSE NULL END,
      r.label, r.trigger_type, r.amount_type, r.amount_value,
      r.expected_invoice_date, r.expected_payment_date, COALESCE(r.sort_order, 0), r.notes,
      COALESCE(r.manual_override, false), r.generator_source, r.direction,
      r.supplier_company_id, r.linked_payment_item_id, r.payment_offset_days,
      r.vat_rate, r.vat_rate_override, r.payment_terms, r.supplier_id,
      r.supplier_label, r.invoice_group_id, r.billing_status
    );
  END LOOP;

  -- 6. Link the project back to the new quote.
  UPDATE public.pm_projects SET quote_id = v_quote_id WHERE id = _project_id;

  RETURN v_quote_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_quote_from_project(uuid) TO authenticated, service_role;

-- Convenience wrapper the UI calls.
CREATE OR REPLACE FUNCTION public.ensure_project_has_quote(_project_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.backfill_quote_from_project(_project_id);
$$;

GRANT EXECUTE ON FUNCTION public.ensure_project_has_quote(uuid) TO authenticated, service_role;
