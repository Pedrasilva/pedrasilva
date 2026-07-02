
-- Per-supplier administration markup for a quote (fee proposal).
CREATE TABLE public.quote_supplier_markups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE CASCADE,
  supplier_label text,
  markup_pct numeric NOT NULL DEFAULT 0 CHECK (markup_pct >= 0 AND markup_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_supplier_markups_identity_ck CHECK (
    supplier_company_id IS NOT NULL
    OR supplier_id IS NOT NULL
    OR (supplier_label IS NOT NULL AND length(btrim(supplier_label)) > 0)
  )
);

CREATE UNIQUE INDEX quote_supplier_markups_company_uk
  ON public.quote_supplier_markups (quote_id, supplier_company_id)
  WHERE supplier_company_id IS NOT NULL;

CREATE UNIQUE INDEX quote_supplier_markups_supplier_uk
  ON public.quote_supplier_markups (quote_id, supplier_id)
  WHERE supplier_id IS NOT NULL AND supplier_company_id IS NULL;

CREATE UNIQUE INDEX quote_supplier_markups_label_uk
  ON public.quote_supplier_markups (quote_id, lower(btrim(supplier_label)))
  WHERE supplier_company_id IS NULL AND supplier_id IS NULL AND supplier_label IS NOT NULL;

CREATE INDEX quote_supplier_markups_quote_ix ON public.quote_supplier_markups(quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_supplier_markups TO authenticated;
GRANT ALL ON public.quote_supplier_markups TO service_role;

ALTER TABLE public.quote_supplier_markups ENABLE ROW LEVEL SECURITY;

-- Mirror the access rules of quote_external_services: any authenticated user
-- who can reach the parent quote can manage its supplier markups.
CREATE POLICY "Authenticated read quote supplier markups"
  ON public.quote_supplier_markups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated write quote supplier markups"
  ON public.quote_supplier_markups
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_quote_supplier_markups_updated_at
  BEFORE UPDATE ON public.quote_supplier_markups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
