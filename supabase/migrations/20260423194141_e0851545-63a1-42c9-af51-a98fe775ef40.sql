-- Create pm_suppliers table
CREATE TABLE public.pm_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  tax_id text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pm_suppliers ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read suppliers (consistent with other pm_* tables)
CREATE POLICY "Authenticated read pm_suppliers"
ON public.pm_suppliers FOR SELECT
TO authenticated
USING (true);

-- Admins manage suppliers
CREATE POLICY "Admins insert pm_suppliers"
ON public.pm_suppliers FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update pm_suppliers"
ON public.pm_suppliers FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete pm_suppliers"
ON public.pm_suppliers FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pm_suppliers_updated_at
BEFORE UPDATE ON public.pm_suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for active filter
CREATE INDEX idx_pm_suppliers_active ON public.pm_suppliers(active) WHERE active = true;

-- Add supplier_id to pm_materials (External services) — nullable FK, keep legacy fields
ALTER TABLE public.pm_materials
  ADD COLUMN supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_pm_materials_supplier_id ON public.pm_materials(supplier_id);

-- Optional: add supplier_id to pm_expenses (low-risk, nullable, vendor free text preserved)
ALTER TABLE public.pm_expenses
  ADD COLUMN supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_pm_expenses_supplier_id ON public.pm_expenses(supplier_id);