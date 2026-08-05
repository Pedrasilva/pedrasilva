CREATE TABLE public.cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_categories TO authenticated;
GRANT ALL ON public.cost_categories TO service_role;

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_categories_read ON public.cost_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY cost_categories_write ON public.cost_categories
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_module_permission(auth.uid(), 'finance.documents.edit'::text, 'all'::text)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_module_permission(auth.uid(), 'finance.documents.edit'::text, 'all'::text)
  );

CREATE OR REPLACE FUNCTION public.cost_categories_guard_default_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default THEN
    RAISE EXCEPTION 'Default cost categories cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER cost_categories_no_default_delete
  BEFORE DELETE ON public.cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.cost_categories_guard_default_delete();

INSERT INTO public.cost_categories (name, slug, is_default, sort_order) VALUES
  ('Salaries/HR', 'salaries_hr', true, 10),
  ('Consultants/Suppliers', 'consultants_suppliers', true, 20),
  ('Other operating', 'other_operating', true, 30);

ALTER TABLE public.financial_classifications
  ADD COLUMN cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE SET NULL;
ALTER TABLE public.financial_documents
  ADD COLUMN cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE SET NULL;
ALTER TABLE public.financial_expense_items
  ADD COLUMN cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE SET NULL;
ALTER TABLE public.company_expenses
  ADD COLUMN cost_category_id uuid REFERENCES public.cost_categories(id) ON DELETE SET NULL;

UPDATE public.financial_classifications fc
SET cost_category_id = cc.id
FROM public.cost_categories cc
WHERE cc.slug = 'salaries_hr'
  AND (fc.code LIKE 'HR.%' OR fc.code = 'HR' OR fc.code LIKE 'BEN.%' OR fc.code = 'BEN');

UPDATE public.financial_classifications fc
SET cost_category_id = cc.id
FROM public.cost_categories cc
WHERE cc.slug = 'consultants_suppliers'
  AND (fc.code LIKE 'PRD.%' OR fc.code = 'PRD');

UPDATE public.financial_classifications fc
SET cost_category_id = cc.id
FROM public.cost_categories cc
WHERE cc.slug = 'other_operating'
  AND fc.cost_category_id IS NULL
  AND fc.code NOT LIKE 'INC%'
  AND fc.code NOT LIKE 'TRF%';

CREATE INDEX idx_financial_documents_cost_category ON public.financial_documents (cost_category_id);
CREATE INDEX idx_financial_classifications_cost_category ON public.financial_classifications (cost_category_id);