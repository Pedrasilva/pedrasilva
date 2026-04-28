-- Backfill existing quotes into the new 3-category model.
UPDATE public.fee_proposals
SET quote_category = 'retainer'
WHERE quote_type = 'construction_retainer';

UPDATE public.fee_proposals
SET quote_category = 'time_based'
WHERE quote_type = 'consultancy_hours_package';

UPDATE public.fee_proposals
SET quote_category = 'project'
WHERE quote_type = 'standard_project';

-- Replace the validation trigger function so each category pins to exactly
-- one quote_type. Legacy 'consultancy' value stays accepted (mapped to
-- consultancy_hours_package) so any in-flight rows aren't rejected.
CREATE OR REPLACE FUNCTION public.fee_proposals_validate_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_category = 'project' AND NEW.quote_type <> 'standard_project' THEN
    RAISE EXCEPTION
      'Project quotes must use quote_type = standard_project (got %)',
      NEW.quote_type;
  END IF;
  IF NEW.quote_category = 'time_based' AND NEW.quote_type <> 'consultancy_hours_package' THEN
    RAISE EXCEPTION
      'Time-based quotes must use quote_type = consultancy_hours_package (got %)',
      NEW.quote_type;
  END IF;
  IF NEW.quote_category = 'retainer' AND NEW.quote_type <> 'construction_retainer' THEN
    RAISE EXCEPTION
      'Construction Retainer quotes must use quote_type = construction_retainer (got %)',
      NEW.quote_type;
  END IF;
  -- Legacy: keep accepting old 'consultancy' value mapped to hours_package
  IF NEW.quote_category = 'consultancy' AND NEW.quote_type <> 'consultancy_hours_package' THEN
    RAISE EXCEPTION
      'Consultancy quotes must use quote_type = consultancy_hours_package (got %)',
      NEW.quote_type;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure the trigger is wired up (it should already exist from the earlier
-- migration, but recreate defensively).
DROP TRIGGER IF EXISTS fee_proposals_validate_category_trigger ON public.fee_proposals;
CREATE TRIGGER fee_proposals_validate_category_trigger
  BEFORE INSERT OR UPDATE ON public.fee_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.fee_proposals_validate_category();