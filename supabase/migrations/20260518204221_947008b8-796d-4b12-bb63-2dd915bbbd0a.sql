
-- ============================================================
-- QUOTE TEMPLATES FOUNDATION
-- Additive: no changes to existing quote/project/financial tables
-- ============================================================

CREATE TABLE public.quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category crm_quote_category NOT NULL DEFAULT 'project',
  project_type text NOT NULL DEFAULT 'generic',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  stage_temp_key text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  title text NOT NULL,
  duration_days int NOT NULL DEFAULT 30 CHECK (duration_days >= 1),
  fee_percentage numeric NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#22c55e',
  billing_trigger_default quote_payment_trigger NOT NULL DEFAULT 'stage_end',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, stage_temp_key)
);
CREATE INDEX idx_quote_template_stages_template ON public.quote_template_stages(template_id, sort_order);

CREATE TABLE public.quote_template_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  predecessor_stage_temp_key text NOT NULL,
  successor_stage_temp_key text NOT NULL,
  dependency_type quote_dep_type NOT NULL DEFAULT 'FS',
  lag_days int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (predecessor_stage_temp_key <> successor_stage_temp_key)
);
CREATE INDEX idx_quote_template_deps_template ON public.quote_template_dependencies(template_id);

CREATE TABLE public.quote_template_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  stage_temp_key text NOT NULL,
  resource_role text,
  default_allocation_pct numeric NOT NULL DEFAULT 50 CHECK (default_allocation_pct >= 0 AND default_allocation_pct <= 100),
  estimated_hours numeric NOT NULL DEFAULT 0 CHECK (estimated_hours >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_template_allocs_template ON public.quote_template_allocations(template_id);

CREATE TABLE public.quote_template_external_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  stage_temp_key text,
  supplier_type text,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  markup_type quote_markup_type NOT NULL DEFAULT 'percent',
  markup_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_template_ext_template ON public.quote_template_external_services(template_id);

CREATE TABLE public.quote_template_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  stage_temp_key text,
  sort_order int NOT NULL DEFAULT 0,
  label text NOT NULL,
  trigger_type quote_payment_trigger NOT NULL,
  amount_type quote_payment_amount_type NOT NULL DEFAULT 'percent',
  amount_value numeric NOT NULL DEFAULT 0 CHECK (amount_value >= 0),
  payment_terms_days int NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_template_pay_template ON public.quote_template_payment_rules(template_id, sort_order);

CREATE TABLE public.quote_template_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.quote_templates(id) ON DELETE CASCADE,
  proposal_block_id uuid REFERENCES public.proposal_blocks(id) ON DELETE SET NULL,
  block_title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_template_blocks_template ON public.quote_template_blocks(template_id, sort_order);

-- updated_at triggers
CREATE TRIGGER trg_quote_templates_updated
  BEFORE UPDATE ON public.quote_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_quote_template_stages_updated
  BEFORE UPDATE ON public.quote_template_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS  (mirrors quote_stages: admins write, authenticated read)
-- ============================================================
ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_external_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_payment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_template_blocks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'quote_templates',
    'quote_template_stages',
    'quote_template_dependencies',
    'quote_template_allocations',
    'quote_template_external_services',
    'quote_template_payment_rules',
    'quote_template_blocks'
  ])
  LOOP
    EXECUTE format($f$
      CREATE POLICY "Authenticated read %1$s" ON public.%1$I
        FOR SELECT TO authenticated USING (true);
      CREATE POLICY "Admins insert %1$s" ON public.%1$I
        FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
      CREATE POLICY "Admins update %1$s" ON public.%1$I
        FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
      CREATE POLICY "Admins delete %1$s" ON public.%1$I
        FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
    $f$, t);
  END LOOP;
END $$;

-- ============================================================
-- quote_save_as_template
--   Snapshots an existing quote into a new template. Does NOT copy
--   opportunity_id, company_id, prices, project_id, revisions or
--   workflow state.
-- ============================================================
CREATE OR REPLACE FUNCTION public.quote_save_as_template(
  _quote_id uuid,
  _name text,
  _description text,
  _category crm_quote_category,
  _project_type text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_template_id uuid;
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
         s.sort_order,
         s.name,
         GREATEST(1, (s.end_date - s.start_date) + 1),
         0,
         s.color,
         'stage_end'::quote_payment_trigger
  FROM public.quote_stages s
  WHERE s.quote_id = _quote_id;

  -- Dependencies (remap by sort_order + id prefix to keep keys stable)
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

  -- Allocations (snapshot by role; resource identity is intentionally dropped)
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

  -- External services
  INSERT INTO public.quote_template_external_services(
    template_id, stage_temp_key, description, quantity, unit_cost, markup_type, markup_value
  )
  SELECT v_template_id,
         CASE WHEN s.id IS NOT NULL
              THEN 's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8)
         END,
         e.description, e.quantity, e.unit_cost, e.markup_type, e.markup_value
  FROM public.quote_external_services e
  LEFT JOIN public.quote_stages s ON s.id = e.stage_id
  WHERE e.quote_id = _quote_id;

  -- Payment rules
  INSERT INTO public.quote_template_payment_rules(
    template_id, stage_temp_key, sort_order, label, trigger_type, amount_type, amount_value, payment_terms_days
  )
  SELECT v_template_id,
         CASE WHEN s.id IS NOT NULL
              THEN 's' || s.sort_order::text || '_' || substring(s.id::text, 1, 8)
         END,
         p.sort_order, p.label, p.trigger_type, p.amount_type, p.amount_value, 30
  FROM public.quote_payment_schedule_items p
  LEFT JOIN public.quote_stages s ON s.id = p.stage_id
  WHERE p.quote_id = _quote_id;

  -- Proposal blocks (most recent document)
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

  RETURN v_template_id;
END $$;

-- ============================================================
-- quote_instantiate_template
--   Copies template contents into an existing quote. Stages are laid
--   out sequentially from _base_start_date. Allocations are skipped in
--   this foundation phase (templates store role text only).
-- ============================================================
CREATE OR REPLACE FUNCTION public.quote_instantiate_template(
  _quote_id uuid,
  _template_id uuid,
  _base_start_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_start date := COALESCE(_base_start_date, CURRENT_DATE);
  v_stage RECORD;
  v_running date;
  v_new_stage_id uuid;
  v_stage_count int := 0;
  v_dep_count int := 0;
  v_ext_count int := 0;
  v_pay_count int := 0;
  v_block_count int := 0;
  v_alloc_skipped int := 0;
  v_doc_id uuid;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fee_proposals WHERE id = _quote_id) THEN
    RAISE EXCEPTION 'quote not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quote_templates WHERE id = _template_id) THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  CREATE TEMP TABLE _stage_map (
    stage_temp_key text PRIMARY KEY,
    new_stage_id uuid NOT NULL
  ) ON COMMIT DROP;

  v_running := v_start;
  FOR v_stage IN
    SELECT * FROM public.quote_template_stages
     WHERE template_id = _template_id
     ORDER BY sort_order, stage_temp_key
  LOOP
    INSERT INTO public.quote_stages(quote_id, name, start_date, end_date, sort_order, color, budget)
    VALUES (_quote_id, v_stage.title, v_running,
            v_running + (v_stage.duration_days - 1),
            v_stage.sort_order, v_stage.color, 0)
    RETURNING id INTO v_new_stage_id;
    INSERT INTO _stage_map(stage_temp_key, new_stage_id)
    VALUES (v_stage.stage_temp_key, v_new_stage_id);
    v_running := v_running + v_stage.duration_days;
    v_stage_count := v_stage_count + 1;
  END LOOP;

  -- Dependencies
  WITH ins AS (
    INSERT INTO public.quote_stage_dependencies(
      quote_id, predecessor_stage_id, successor_stage_id, type, lag_days
    )
    SELECT _quote_id, pm.new_stage_id, sm.new_stage_id, td.dependency_type, td.lag_days
    FROM public.quote_template_dependencies td
    JOIN _stage_map pm ON pm.stage_temp_key = td.predecessor_stage_temp_key
    JOIN _stage_map sm ON sm.stage_temp_key = td.successor_stage_temp_key
    WHERE td.template_id = _template_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_dep_count FROM ins;

  -- External services
  WITH ins AS (
    INSERT INTO public.quote_external_services(
      quote_id, stage_id, description, quantity, unit_cost, purchase_price, markup_type, markup_value
    )
    SELECT _quote_id, sm.new_stage_id, te.description, te.quantity, te.unit_cost,
           te.unit_cost * te.quantity, te.markup_type, te.markup_value
    FROM public.quote_template_external_services te
    LEFT JOIN _stage_map sm ON sm.stage_temp_key = te.stage_temp_key
    WHERE te.template_id = _template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_ext_count FROM ins;

  -- Payment schedule
  WITH ins AS (
    INSERT INTO public.quote_payment_schedule_items(
      quote_id, stage_id, label, trigger_type, amount_type, amount_value, sort_order
    )
    SELECT _quote_id, sm.new_stage_id, tp.label, tp.trigger_type, tp.amount_type, tp.amount_value, tp.sort_order
    FROM public.quote_template_payment_rules tp
    LEFT JOIN _stage_map sm ON sm.stage_temp_key = tp.stage_temp_key
    WHERE tp.template_id = _template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_pay_count FROM ins;

  -- Proposal blocks → reuse latest doc, or create a fresh draft
  SELECT id INTO v_doc_id FROM public.quote_proposal_documents
   WHERE quote_id = _quote_id ORDER BY created_at DESC LIMIT 1;
  IF v_doc_id IS NULL AND EXISTS (SELECT 1 FROM public.quote_template_blocks WHERE template_id = _template_id) THEN
    INSERT INTO public.quote_proposal_documents(quote_id, title, language)
    VALUES (_quote_id, 'Proposal', 'pt-PT')
    RETURNING id INTO v_doc_id;
  END IF;
  IF v_doc_id IS NOT NULL THEN
    WITH ins AS (
      INSERT INTO public.quote_proposal_document_blocks(
        proposal_document_id, proposal_block_id, block_title, block_type, content, sort_order, is_included
      )
      SELECT v_doc_id, tb.proposal_block_id, tb.block_title,
             COALESCE(pb.block_type, 'editable_text'::proposal_block_type),
             COALESCE(pb.default_content, ''),
             tb.sort_order, true
      FROM public.quote_template_blocks tb
      LEFT JOIN public.proposal_blocks pb ON pb.id = tb.proposal_block_id
      WHERE tb.template_id = _template_id
      RETURNING 1
    )
    SELECT count(*) INTO v_block_count FROM ins;
  END IF;

  -- Allocations cannot be auto-created (templates store role text only).
  SELECT count(*) INTO v_alloc_skipped
    FROM public.quote_template_allocations WHERE template_id = _template_id;

  RETURN jsonb_build_object(
    'stages', v_stage_count,
    'dependencies', v_dep_count,
    'external_services', v_ext_count,
    'payment_items', v_pay_count,
    'proposal_blocks', v_block_count,
    'allocations_skipped', v_alloc_skipped
  );
END $$;
