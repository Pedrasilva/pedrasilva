ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS not_project_related boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.financial_documents_require_project_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only client-facing (issued) documents that are not drafts/cancelled.
  IF NEW.direction <> 'issued'
     OR NEW.status IN ('draft', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, do not block editing legacy rows that never had attribution.
  IF TG_OP = 'UPDATE'
     AND OLD.project_id IS NULL
     AND COALESCE(OLD.not_project_related, false) = false THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL AND COALESCE(NEW.not_project_related, false) = false THEN
    RAISE EXCEPTION 'Issued documents require a project, or must be explicitly marked as not project-related';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_documents_require_project_attribution ON public.financial_documents;
CREATE TRIGGER trg_financial_documents_require_project_attribution
BEFORE INSERT OR UPDATE ON public.financial_documents
FOR EACH ROW EXECUTE FUNCTION public.financial_documents_require_project_attribution();