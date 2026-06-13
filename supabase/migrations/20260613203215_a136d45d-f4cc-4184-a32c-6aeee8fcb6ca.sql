
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_placeholder text,
  ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_quote_stages_supplier_id ON public.quote_stages(supplier_id);

-- Backfill: stages currently pointing at "Pedra Silva Arquitectos" → is_self = true
UPDATE public.quote_stages qs
SET is_self = true
FROM public.companies c
WHERE qs.supplier_company_id = c.id
  AND c.nome ILIKE 'Pedra Silva Arquitectos%';
