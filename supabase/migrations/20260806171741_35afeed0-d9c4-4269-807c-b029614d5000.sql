ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS withholding_tax_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS extracted_withholding_amount numeric(14,2);

ALTER TABLE public.financial_documents DROP COLUMN IF EXISTS outstanding_amount;
ALTER TABLE public.financial_documents
  ADD COLUMN outstanding_amount numeric(14,2)
  GENERATED ALWAYS AS (total_inc_vat - withholding_tax_amount - paid_amount) STORED;

CREATE TABLE IF NOT EXISTS public.tax_withholdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_document_id uuid NOT NULL UNIQUE REFERENCES public.financial_documents(id) ON DELETE CASCADE,
  tax_kind text NOT NULL DEFAULT 'irs',
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_name_snapshot text,
  document_number text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  issue_date date NOT NULL,
  period date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  filed_at timestamptz,
  filed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_withholdings_status_chk CHECK (status IN ('pending','filed')),
  CONSTRAINT tax_withholdings_kind_chk CHECK (tax_kind IN ('irs'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_withholdings TO authenticated;
GRANT ALL ON public.tax_withholdings TO service_role;

ALTER TABLE public.tax_withholdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_withholdings_read"
  ON public.tax_withholdings FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_module_permission(auth.uid(), 'finance.documents.view'::text, 'all'::text)
  );

CREATE POLICY "tax_withholdings_write"
  ON public.tax_withholdings FOR ALL TO authenticated
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

CREATE INDEX IF NOT EXISTS idx_tax_withholdings_period ON public.tax_withholdings(period);
CREATE INDEX IF NOT EXISTS idx_tax_withholdings_status ON public.tax_withholdings(status);
CREATE INDEX IF NOT EXISTS idx_tax_withholdings_supplier ON public.tax_withholdings(supplier_company_id);

CREATE OR REPLACE FUNCTION public.tax_withholdings_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_withholdings_touch ON public.tax_withholdings;
CREATE TRIGGER trg_tax_withholdings_touch
  BEFORE UPDATE ON public.tax_withholdings
  FOR EACH ROW EXECUTE FUNCTION public.tax_withholdings_touch();

CREATE OR REPLACE FUNCTION public.financial_documents_sync_withholding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'received' AND COALESCE(NEW.withholding_tax_amount, 0) > 0 THEN
    INSERT INTO public.tax_withholdings AS tw (
      financial_document_id, supplier_company_id, supplier_name_snapshot,
      document_number, amount, currency, issue_date, period
    ) VALUES (
      NEW.id, NEW.counterparty_supplier_id, NEW.counterparty_name_snapshot,
      NEW.document_number, NEW.withholding_tax_amount, NEW.currency, NEW.issue_date,
      make_date(EXTRACT(year FROM NEW.issue_date)::int, EXTRACT(month FROM NEW.issue_date)::int, 1)
    )
    ON CONFLICT (financial_document_id) DO UPDATE SET
      supplier_company_id = EXCLUDED.supplier_company_id,
      supplier_name_snapshot = EXCLUDED.supplier_name_snapshot,
      document_number = EXCLUDED.document_number,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      issue_date = EXCLUDED.issue_date,
      period = EXCLUDED.period
    WHERE tw.status = 'pending';
  ELSE
    DELETE FROM public.tax_withholdings
      WHERE financial_document_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_findoc_sync_withholding ON public.financial_documents;
CREATE TRIGGER trg_findoc_sync_withholding
  AFTER INSERT OR UPDATE OF withholding_tax_amount, direction, issue_date, document_number, counterparty_supplier_id
  ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.financial_documents_sync_withholding();