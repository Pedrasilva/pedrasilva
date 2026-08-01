-- Enums
CREATE TYPE public.fdrq_source AS ENUM ('manual_upload', 'email_ingestion');
CREATE TYPE public.fdrq_doc_type AS ENUM ('invoice', 'receipt', 'proof_of_payment', 'unknown');
CREATE TYPE public.fdrq_supplier_match AS ENUM ('matched', 'no_match', 'ambiguous');
CREATE TYPE public.fdrq_status AS ENUM ('pending_review', 'approved', 'rejected');

CREATE TABLE public.financial_document_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_url text NOT NULL,
  source_bucket text NOT NULL DEFAULT 'financial-documents',
  original_filename text,
  source public.fdrq_source NOT NULL DEFAULT 'manual_upload',

  raw_extraction jsonb,
  extraction_error text,

  doc_type public.fdrq_doc_type NOT NULL DEFAULT 'unknown',
  doc_type_confidence numeric,

  extracted_amount numeric,
  extracted_vat_amount numeric,
  extracted_date date,
  extracted_due_date date,
  extracted_currency text DEFAULT 'EUR',
  extracted_document_number text,

  extracted_supplier_name text,
  extracted_supplier_vat text,
  supplier_match_status public.fdrq_supplier_match NOT NULL DEFAULT 'no_match',
  matched_supplier_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ambiguous_supplier_ids uuid[] NOT NULL DEFAULT '{}',

  suggested_classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL,
  suggested_classification_code text,
  classification_confidence numeric,

  is_recurring_candidate boolean NOT NULL DEFAULT false,
  recurring_reference_id uuid,

  linked_document_group_id uuid NOT NULL DEFAULT gen_random_uuid(),

  status public.fdrq_status NOT NULL DEFAULT 'pending_review',
  supplier_approved_at timestamptz,
  supplier_approved_by uuid,
  classification_approved_at timestamptz,
  classification_approved_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,

  created_project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  created_expense_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fdrq_status ON public.financial_document_review_queue(status);
CREATE INDEX idx_fdrq_group ON public.financial_document_review_queue(linked_document_group_id);
CREATE INDEX idx_fdrq_vat ON public.financial_document_review_queue(extracted_supplier_vat);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_document_review_queue TO authenticated;
GRANT ALL ON public.financial_document_review_queue TO service_role;
ALTER TABLE public.financial_document_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance users can read review queue"
ON public.financial_document_review_queue FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Finance users can insert review queue"
ON public.financial_document_review_queue FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Finance users can update review queue"
ON public.financial_document_review_queue FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Admins can delete review queue"
ON public.financial_document_review_queue FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_fdrq_updated_at
BEFORE UPDATE ON public.financial_document_review_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ignored / unprocessed email items (used by D4, created now so the audit trail exists)
CREATE TABLE public.financial_email_ignored_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  from_address text,
  subject text,
  attachment_filename text,
  reason text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_email_ignored_items TO authenticated;
GRANT ALL ON public.financial_email_ignored_items TO service_role;
ALTER TABLE public.financial_email_ignored_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance users can read ignored email items"
ON public.financial_email_ignored_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));

CREATE POLICY "Admins can manage ignored email items"
ON public.financial_email_ignored_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));