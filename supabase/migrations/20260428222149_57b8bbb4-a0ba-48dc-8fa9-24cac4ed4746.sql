-- ENUMS
CREATE TYPE public.financial_doc_type AS ENUM (
  'client_invoice','client_credit_note','supplier_invoice','supplier_credit_note','receipt','other'
);
CREATE TYPE public.financial_doc_direction AS ENUM ('issued','received');
CREATE TYPE public.financial_doc_source AS ENUM ('manual','project','import','ocr');
CREATE TYPE public.financial_doc_status AS ENUM ('draft','issued','partially_paid','paid','cancelled');
CREATE TYPE public.financial_payment_method AS ENUM ('bank_transfer','cash','card','direct_debit','other');

-- financial_documents
CREATE TABLE public.financial_documents (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type                 financial_doc_type NOT NULL,
  direction                financial_doc_direction NOT NULL,
  source                   financial_doc_source NOT NULL DEFAULT 'manual',
  status                   financial_doc_status NOT NULL DEFAULT 'draft',
  document_number          text,
  external_reference       text,
  issue_date               date NOT NULL,
  due_date                 date,
  -- VAT period: first day of the month of issue_date. make_date is IMMUTABLE.
  vat_period               date GENERATED ALWAYS AS (
    make_date(EXTRACT(YEAR FROM issue_date)::int, EXTRACT(MONTH FROM issue_date)::int, 1)
  ) STORED,
  counterparty_supplier_id uuid REFERENCES public.financial_suppliers(id) ON DELETE SET NULL,
  counterparty_client_id   uuid REFERENCES public.financial_clients(id) ON DELETE SET NULL,
  counterparty_name_snapshot text,
  project_id               uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  classification_id        uuid REFERENCES public.financial_classifications(id) ON DELETE RESTRICT,
  currency                 text NOT NULL DEFAULT 'EUR',
  subtotal_ex_vat          numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount               numeric(14,2) NOT NULL DEFAULT 0,
  total_inc_vat            numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount              numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount       numeric(14,2) GENERATED ALWAYS AS (total_inc_vat - paid_amount) STORED,
  source_ref_table         text,
  source_ref_id            uuid,
  file_path                text,
  ocr_metadata             jsonb,
  notes                    text,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_direction_counterparty CHECK (
    (direction = 'issued'   AND counterparty_supplier_id IS NULL) OR
    (direction = 'received' AND counterparty_client_id   IS NULL)
  ),
  CONSTRAINT chk_paid_within_total CHECK (paid_amount >= 0 AND paid_amount <= total_inc_vat)
);

CREATE INDEX idx_findoc_issue_date     ON public.financial_documents (issue_date);
CREATE INDEX idx_findoc_vat_period     ON public.financial_documents (vat_period);
CREATE INDEX idx_findoc_status         ON public.financial_documents (status);
CREATE INDEX idx_findoc_project        ON public.financial_documents (project_id);
CREATE INDEX idx_findoc_supplier       ON public.financial_documents (counterparty_supplier_id);
CREATE INDEX idx_findoc_client         ON public.financial_documents (counterparty_client_id);
CREATE INDEX idx_findoc_source_ref     ON public.financial_documents (source_ref_table, source_ref_id);
CREATE INDEX idx_findoc_classification ON public.financial_documents (classification_id);

CREATE TRIGGER trg_findoc_updated_at
  BEFORE UPDATE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "findoc_read" ON public.financial_documents
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "findoc_write" ON public.financial_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

-- financial_document_lines
CREATE TABLE public.financial_document_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL REFERENCES public.financial_documents(id) ON DELETE CASCADE,
  description       text NOT NULL,
  quantity          numeric(14,4) NOT NULL DEFAULT 1,
  unit_price_ex_vat numeric(14,4) NOT NULL DEFAULT 0,
  vat_rate          numeric(5,2) NOT NULL DEFAULT 23,
  vat_code          text,
  amount_ex_vat     numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price_ex_vat, 2)) STORED,
  vat_amount        numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price_ex_vat * vat_rate / 100.0, 2)) STORED,
  amount_inc_vat    numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price_ex_vat * (1 + vat_rate / 100.0), 2)) STORED,
  classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE RESTRICT,
  project_id        uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  reimbursable      boolean NOT NULL DEFAULT false,
  sort_order        int NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_findoc_line_doc            ON public.financial_document_lines (document_id);
CREATE INDEX idx_findoc_line_classification ON public.financial_document_lines (classification_id);
CREATE INDEX idx_findoc_line_project        ON public.financial_document_lines (project_id);
CREATE INDEX idx_findoc_line_reimbursable   ON public.financial_document_lines (reimbursable) WHERE reimbursable = true;

CREATE TRIGGER trg_findoc_line_updated_at
  BEFORE UPDATE ON public.financial_document_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_document_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "findoc_line_read" ON public.financial_document_lines
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "findoc_line_write" ON public.financial_document_lines
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

-- financial_document_payments
CREATE TABLE public.financial_document_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES public.financial_documents(id) ON DELETE CASCADE,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date        date NOT NULL,
  method              financial_payment_method NOT NULL DEFAULT 'bank_transfer',
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_findoc_pay_doc  ON public.financial_document_payments (document_id);
CREATE INDEX idx_findoc_pay_bank ON public.financial_document_payments (bank_transaction_id);
CREATE INDEX idx_findoc_pay_date ON public.financial_document_payments (payment_date);

CREATE TRIGGER trg_findoc_pay_updated_at
  BEFORE UPDATE ON public.financial_document_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_document_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "findoc_pay_read" ON public.financial_document_payments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "findoc_pay_write" ON public.financial_document_payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'));

-- Trigger: keep paid_amount + status in sync with payments
CREATE OR REPLACE FUNCTION public.financial_document_recalc_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id uuid;
  v_total  numeric(14,2);
  v_paid   numeric(14,2);
  v_status financial_doc_status;
  v_current_status financial_doc_status;
BEGIN
  v_doc_id := COALESCE(NEW.document_id, OLD.document_id);

  SELECT total_inc_vat, status INTO v_total, v_current_status
    FROM public.financial_documents WHERE id = v_doc_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.financial_document_payments WHERE document_id = v_doc_id;

  IF v_current_status IN ('draft', 'cancelled') THEN
    v_status := v_current_status;
  ELSIF v_paid <= 0 THEN
    v_status := 'issued';
  ELSIF v_paid >= v_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'partially_paid';
  END IF;

  UPDATE public.financial_documents
     SET paid_amount = v_paid,
         status      = v_status,
         updated_at  = now()
   WHERE id = v_doc_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_findoc_pay_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_document_payments
  FOR EACH ROW EXECUTE FUNCTION public.financial_document_recalc_payment();

-- Link pm_invoices ↔ financial_documents (no auto-trigger yet)
ALTER TABLE public.pm_invoices
  ADD COLUMN financial_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL;

CREATE INDEX idx_pm_invoices_findoc ON public.pm_invoices (financial_document_id);
