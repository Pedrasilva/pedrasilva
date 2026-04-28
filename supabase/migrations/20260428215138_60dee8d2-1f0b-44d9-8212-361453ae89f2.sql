-- =========================================================
-- 1. Extend bank_accounts
-- =========================================================
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bic text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2),
  ADD COLUMN IF NOT EXISTS opening_balance_date date;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_accounts_iban
  ON public.bank_accounts (iban) WHERE iban IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_accounts_account_number
  ON public.bank_accounts (account_number) WHERE account_number IS NOT NULL;

-- =========================================================
-- 2. financial_classifications
-- =========================================================
CREATE TYPE financial_class_level AS ENUM ('category','group','subgroup');
CREATE TYPE financial_nature AS ENUM ('operational','project_cost','payroll','tax','financing','transfer');
CREATE TYPE financial_spending_policy AS ENUM ('mandatory','discretionary','pass_through');

CREATE TABLE public.financial_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_pt text NOT NULL,
  parent_id uuid REFERENCES public.financial_classifications(id) ON DELETE RESTRICT,
  level financial_class_level NOT NULL DEFAULT 'subgroup',
  financial_nature financial_nature NOT NULL,
  spending_policy financial_spending_policy NOT NULL DEFAULT 'discretionary',
  affects_profit boolean NOT NULL DEFAULT true,
  affects_cash_flow boolean NOT NULL DEFAULT true,
  project_link_allowed boolean NOT NULL DEFAULT false,
  supplier_required boolean NOT NULL DEFAULT false,
  collaborator_link_allowed boolean NOT NULL DEFAULT false,
  reimbursable_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fc_parent ON public.financial_classifications(parent_id);
CREATE INDEX idx_fc_active ON public.financial_classifications(active);

ALTER TABLE public.financial_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY fc_read ON public.financial_classifications FOR SELECT TO authenticated USING (true);
CREATE POLICY fc_admin_write ON public.financial_classifications FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fc_updated_at BEFORE UPDATE ON public.financial_classifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- 3. bank_statement_imports
-- =========================================================
CREATE TYPE bank_import_status AS ENUM ('pending','imported','rolled_back');

CREATE TABLE public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_checksum text NOT NULL,
  source_file_size_bytes bigint,
  period_start date,
  period_end date,
  exported_at date,
  rows_total int NOT NULL DEFAULT 0,
  rows_imported int NOT NULL DEFAULT 0,
  rows_skipped int NOT NULL DEFAULT 0,
  status bank_import_status NOT NULL DEFAULT 'imported',
  notes text,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_bank_import_account_checksum
  ON public.bank_statement_imports (bank_account_id, file_checksum);
CREATE INDEX idx_bsi_account ON public.bank_statement_imports(bank_account_id);

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY bsi_read ON public.bank_statement_imports FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY bsi_write ON public.bank_statement_imports FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE TRIGGER trg_bsi_updated_at BEFORE UPDATE ON public.bank_statement_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- 4. bank_transactions
-- =========================================================
CREATE TYPE bank_tx_status AS ENUM ('unclassified','classified','ignored','internal_transfer','archived');

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  statement_import_id uuid REFERENCES public.bank_statement_imports(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  value_date date,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  running_balance numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  raw_row jsonb,
  row_checksum text NOT NULL,
  status bank_tx_status NOT NULL DEFAULT 'unclassified',
  suggested_classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL,
  suggested_by_rule_id uuid,
  classified_at timestamptz,
  classified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_bank_tx_account_checksum
  ON public.bank_transactions (bank_account_id, row_checksum);
CREATE INDEX idx_bt_account_date ON public.bank_transactions(bank_account_id, transaction_date DESC);
CREATE INDEX idx_bt_status ON public.bank_transactions(status);
CREATE INDEX idx_bt_import ON public.bank_transactions(statement_import_id);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_read ON public.bank_transactions FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY bt_write ON public.bank_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE TRIGGER trg_bt_updated_at BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Guard: raw imported fields immutable after insert
CREATE OR REPLACE FUNCTION public.bank_tx_guard_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
     OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
     OR NEW.value_date IS DISTINCT FROM OLD.value_date
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.running_balance IS DISTINCT FROM OLD.running_balance
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.row_checksum IS DISTINCT FROM OLD.row_checksum
     OR NEW.statement_import_id IS DISTINCT FROM OLD.statement_import_id
  THEN
    RAISE EXCEPTION 'Raw imported bank transaction fields are immutable. Edit classification or status only.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bt_guard_immutable BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_tx_guard_immutable();

-- =========================================================
-- 5. bank_transaction_classifications (splits)
-- =========================================================
CREATE TABLE public.bank_transaction_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  classification_id uuid NOT NULL REFERENCES public.financial_classifications(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  supplier_id uuid REFERENCES public.financial_suppliers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.financial_clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  reimbursable boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_btc_tx ON public.bank_transaction_classifications(bank_transaction_id);
CREATE INDEX idx_btc_classification ON public.bank_transaction_classifications(classification_id);

ALTER TABLE public.bank_transaction_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY btc_read ON public.bank_transaction_classifications FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY btc_write ON public.bank_transaction_classifications FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE TRIGGER trg_btc_updated_at BEFORE UPDATE ON public.bank_transaction_classifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- 6. bank_classification_rules
-- =========================================================
CREATE TYPE bank_rule_match_type AS ENUM ('contains','starts_with','ends_with','equals','regex');

CREATE TABLE public.bank_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_type bank_rule_match_type NOT NULL DEFAULT 'contains',
  pattern text NOT NULL,
  case_sensitive boolean NOT NULL DEFAULT false,
  classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL,
  needs_review boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bcr_active_priority ON public.bank_classification_rules(active, priority);

ALTER TABLE public.bank_classification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bcr_read ON public.bank_classification_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY bcr_admin_write ON public.bank_classification_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bcr_updated_at BEFORE UPDATE ON public.bank_classification_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- 7. Seed starter classification grid
-- =========================================================
INSERT INTO public.financial_classifications
  (code, name_en, name_pt, level, financial_nature, spending_policy, affects_profit, affects_cash_flow, project_link_allowed, supplier_required, collaborator_link_allowed, reimbursable_default, sort_order)
VALUES
  -- Payroll
  ('payroll.salaries',    'Salaries',                'Vencimentos',                    'subgroup','payroll','mandatory',     true,true,false,false,true, false, 10),
  ('payroll.tsu',         'Social Security (TSU)',   'Segurança Social (TSU)',         'subgroup','payroll','mandatory',     true,true,false,false,true, false, 11),
  ('payroll.irs',         'Income Tax Withholding',  'IRS Retido',                     'subgroup','tax',    'mandatory',     true,true,false,false,true, false, 12),
  ('payroll.meal',        'Meal Allowance',          'Subsídio de Alimentação',        'subgroup','payroll','mandatory',     true,true,false,false,true, false, 13),
  ('payroll.benefits',    'Employee Benefits',       'Benefícios',                     'subgroup','payroll','discretionary', true,true,false,false,true, false, 14),
  -- Operational
  ('op.rent',             'Rent',                    'Renda',                          'subgroup','operational','mandatory',     true,true,false,true, false,false, 20),
  ('op.utilities',        'Utilities',               'Utilities',                      'subgroup','operational','mandatory',     true,true,false,true, false,false, 21),
  ('op.telecom',          'Telecom & Internet',      'Telecomunicações',               'subgroup','operational','mandatory',     true,true,false,true, false,false, 22),
  ('op.software',         'Software & Subscriptions','Software e Subscrições',         'subgroup','operational','discretionary', true,true,false,true, false,false, 23),
  ('op.office',           'Office Supplies',         'Material de Escritório',         'subgroup','operational','discretionary', true,true,false,false,false,false, 24),
  ('op.professional',     'Professional Fees',       'Honorários',                     'subgroup','operational','discretionary', true,true,false,true, false,false, 25),
  ('op.travel',           'Travel & Accommodation',  'Viagens e Alojamento',           'subgroup','operational','discretionary', true,true,true, false,true, true,  26),
  ('op.meals',            'Meals & Entertainment',   'Refeições e Representação',      'subgroup','operational','discretionary', true,true,true, false,true, true,  27),
  -- Project costs
  ('proj.external',       'External Services',       'Serviços Externos',              'subgroup','project_cost','pass_through',true,true,true, true, false,true, 30),
  ('proj.materials',      'Project Materials',       'Materiais de Projeto',           'subgroup','project_cost','pass_through',true,true,true, true, false,true, 31),
  -- Financing
  ('fin.bank_fees',       'Bank Fees',               'Comissões Bancárias',            'subgroup','financing','mandatory',     true,true,false,false,false,false, 40),
  ('fin.interest',        'Interest Expense',        'Juros',                          'subgroup','financing','mandatory',     true,true,false,false,false,false, 41),
  ('fin.loan_payment',    'Loan Repayment',          'Amortização de Empréstimo',      'subgroup','financing','mandatory',     false,true,false,false,false,false,42),
  -- Tax
  ('tax.vat',             'VAT Payment',             'Pagamento de IVA',               'subgroup','tax','mandatory',           false,true,false,false,false,false, 50),
  ('tax.corporate',       'Corporate Tax (IRC)',     'IRC',                            'subgroup','tax','mandatory',           true, true,false,false,false,false, 51),
  -- Transfers
  ('transfer.internal',   'Internal Bank Transfer',  'Transferência Interna',          'subgroup','transfer','discretionary',  false,true,false,false,false,false, 60),
  -- Income (positive amounts)
  ('income.client',       'Client Payment',          'Recebimento de Cliente',         'subgroup','operational','discretionary',true,true,true, false,false,false, 70),
  ('income.other',        'Other Income',            'Outros Recebimentos',            'subgroup','operational','discretionary',true,true,false,false,false,false, 71);

-- =========================================================
-- 8. Seed initial keyword rules
-- =========================================================
INSERT INTO public.bank_classification_rules (name, match_type, pattern, classification_id, needs_review, priority)
SELECT 'Payroll - PAGAMENTO VENCIMENTOS', 'contains', 'PAGAMENTO VENCIMENTOS', id, false, 10
  FROM public.financial_classifications WHERE code='payroll.salaries';
INSERT INTO public.bank_classification_rules (name, match_type, pattern, classification_id, needs_review, priority)
SELECT 'Bank fees - COMISSAO', 'contains', 'COMISSAO', id, false, 20
  FROM public.financial_classifications WHERE code='fin.bank_fees';
INSERT INTO public.bank_classification_rules (name, match_type, pattern, classification_id, needs_review, priority)
SELECT 'Utilities - DD GOLD ENERGY', 'contains', 'DD GOLD ENERGY', id, false, 30
  FROM public.financial_classifications WHERE code='op.utilities';
INSERT INTO public.bank_classification_rules (name, match_type, pattern, classification_id, needs_review, priority)
VALUES ('Outgoing transfer - TRF P/ (review)', 'starts_with', 'TRF P/', NULL, true, 40);