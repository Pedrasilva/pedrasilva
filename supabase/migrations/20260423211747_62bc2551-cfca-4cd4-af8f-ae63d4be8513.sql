-- =============================================================================
-- Financial ownership model
-- =============================================================================
-- Rule: every financial record belongs to EITHER a project OR the company,
-- never both. Project-owned tables already enforce project_id NOT NULL.
-- This migration adds a dedicated table for company-level (generic) expenses
-- so they remain cleanly separated from project financials.
-- =============================================================================

-- 1) Company-level generic expenses (rent, software, admin, etc.)
--    These intentionally have NO project_id column — ownership is unambiguous.
CREATE TABLE IF NOT EXISTS public.company_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category public.pm_expense_category NOT NULL DEFAULT 'misc',
  supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  vendor text,
  amount numeric NOT NULL DEFAULT 0,
  incurred_at date,
  paid_at date,
  status public.pm_expense_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_expenses_incurred_at
  ON public.company_expenses (incurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_expenses_supplier_id
  ON public.company_expenses (supplier_id);
CREATE INDEX IF NOT EXISTS idx_company_expenses_status
  ON public.company_expenses (status);

ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read company_expenses"
  ON public.company_expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins insert company_expenses"
  ON public.company_expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update company_expenses"
  ON public.company_expenses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete company_expenses"
  ON public.company_expenses FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_company_expenses_updated_at
  BEFORE UPDATE ON public.company_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Belt-and-braces: re-assert NOT NULL on project-owned financial tables.
--    These are already NOT NULL per schema, but stating intent here makes the
--    ownership rule explicit and survives any future column re-creation.
DO $$
BEGIN
  -- pm_materials.project_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pm_materials'
      AND column_name='project_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.pm_materials ALTER COLUMN project_id SET NOT NULL;
  END IF;

  -- pm_expenses.project_id (project-scoped expenses, e.g. rebillables)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pm_expenses'
      AND column_name='project_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.pm_expenses ALTER COLUMN project_id SET NOT NULL;
  END IF;

  -- pm_invoices.project_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pm_invoices'
      AND column_name='project_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.pm_invoices ALTER COLUMN project_id SET NOT NULL;
  END IF;

  -- pm_project_rate_overrides.project_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pm_project_rate_overrides'
      AND column_name='project_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.pm_project_rate_overrides
      ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;

-- 3) Documentation comments — make ownership explicit at the schema level.
COMMENT ON TABLE public.company_expenses IS
  'Company-level generic expenses (rent, software, admin). Never tied to a project. Excluded from project dashboards.';
COMMENT ON TABLE public.pm_expenses IS
  'Project-owned expenses. project_id is REQUIRED. For company-level expenses use public.company_expenses.';
COMMENT ON TABLE public.pm_materials IS
  'Project-owned external services / materials. project_id is REQUIRED.';
COMMENT ON TABLE public.pm_invoices IS
  'Project-owned billing. project_id is REQUIRED.';