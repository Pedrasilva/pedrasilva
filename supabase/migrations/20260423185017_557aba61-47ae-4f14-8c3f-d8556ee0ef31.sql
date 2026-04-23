-- Status enums
CREATE TYPE public.pm_external_service_status AS ENUM (
  'draft', 'approved', 'ordered', 'invoiced', 'partially_paid', 'paid', 'cancelled'
);

CREATE TYPE public.pm_expense_status AS ENUM (
  'draft', 'submitted', 'approved', 'paid'
);

CREATE TYPE public.pm_expense_category AS ENUM (
  'travel', 'accommodation', 'food', 'transport', 'printing', 'misc'
);

CREATE TYPE public.pm_markup_type AS ENUM ('percent', 'fixed');

-- Extend pm_materials (External Services)
ALTER TABLE public.pm_materials
  ADD COLUMN supplier_name text,
  ADD COLUMN supplier_contact text,
  ADD COLUMN unit_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN markup_type public.pm_markup_type NOT NULL DEFAULT 'percent',
  ADD COLUMN markup_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN sale_price_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN status public.pm_external_service_status NOT NULL DEFAULT 'draft',
  ADD COLUMN invoice_reference text,
  ADD COLUMN invoice_date date,
  ADD COLUMN due_date date,
  ADD COLUMN paid_at date;

-- Trigger: auto-compute sale_price from cost + markup when not manual
CREATE OR REPLACE FUNCTION public.pm_materials_compute_sale_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total_cost numeric;
BEGIN
  -- Keep purchase_price in sync with unit_cost*quantity if unit_cost provided
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
    ELSE -- fixed
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

CREATE TRIGGER pm_materials_compute_sale_price_trg
BEFORE INSERT OR UPDATE ON public.pm_materials
FOR EACH ROW EXECUTE FUNCTION public.pm_materials_compute_sale_price();

-- Extend pm_expenses
ALTER TABLE public.pm_expenses
  ADD COLUMN category public.pm_expense_category NOT NULL DEFAULT 'misc',
  ADD COLUMN vendor text,
  ADD COLUMN incurred_at date,
  ADD COLUMN paid_at date,
  ADD COLUMN status public.pm_expense_status NOT NULL DEFAULT 'draft',
  ADD COLUMN rebillable boolean NOT NULL DEFAULT false;

-- Backfill incurred_at from expense_date for existing rows
UPDATE public.pm_expenses
SET incurred_at = expense_date
WHERE incurred_at IS NULL AND expense_date IS NOT NULL;