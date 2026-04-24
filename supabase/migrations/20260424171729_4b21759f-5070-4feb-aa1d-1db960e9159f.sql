-- ============================================================
-- Phase A: Quote-owned planning foundation
-- Adds quote_* tables mirroring pm_* so a fee proposal can plan
-- stages, dependencies, allocations, external services, and
-- payment schedule before becoming a project.
-- Purely additive. Existing data untouched.
-- ============================================================

-- 1) ENUMS ----------------------------------------------------

CREATE TYPE public.quote_dep_type AS ENUM ('FS', 'SS', 'FF', 'SF');

CREATE TYPE public.quote_external_service_status AS ENUM (
  'draft', 'pending', 'invoiced', 'paid', 'cancelled'
);

CREATE TYPE public.quote_markup_type AS ENUM ('percent', 'fixed');

CREATE TYPE public.quote_payment_trigger AS ENUM (
  'project_start', 'stage_start', 'stage_end', 'manual_date', 'monthly'
);

CREATE TYPE public.quote_payment_amount_type AS ENUM ('fixed', 'percent');

-- 2) quote_stages --------------------------------------------

CREATE TABLE public.quote_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id     uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  sort_order   int NOT NULL DEFAULT 0,
  color        text NOT NULL DEFAULT '#22c55e',
  budget       numeric NOT NULL DEFAULT 0,
  external_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_stages_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX idx_quote_stages_quote ON public.quote_stages(quote_id, sort_order);

-- 3) quote_stage_dependencies --------------------------------

CREATE TABLE public.quote_stage_dependencies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id             uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  predecessor_stage_id uuid NOT NULL REFERENCES public.quote_stages(id) ON DELETE CASCADE,
  successor_stage_id   uuid NOT NULL REFERENCES public.quote_stages(id) ON DELETE CASCADE,
  type                 public.quote_dep_type NOT NULL DEFAULT 'FS',
  lag_days             int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_dep_unique UNIQUE (predecessor_stage_id, successor_stage_id),
  CONSTRAINT quote_dep_not_self CHECK (predecessor_stage_id <> successor_stage_id)
);

CREATE INDEX idx_quote_dep_quote ON public.quote_stage_dependencies(quote_id);
CREATE INDEX idx_quote_dep_pred ON public.quote_stage_dependencies(predecessor_stage_id);
CREATE INDEX idx_quote_dep_succ ON public.quote_stage_dependencies(successor_stage_id);

-- Cycle-prevention trigger (clone of pm_check_stage_dependency_cycle)
CREATE OR REPLACE FUNCTION public.quote_check_stage_dependency_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cycle_found boolean;
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT successor_stage_id AS node FROM public.quote_stage_dependencies
      WHERE predecessor_stage_id = NEW.successor_stage_id
    UNION
    SELECT d.successor_stage_id FROM public.quote_stage_dependencies d
      JOIN descendants ON d.predecessor_stage_id = descendants.node
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE node = NEW.predecessor_stage_id)
    INTO cycle_found;

  IF cycle_found OR NEW.predecessor_stage_id = NEW.successor_stage_id THEN
    RAISE EXCEPTION 'Cyclic quote stage dependency rejected (% -> %)',
      NEW.predecessor_stage_id, NEW.successor_stage_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quote_dep_cycle
BEFORE INSERT OR UPDATE ON public.quote_stage_dependencies
FOR EACH ROW EXECUTE FUNCTION public.quote_check_stage_dependency_cycle();

-- 4) quote_allocations ---------------------------------------

CREATE TABLE public.quote_allocations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id              uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  stage_id              uuid NOT NULL REFERENCES public.quote_stages(id) ON DELETE CASCADE,
  resource_id           uuid NOT NULL REFERENCES public.pm_resources(id) ON DELETE RESTRICT,
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  hours_per_day         numeric NOT NULL DEFAULT 8,
  allocation_percentage numeric,
  cost_rate_snapshot    numeric NOT NULL DEFAULT 0,
  sale_rate_snapshot    numeric NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_alloc_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT quote_alloc_pct_chk CHECK (
    allocation_percentage IS NULL
    OR (allocation_percentage >= 0 AND allocation_percentage <= 100)
  ),
  CONSTRAINT quote_alloc_hpd_chk CHECK (hours_per_day >= 0 AND hours_per_day <= 24)
);

CREATE INDEX idx_quote_alloc_quote ON public.quote_allocations(quote_id);
CREATE INDEX idx_quote_alloc_stage ON public.quote_allocations(stage_id);
CREATE INDEX idx_quote_alloc_resource ON public.quote_allocations(resource_id);

-- 5) quote_external_services ---------------------------------

CREATE TABLE public.quote_external_services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  stage_id          uuid REFERENCES public.quote_stages(id) ON DELETE SET NULL,
  supplier_id       uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  description       text NOT NULL,
  quantity          numeric NOT NULL DEFAULT 1,
  unit_cost         numeric NOT NULL DEFAULT 0,
  purchase_price    numeric NOT NULL DEFAULT 0,
  markup_type       public.quote_markup_type NOT NULL DEFAULT 'percent',
  markup_value      numeric NOT NULL DEFAULT 0,
  sale_price        numeric NOT NULL DEFAULT 0,
  sale_price_manual boolean NOT NULL DEFAULT false,
  status            public.quote_external_service_status NOT NULL DEFAULT 'draft',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_ext_quote ON public.quote_external_services(quote_id);
CREATE INDEX idx_quote_ext_stage ON public.quote_external_services(stage_id);
CREATE INDEX idx_quote_ext_supplier ON public.quote_external_services(supplier_id);

-- Sale-price compute trigger (clone of pm_materials_compute_sale_price)
CREATE OR REPLACE FUNCTION public.quote_external_services_compute_sale_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  total_cost numeric;
BEGIN
  IF NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    NEW.purchase_price := NEW.unit_cost;
  END IF;

  total_cost := COALESCE(NEW.purchase_price, 0) * COALESCE(NEW.quantity, 1);

  IF NEW.sale_price_manual = false THEN
    IF NEW.markup_type = 'percent' THEN
      NEW.sale_price := CASE
        WHEN COALESCE(NEW.quantity, 1) > 0
          THEN (total_cost * (1 + COALESCE(NEW.markup_value, 0) / 100.0)) / NEW.quantity
        ELSE 0
      END;
    ELSE
      NEW.sale_price := CASE
        WHEN COALESCE(NEW.quantity, 1) > 0
          THEN (total_cost + COALESCE(NEW.markup_value, 0)) / NEW.quantity
        ELSE 0
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quote_ext_compute_sale
BEFORE INSERT OR UPDATE ON public.quote_external_services
FOR EACH ROW EXECUTE FUNCTION public.quote_external_services_compute_sale_price();

-- 6) quote_payment_schedule_items ----------------------------

CREATE TABLE public.quote_payment_schedule_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id              uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  stage_id              uuid REFERENCES public.quote_stages(id) ON DELETE SET NULL,
  label                 text NOT NULL,
  trigger_type          public.quote_payment_trigger NOT NULL,
  amount_type           public.quote_payment_amount_type NOT NULL,
  amount_value          numeric NOT NULL DEFAULT 0,
  expected_invoice_date date,
  expected_payment_date date,
  sort_order            int NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_pay_amount_chk CHECK (amount_value >= 0),
  CONSTRAINT quote_pay_stage_required_chk CHECK (
    trigger_type NOT IN ('stage_start', 'stage_end') OR stage_id IS NOT NULL
  ),
  CONSTRAINT quote_pay_manual_date_chk CHECK (
    trigger_type <> 'manual_date' OR expected_invoice_date IS NOT NULL
  )
);

CREATE INDEX idx_quote_pay_quote ON public.quote_payment_schedule_items(quote_id, sort_order);
CREATE INDEX idx_quote_pay_stage ON public.quote_payment_schedule_items(stage_id);

-- 7) Column additions to existing tables ---------------------

ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS construction_cost    numeric,
  ADD COLUMN IF NOT EXISTS fee_percentage       numeric,
  ADD COLUMN IF NOT EXISTS pricing_multiplier   numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_number      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_quote_id      uuid REFERENCES public.fee_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_description text,
  ADD COLUMN IF NOT EXISTS quote_mode_ready     boolean NOT NULL DEFAULT false;

ALTER TABLE public.fee_proposals
  ADD CONSTRAINT fee_proposals_fee_pct_chk
    CHECK (fee_percentage IS NULL OR (fee_percentage >= 0 AND fee_percentage <= 100));

ALTER TABLE public.fee_proposals
  ADD CONSTRAINT fee_proposals_pricing_mult_chk
    CHECK (pricing_multiplier > 0);

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS project_brief text;

-- 8) RLS -----------------------------------------------------

ALTER TABLE public.quote_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_stage_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_external_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_payment_schedule_items ENABLE ROW LEVEL SECURITY;

-- quote_stages
CREATE POLICY "Authenticated read quote_stages" ON public.quote_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert quote_stages" ON public.quote_stages
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update quote_stages" ON public.quote_stages
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete quote_stages" ON public.quote_stages
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- quote_stage_dependencies
CREATE POLICY "Authenticated read quote_stage_dependencies" ON public.quote_stage_dependencies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert quote_stage_dependencies" ON public.quote_stage_dependencies
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update quote_stage_dependencies" ON public.quote_stage_dependencies
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete quote_stage_dependencies" ON public.quote_stage_dependencies
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- quote_allocations
CREATE POLICY "Authenticated read quote_allocations" ON public.quote_allocations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert quote_allocations" ON public.quote_allocations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update quote_allocations" ON public.quote_allocations
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete quote_allocations" ON public.quote_allocations
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- quote_external_services
CREATE POLICY "Authenticated read quote_external_services" ON public.quote_external_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert quote_external_services" ON public.quote_external_services
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update quote_external_services" ON public.quote_external_services
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete quote_external_services" ON public.quote_external_services
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- quote_payment_schedule_items
CREATE POLICY "Authenticated read quote_payment_schedule_items" ON public.quote_payment_schedule_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert quote_payment_schedule_items" ON public.quote_payment_schedule_items
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update quote_payment_schedule_items" ON public.quote_payment_schedule_items
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete quote_payment_schedule_items" ON public.quote_payment_schedule_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- 9) updated_at triggers -------------------------------------

CREATE TRIGGER trg_quote_stages_updated_at
  BEFORE UPDATE ON public.quote_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quote_stage_dependencies_updated_at
  BEFORE UPDATE ON public.quote_stage_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quote_allocations_updated_at
  BEFORE UPDATE ON public.quote_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quote_external_services_updated_at
  BEFORE UPDATE ON public.quote_external_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quote_payment_schedule_items_updated_at
  BEFORE UPDATE ON public.quote_payment_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
