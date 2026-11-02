ALTER TABLE public.pm_expenses
 ADD COLUMN workflow_version integer NOT NULL DEFAULT 1,
 ADD COLUMN entity_id uuid REFERENCES public.finance_entities(id),
 ADD COLUMN paid_from_account_id uuid REFERENCES public.bank_accounts(id),
 ADD COLUMN original_currency text,
 ADD COLUMN original_amount numeric(14,2),
 ADD COLUMN eur_amount numeric(14,2),
 ADD COLUMN exchange_rate numeric,
 ADD COLUMN exchange_rate_date date,
 ADD COLUMN exchange_rate_source text,
 ADD COLUMN exchange_evidence jsonb,
 ADD COLUMN rebill_mode text,
 ADD COLUMN markup_pct numeric,
 ADD COLUMN tax_treatment text,
 ADD COLUMN tax_parameters jsonb,
 ADD COLUMN tax_confirmed_by uuid,
 ADD COLUMN tax_confirmed_at timestamptz,
 ADD COLUMN purchase_document_id uuid REFERENCES public.financial_documents(id),
 ADD COLUMN expense_revision integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX pm_expense_purchase_document_unique ON public.pm_expenses(purchase_document_id) WHERE workflow_version=2 AND purchase_document_id IS NOT NULL;
ALTER TABLE public.financial_document_review_queue ADD COLUMN project_expense_context jsonb;
ALTER TABLE public.financial_documents ADD COLUMN project_expense_id uuid REFERENCES public.pm_expenses(id);
ALTER TABLE public.finance_holder_reimbursements ADD COLUMN project_expense_id uuid REFERENCES public.pm_expenses(id), ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz;
ALTER TABLE public.finance_holder_reimbursements ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE public.finance_holder_reimbursements ADD CONSTRAINT holder_reimbursement_has_origin CHECK (document_id IS NOT NULL OR project_expense_id IS NOT NULL) NOT VALID;
CREATE UNIQUE INDEX holder_project_expense_unique ON public.finance_holder_reimbursements(project_expense_id) WHERE project_expense_id IS NOT NULL;
CREATE TABLE public.project_expense_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), expense_id uuid NOT NULL REFERENCES public.pm_expenses(id), action text NOT NULL, before_value jsonb, after_value jsonb, reason text, evidence jsonb, actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.project_expense_events TO authenticated; GRANT ALL ON public.project_expense_events TO service_role; REVOKE TRUNCATE ON public.project_expense_events FROM anon,authenticated;
ALTER TABLE public.project_expense_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_events_read ON public.project_expense_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.pm_expenses e WHERE e.id=expense_id));
CREATE TABLE public.project_reimbursement_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES public.finance_entities(id), collaborator_id uuid NOT NULL REFERENCES public.collaborators(id), reference text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.project_reimbursement_batches TO authenticated; GRANT ALL ON public.project_reimbursement_batches TO service_role; REVOKE TRUNCATE ON public.project_reimbursement_batches FROM anon,authenticated;
ALTER TABLE public.project_reimbursement_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY reimbursement_batches_read ON public.project_reimbursement_batches FOR SELECT TO authenticated USING (is_psa_staff() AND ((fin_row_visible(entity_id) AND (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'))) OR collaborator_id=get_my_collaborator_id()));
CREATE TABLE public.project_reimbursement_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.project_reimbursement_batches(id), obligation_id uuid NOT NULL REFERENCES public.finance_holder_reimbursements(id), reserved_amount numeric(14,2) NOT NULL, bank_transaction_id uuid REFERENCES public.bank_transactions(id), settled_amount numeric(14,2) NOT NULL DEFAULT 0, actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reversed_at timestamptz, reversed_by uuid, reversal_reason text, CHECK(reserved_amount>0 AND settled_amount>=0 AND settled_amount<=reserved_amount));
GRANT SELECT ON public.project_reimbursement_allocations TO authenticated; GRANT ALL ON public.project_reimbursement_allocations TO service_role; REVOKE TRUNCATE ON public.project_reimbursement_allocations FROM anon,authenticated;
ALTER TABLE public.project_reimbursement_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reimbursement_allocations_read ON public.project_reimbursement_allocations FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.project_reimbursement_batches b WHERE b.id=batch_id));
CREATE TABLE public.project_expense_invoice_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), expense_id uuid NOT NULL REFERENCES public.pm_expenses(id), line_id uuid NOT NULL REFERENCES public.financial_document_lines(id), cost_amount numeric(14,2) NOT NULL, billed_amount numeric(14,2) NOT NULL, vat_amount numeric(14,2) NOT NULL, tax_treatment text NOT NULL, actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reversed_at timestamptz, reversed_by uuid, reversal_reason text, CHECK(cost_amount>0 AND billed_amount>=0));
GRANT SELECT ON public.project_expense_invoice_allocations TO authenticated; GRANT ALL ON public.project_expense_invoice_allocations TO service_role; REVOKE TRUNCATE ON public.project_expense_invoice_allocations FROM anon,authenticated;
ALTER TABLE public.project_expense_invoice_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_invoice_allocations_read ON public.project_expense_invoice_allocations FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.pm_expenses e WHERE e.id=expense_id));
CREATE UNIQUE INDEX expense_line_allocation_unique ON public.project_expense_invoice_allocations(expense_id,line_id) WHERE reversed_at IS NULL;
CREATE TABLE public.project_expense_receipt_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_allocation_id uuid NOT NULL REFERENCES public.project_expense_invoice_allocations(id), payment_id uuid NOT NULL REFERENCES public.financial_document_payments(id), amount numeric(14,2) NOT NULL CHECK(amount>0), actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reversed_at timestamptz, reversed_by uuid, reversal_reason text);
GRANT SELECT ON public.project_expense_receipt_allocations TO authenticated; GRANT ALL ON public.project_expense_receipt_allocations TO service_role; REVOKE TRUNCATE ON public.project_expense_receipt_allocations FROM anon,authenticated;
ALTER TABLE public.project_expense_receipt_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_receipts_read ON public.project_expense_receipt_allocations FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.project_expense_invoice_allocations a WHERE a.id=invoice_allocation_id));