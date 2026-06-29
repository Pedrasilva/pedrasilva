
-- Quote→Project live sync foundation
-- 1. Sync status on pm_projects
DO $$ BEGIN
  CREATE TYPE pm_sync_status AS ENUM ('live', 'paused', 'diverged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pm_projects
  ADD COLUMN IF NOT EXISTS sync_status pm_sync_status NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- 2. Mirror keys on pm_* tables
ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS source_quote_stage_id uuid;
CREATE INDEX IF NOT EXISTS idx_pm_stages_source_quote_stage_id
  ON public.pm_stages(source_quote_stage_id);

ALTER TABLE public.pm_stage_dependencies
  ADD COLUMN IF NOT EXISTS source_quote_dependency_id uuid;
CREATE INDEX IF NOT EXISTS idx_pm_stage_deps_source
  ON public.pm_stage_dependencies(source_quote_dependency_id);

ALTER TABLE public.pm_allocations
  ADD COLUMN IF NOT EXISTS source_quote_allocation_id uuid;
CREATE INDEX IF NOT EXISTS idx_pm_allocs_source
  ON public.pm_allocations(source_quote_allocation_id);

ALTER TABLE public.pm_materials
  ADD COLUMN IF NOT EXISTS source_quote_external_service_id uuid;
CREATE INDEX IF NOT EXISTS idx_pm_materials_source
  ON public.pm_materials(source_quote_external_service_id);

-- 3. Add children_bill_independently copy gap parity (already exists on pm_stages — verify)
-- (no-op if already present)

-- 4. Backfill source_quote_stage_id on existing pm_stages by matching
--    (project.quote_id, name, sort_order) — best-effort.
UPDATE public.pm_stages ps
SET source_quote_stage_id = qs.id
FROM public.pm_projects p, public.quote_stages qs
WHERE ps.project_id = p.id
  AND p.quote_id IS NOT NULL
  AND qs.quote_id = p.quote_id
  AND qs.name = ps.name
  AND COALESCE(qs.sort_order,0) = COALESCE(ps.sort_order,0)
  AND ps.source_quote_stage_id IS NULL;

-- 5. Live-sync trigger: when a quote_stage is UPDATEd, mirror the change
--    to every pm_stages row that references it AND whose project is 'live'.
CREATE OR REPLACE FUNCTION public.sync_quote_stage_to_pm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pm_stages ps
  SET name = NEW.name,
      start_date = COALESCE(NEW.start_date, ps.start_date),
      end_date = COALESCE(NEW.end_date, ps.end_date),
      color = COALESCE(NEW.color, ps.color),
      sort_order = COALESCE(NEW.sort_order, ps.sort_order),
      budget = COALESCE(NEW.budget, ps.budget),
      billing_model = COALESCE(NEW.billing_model, ps.billing_model),
      is_self = COALESCE(NEW.is_self, ps.is_self),
      children_bill_independently = COALESCE(NEW.children_bill_independently, ps.children_bill_independently),
      retainer_monthly_amount = COALESCE(NEW.retainer_monthly_amount, ps.retainer_monthly_amount)
  FROM public.pm_projects p
  WHERE ps.source_quote_stage_id = NEW.id
    AND ps.project_id = p.id
    AND p.sync_status = 'live';

  UPDATE public.pm_projects p
  SET last_synced_at = now()
  WHERE p.id IN (
    SELECT project_id FROM public.pm_stages WHERE source_quote_stage_id = NEW.id
  ) AND p.sync_status = 'live';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_quote_stage_to_pm ON public.quote_stages;
CREATE TRIGGER trg_sync_quote_stage_to_pm
AFTER UPDATE ON public.quote_stages
FOR EACH ROW EXECUTE FUNCTION public.sync_quote_stage_to_pm();

-- 6. Similar trigger for quote_allocations
CREATE OR REPLACE FUNCTION public.sync_quote_allocation_to_pm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pm_allocations pa
  SET start_date = NEW.start_date,
      end_date = NEW.end_date,
      hours_per_day = NEW.hours_per_day,
      allocation_percentage = NEW.allocation_percentage
  FROM public.pm_stages ps, public.pm_projects p
  WHERE pa.source_quote_allocation_id = NEW.id
    AND pa.stage_id = ps.id
    AND ps.project_id = p.id
    AND p.sync_status = 'live';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_quote_allocation_to_pm ON public.quote_allocations;
CREATE TRIGGER trg_sync_quote_allocation_to_pm
AFTER UPDATE ON public.quote_allocations
FOR EACH ROW EXECUTE FUNCTION public.sync_quote_allocation_to_pm();

-- 7. Trigger for quote_payment_schedule_items (mirror key already exists)
CREATE OR REPLACE FUNCTION public.sync_quote_payment_to_pm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pm_payment_schedule_items pp
  SET label = NEW.label,
      trigger_type = NEW.trigger_type,
      amount_type = NEW.amount_type,
      amount_value = NEW.amount_value,
      expected_invoice_date = NEW.expected_invoice_date,
      expected_payment_date = NEW.expected_payment_date,
      sort_order = NEW.sort_order,
      notes = NEW.notes,
      manual_override = NEW.manual_override,
      direction = NEW.direction,
      payment_offset_days = NEW.payment_offset_days,
      vat_rate = NEW.vat_rate,
      payment_terms = NEW.payment_terms
  FROM public.pm_projects p
  WHERE pp.source_quote_payment_item_id = NEW.id
    AND pp.project_id = p.id
    AND p.sync_status = 'live';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_quote_payment_to_pm ON public.quote_payment_schedule_items;
CREATE TRIGGER trg_sync_quote_payment_to_pm
AFTER UPDATE ON public.quote_payment_schedule_items
FOR EACH ROW EXECUTE FUNCTION public.sync_quote_payment_to_pm();
