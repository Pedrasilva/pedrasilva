-- Pass 2: Lock Commercial Baseline on pm_projects
-- ─────────────────────────────────────────────────────────────────
-- When a quote is converted to a project, we snapshot the agreed
-- commercial fee onto pm_projects so the "sold price" stays locked
-- regardless of any future changes to project allocations or rates.
--
-- The sold_* columns are NULLABLE because:
--   1) Projects created before this migration have no sold baseline.
--   2) Projects created manually (without a quote conversion) never
--      pass through the conversion step that fills these in.

ALTER TABLE public.pm_projects
  ADD COLUMN IF NOT EXISTS sold_fee numeric,
  ADD COLUMN IF NOT EXISTS sold_internal_fee numeric,
  ADD COLUMN IF NOT EXISTS sold_external_fee numeric,
  ADD COLUMN IF NOT EXISTS sold_pricing_multiplier numeric,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz;

-- Guard: once the commercial baseline is locked (sold_at IS NOT NULL),
-- the sold_* values must not change. UPDATE may set them once (NULL → value)
-- but cannot mutate a non-null sold_at or shift any sold_* numbers.
CREATE OR REPLACE FUNCTION public.pm_projects_guard_sold_baseline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on rows that already have a locked baseline
  IF OLD.sold_at IS NOT NULL THEN
    IF NEW.sold_at IS DISTINCT FROM OLD.sold_at THEN
      RAISE EXCEPTION 'sold_at is locked once set and cannot be modified';
    END IF;
    IF NEW.sold_fee IS DISTINCT FROM OLD.sold_fee THEN
      RAISE EXCEPTION 'sold_fee is locked once the commercial baseline is set';
    END IF;
    IF NEW.sold_internal_fee IS DISTINCT FROM OLD.sold_internal_fee THEN
      RAISE EXCEPTION 'sold_internal_fee is locked once the commercial baseline is set';
    END IF;
    IF NEW.sold_external_fee IS DISTINCT FROM OLD.sold_external_fee THEN
      RAISE EXCEPTION 'sold_external_fee is locked once the commercial baseline is set';
    END IF;
    IF NEW.sold_pricing_multiplier IS DISTINCT FROM OLD.sold_pricing_multiplier THEN
      RAISE EXCEPTION 'sold_pricing_multiplier is locked once the commercial baseline is set';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_projects_guard_sold_baseline ON public.pm_projects;
CREATE TRIGGER pm_projects_guard_sold_baseline
  BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.pm_projects_guard_sold_baseline();

COMMENT ON COLUMN public.pm_projects.sold_fee IS
  'Total agreed fee at time of quote→project conversion. Immutable once set.';
COMMENT ON COLUMN public.pm_projects.sold_internal_fee IS
  'Internal-services portion of sold_fee at time of conversion. Immutable.';
COMMENT ON COLUMN public.pm_projects.sold_external_fee IS
  'External-services portion of sold_fee at time of conversion. Immutable.';
COMMENT ON COLUMN public.pm_projects.sold_pricing_multiplier IS
  'pricing_multiplier value at time of conversion. Immutable.';
COMMENT ON COLUMN public.pm_projects.sold_at IS
  'Timestamp when commercial baseline was locked via quote conversion. Immutable.';