DO $$ BEGIN
  CREATE TYPE public.company_relationship_type AS ENUM ('client','supplier','both','uncategorized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS relationship_type public.company_relationship_type
  NOT NULL DEFAULT 'uncategorized';

-- Backfill: PHC origin (is_client/is_supplier, derived from the C0…/F0… import codes)
-- is the primary source of truth; hub activity can only widen it.
WITH activity AS (
  SELECT c.id,
    c.is_client
      OR EXISTS (SELECT 1 FROM public.financial_documents d WHERE d.counterparty_client_id = c.id AND d.direction = 'issued')
      OR EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.company_id = c.id)
      OR EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.company_id = c.id) AS cli,
    c.is_supplier
      OR EXISTS (SELECT 1 FROM public.financial_documents d WHERE d.counterparty_supplier_id = c.id AND d.direction = 'received') AS sup
  FROM public.companies c
)
UPDATE public.companies c
SET relationship_type = CASE
  WHEN a.cli AND a.sup THEN 'both'
  WHEN a.cli THEN 'client'
  WHEN a.sup THEN 'supplier'
  ELSE 'uncategorized' END::public.company_relationship_type
FROM activity a WHERE a.id = c.id;

CREATE OR REPLACE FUNCTION public.companies_sync_relationship_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_client AND NEW.is_supplier THEN
    NEW.relationship_type := 'both';
  ELSIF NEW.is_client THEN
    NEW.relationship_type := 'client';
  ELSIF NEW.is_supplier THEN
    NEW.relationship_type := 'supplier';
  ELSIF TG_OP = 'INSERT' THEN
    NEW.relationship_type := 'uncategorized';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_relationship_type ON public.companies;
CREATE TRIGGER trg_companies_relationship_type
  BEFORE INSERT OR UPDATE OF is_client, is_supplier ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_sync_relationship_type();