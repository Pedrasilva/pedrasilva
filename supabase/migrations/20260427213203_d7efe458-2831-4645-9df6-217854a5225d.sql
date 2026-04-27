-- Add a top-level Quote Category to fee_proposals so that
-- "Project" and "Consultancy" become two cleanly separated workflows.
-- quote_type stays as a sub-classification *within* each category:
--   project    → standard_project | construction_retainer
--   consultancy → consultancy_hours_package
--
-- Step 1: enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_quote_category') THEN
    CREATE TYPE public.crm_quote_category AS ENUM ('project', 'consultancy');
  END IF;
END$$;

-- Step 2: column (nullable first so we can backfill safely)
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS quote_category public.crm_quote_category;

-- Step 3: backfill from existing quote_type values
UPDATE public.fee_proposals
SET quote_category = CASE
  WHEN quote_type = 'consultancy_hours_package' THEN 'consultancy'::public.crm_quote_category
  ELSE 'project'::public.crm_quote_category   -- standard_project + construction_retainer
END
WHERE quote_category IS NULL;

-- Step 4: lock it down — NOT NULL with default 'project'
ALTER TABLE public.fee_proposals
  ALTER COLUMN quote_category SET NOT NULL,
  ALTER COLUMN quote_category SET DEFAULT 'project'::public.crm_quote_category;

-- Step 5: validation trigger that enforces category ↔ quote_type compatibility.
-- Cannot be a CHECK constraint because we want to allow safe migration of
-- legacy rows and provide clear error messages.
CREATE OR REPLACE FUNCTION public.fee_proposals_validate_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.quote_category = 'consultancy' AND NEW.quote_type <> 'consultancy_hours_package' THEN
    RAISE EXCEPTION
      'Consultancy quotes must use quote_type = consultancy_hours_package (got %)',
      NEW.quote_type;
  END IF;
  IF NEW.quote_category = 'project'
     AND NEW.quote_type NOT IN ('standard_project', 'construction_retainer') THEN
    RAISE EXCEPTION
      'Project quotes must use quote_type = standard_project or construction_retainer (got %)',
      NEW.quote_type;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fee_proposals_validate_category ON public.fee_proposals;
CREATE TRIGGER trg_fee_proposals_validate_category
  BEFORE INSERT OR UPDATE OF quote_category, quote_type ON public.fee_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fee_proposals_validate_category();

-- Step 6: helpful index for filtering
CREATE INDEX IF NOT EXISTS idx_fee_proposals_quote_category
  ON public.fee_proposals (quote_category);