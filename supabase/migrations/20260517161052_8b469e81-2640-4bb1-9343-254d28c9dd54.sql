
-- Auto-assign sequential code (F0001 for suppliers, C0001 for client-only)
-- when a company has no code yet. Never overwrites an existing code.
CREATE OR REPLACE FUNCTION public.assign_company_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next int;
  v_code text;
BEGIN
  -- Only act when code is blank
  IF NEW.code IS NOT NULL AND length(btrim(NEW.code)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Decide prefix: supplier wins for dual-role records
  IF COALESCE(NEW.is_supplier, false) THEN
    v_prefix := 'F';
  ELSIF COALESCE(NEW.is_client, false) THEN
    v_prefix := 'C';
  ELSE
    -- Neither role: leave code blank
    RETURN NEW;
  END IF;

  -- Find next numeric suffix for this prefix among existing codes that match
  SELECT COALESCE(MAX((substring(code FROM 2))::int), 0) + 1
    INTO v_next
    FROM public.companies
   WHERE code ~ ('^' || v_prefix || '[0-9]+$');

  v_code := v_prefix || lpad(v_next::text, 4, '0');
  NEW.code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_company_code ON public.companies;
CREATE TRIGGER trg_assign_company_code
BEFORE INSERT OR UPDATE OF is_supplier, is_client, code
ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.assign_company_code();

-- Backfill: existing rows missing codes
DO $$
DECLARE
  r RECORD;
  v_prefix text;
  v_next int;
BEGIN
  FOR r IN
    SELECT id, is_supplier, is_client
      FROM public.companies
     WHERE code IS NULL OR length(btrim(code)) = 0
     ORDER BY created_at NULLS LAST, id
  LOOP
    IF r.is_supplier THEN v_prefix := 'F';
    ELSIF r.is_client THEN v_prefix := 'C';
    ELSE CONTINUE;
    END IF;

    SELECT COALESCE(MAX((substring(code FROM 2))::int), 0) + 1
      INTO v_next
      FROM public.companies
     WHERE code ~ ('^' || v_prefix || '[0-9]+$');

    UPDATE public.companies
       SET code = v_prefix || lpad(v_next::text, 4, '0')
     WHERE id = r.id;
  END LOOP;
END $$;
