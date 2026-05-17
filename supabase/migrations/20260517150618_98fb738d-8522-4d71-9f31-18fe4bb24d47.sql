-- 1. Extend companies with accounting master-data fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS abbreviation text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS payment_terms text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_companies_supplier_code
  ON public.companies (code) WHERE is_supplier = true AND code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_companies_client_code
  ON public.companies (code) WHERE is_client = true AND code IS NOT NULL;

-- 2. Bridge supplier FKs to canonical companies table
ALTER TABLE public.pm_expenses
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.pm_materials
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.quote_external_services
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_expenses_supplier_company ON public.pm_expenses(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_pm_materials_supplier_company ON public.pm_materials(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_company_expenses_supplier_company ON public.company_expenses(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_quote_external_services_supplier_company ON public.quote_external_services(supplier_company_id);

-- 3. Migrate pm_suppliers → companies (idempotent, NIF-first then name match)
DO $$
DECLARE
  r RECORD;
  v_norm_nif text;
  v_company_id uuid;
BEGIN
  FOR r IN SELECT id, name, tax_id, email, phone, notes FROM public.pm_suppliers LOOP
    v_company_id := NULL;
    v_norm_nif := NULLIF(regexp_replace(COALESCE(r.tax_id, ''), '[^0-9]', '', 'g'), '');

    -- Match by NIF first
    IF v_norm_nif IS NOT NULL THEN
      SELECT id INTO v_company_id FROM public.companies WHERE nif = v_norm_nif LIMIT 1;
    END IF;

    -- Fallback: match by normalized name (case-insensitive, trimmed)
    IF v_company_id IS NULL THEN
      SELECT id INTO v_company_id
        FROM public.companies
       WHERE lower(trim(nome)) = lower(trim(r.name))
       LIMIT 1;
    END IF;

    -- Create canonical company if no match
    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (nome, nif, email, telefone, notas, is_supplier, is_active)
      VALUES (r.name, v_norm_nif, r.email, r.phone, r.notes, true, true)
      RETURNING id INTO v_company_id;
    ELSE
      -- Make sure existing row is flagged as supplier
      UPDATE public.companies SET is_supplier = true WHERE id = v_company_id AND is_supplier = false;
    END IF;

    -- Wire the bridge FK on dependent tables
    UPDATE public.pm_expenses SET supplier_company_id = v_company_id
      WHERE supplier_id = r.id AND supplier_company_id IS NULL;
    UPDATE public.pm_materials SET supplier_company_id = v_company_id
      WHERE supplier_id = r.id AND supplier_company_id IS NULL;
    UPDATE public.company_expenses SET supplier_company_id = v_company_id
      WHERE supplier_id = r.id AND supplier_company_id IS NULL;
    UPDATE public.quote_external_services SET supplier_company_id = v_company_id
      WHERE supplier_id = r.id AND supplier_company_id IS NULL;
  END LOOP;
END $$;