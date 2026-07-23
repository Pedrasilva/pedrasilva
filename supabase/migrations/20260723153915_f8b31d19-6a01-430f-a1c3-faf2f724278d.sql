ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS sale_source text
    CHECK (sale_source IN ('allocation','budget'));
COMMENT ON COLUMN public.quote_stages.sale_source IS
  'Per-stage override for how the sale value is derived: allocation (sum of resource allocations) or budget (manual value). NULL = follow the quote-level fee_source_mode.';