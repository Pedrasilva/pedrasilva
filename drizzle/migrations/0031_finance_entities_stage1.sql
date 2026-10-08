CREATE TABLE public.finance_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nif text NOT NULL UNIQUE,
  invoicexpress_account text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.finance_entities IS 'Our own legal entities (PSA, later Pedra Rioja). NOT the CRM companies table (clients/suppliers).';
GRANT SELECT ON public.finance_entities TO authenticated;
GRANT ALL ON public.finance_entities TO service_role;
ALTER TABLE public.finance_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read finance entities" ON public.finance_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage finance entities" ON public.finance_entities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.finance_entities (id, name, nif) VALUES ('00000000-0000-4000-a000-000000000001', 'PSA', '506560376');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_accounts','bank_transactions','bank_statement_imports','bank_statement_periods','bank_balance_snapshots','bank_classification_rules',
    'financial_classifications','cost_categories','expense_categories','pm_suppliers','pm_invoices','pm_invoice_settings',
    'financial_documents','financial_document_review_queue','financial_periods','financial_debts','financial_expense_items','financial_income_items',
    'finance_recebimentos','company_expenses','benefit_expenses','pm_payment_schedule_items',
    'finance_intake_instructions','finance_sender_rules','finance_intake_settings','finance_intake_corrections','finance_duplicate_decisions',
    'financial_email_processed_messages','financial_email_ignored_items','financial_drive_processed_files','financial_import_logs','tax_withholdings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN entity_id uuid NOT NULL DEFAULT %L::uuid REFERENCES public.finance_entities(id)', t, '00000000-0000-4000-a000-000000000001');
    EXECUTE format('CREATE INDEX %I ON public.%I (entity_id)', t || '_entity_id_idx', t);
  END LOOP;
END $$;