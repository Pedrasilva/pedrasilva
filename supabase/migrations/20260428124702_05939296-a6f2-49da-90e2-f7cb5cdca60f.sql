-- =====================================================================
-- FINANCIAL MODULE — Phase 1 schema
-- =====================================================================

-- ---------- ENUMS ----------
CREATE TYPE public.financial_period_status AS ENUM ('projected','active','validated','closed');
CREATE TYPE public.financial_invoice_status AS ENUM ('planned','issued','paid','overdue','cancelled');
CREATE TYPE public.financial_expense_type AS ENUM ('operational','debt','project','consultant','tax','other');
CREATE TYPE public.financial_expense_status AS ENUM ('projected','confirmed','paid','overdue','cancelled');
CREATE TYPE public.financial_debt_status AS ENUM ('open','partially_paid','paid','renegotiated');
CREATE TYPE public.financial_debt_payment_status AS ENUM ('planned','paid','overdue','skipped');

-- ---------- BANK ACCOUNTS ----------
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  bank_name text,
  currency text NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  balance numeric(14,2) NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_balance_snapshots_account_date
  ON public.bank_balance_snapshots(bank_account_id, snapshot_date DESC);

-- ---------- FINANCIAL PERIODS ----------
CREATE TABLE public.financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  month_name text NOT NULL,
  status public.financial_period_status NOT NULL DEFAULT 'projected',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  closing_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

CREATE OR REPLACE FUNCTION public.financial_set_month_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pt_names text[] := ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                           'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
BEGIN
  NEW.month_name := pt_names[NEW.month];
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_financial_periods_month_name
BEFORE INSERT OR UPDATE OF month ON public.financial_periods
FOR EACH ROW EXECUTE FUNCTION public.financial_set_month_name();

CREATE TRIGGER trg_financial_periods_updated_at
BEFORE UPDATE ON public.financial_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- CLIENTS ----------
CREATE TABLE public.financial_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- INCOME ITEMS ----------
CREATE TABLE public.financial_income_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.financial_clients(id) ON DELETE SET NULL,
  project_id uuid,
  project_code text,
  project_name text,
  description text,
  invoice_number text,
  invoice_status public.financial_invoice_status NOT NULL DEFAULT 'planned',
  issue_date date,
  expected_payment_date date,
  paid_date date,
  period_id uuid REFERENCES public.financial_periods(id) ON DELETE SET NULL,
  amount_ex_vat numeric(14,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 23,
  vat_amount numeric(14,2) GENERATED ALWAYS AS (round(amount_ex_vat * vat_rate / 100, 2)) STORED,
  amount_inc_vat numeric(14,2) GENERATED ALWAYS AS (round(amount_ex_vat + (amount_ex_vat * vat_rate / 100), 2)) STORED,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_income_period ON public.financial_income_items(period_id);
CREATE INDEX idx_financial_income_status ON public.financial_income_items(invoice_status);

-- ---------- EXPENSE CATEGORIES ----------
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.expense_categories (name, sort_order) VALUES
  ('Rent', 10),
  ('Utilities', 20),
  ('Software', 30),
  ('Insurance', 40),
  ('Consultants', 50),
  ('Legal', 60),
  ('Taxes', 70),
  ('Office', 80),
  ('Transport', 90),
  ('Bank / Finance', 100),
  ('Other', 110);

-- ---------- SUPPLIERS (financial — distinct from pm_suppliers) ----------
CREATE TABLE public.financial_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  nif text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- EXPENSE ITEMS ----------
CREATE TABLE public.financial_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.financial_suppliers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.financial_periods(id) ON DELETE SET NULL,
  due_date date,
  paid_date date,
  description text,
  expense_type public.financial_expense_type NOT NULL DEFAULT 'operational',
  status public.financial_expense_status NOT NULL DEFAULT 'projected',
  amount_ex_vat numeric(14,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 23,
  vat_amount numeric(14,2) GENERATED ALWAYS AS (round(amount_ex_vat * vat_rate / 100, 2)) STORED,
  amount_inc_vat numeric(14,2) GENERATED ALWAYS AS (round(amount_ex_vat + (amount_ex_vat * vat_rate / 100), 2)) STORED,
  actual_amount_inc_vat numeric(14,2),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_expense_period ON public.financial_expense_items(period_id);
CREATE INDEX idx_financial_expense_status ON public.financial_expense_items(status);
CREATE INDEX idx_financial_expense_type ON public.financial_expense_items(expense_type);

-- ---------- DEBTS ----------
CREATE TABLE public.financial_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_name text NOT NULL,
  description text,
  original_amount numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.financial_debt_status NOT NULL DEFAULT 'open',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES public.financial_debts(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.financial_periods(id) ON DELETE SET NULL,
  due_date date,
  paid_date date,
  planned_amount numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount numeric(14,2),
  status public.financial_debt_payment_status NOT NULL DEFAULT 'planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_debt_payments_debt ON public.financial_debt_payments(debt_id);
CREATE INDEX idx_financial_debt_payments_period ON public.financial_debt_payments(period_id);

-- ---------- updated_at triggers for the rest ----------
CREATE TRIGGER trg_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_clients_updated_at BEFORE UPDATE ON public.financial_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_income_updated_at BEFORE UPDATE ON public.financial_income_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_suppliers_updated_at BEFORE UPDATE ON public.financial_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_expense_updated_at BEFORE UPDATE ON public.financial_expense_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_debts_updated_at BEFORE UPDATE ON public.financial_debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_financial_debt_payments_updated_at BEFORE UPDATE ON public.financial_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- CLOSED-PERIOD GUARD ----------
CREATE OR REPLACE FUNCTION public.financial_guard_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_is_closed boolean;
BEGIN
  -- Allow admins to bypass
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    -- Still block silent edits on closed periods unless going through reopen.
    -- Admins can simply reopen first; we keep guard active.
    NULL;
  END IF;

  v_period_id := COALESCE(NEW.period_id, OLD.period_id);
  IF v_period_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT is_closed INTO v_is_closed FROM public.financial_periods WHERE id = v_period_id;
  IF v_is_closed THEN
    RAISE EXCEPTION 'Period is closed — reopen it before editing financial records';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_income_guard_closed
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_income_items
FOR EACH ROW EXECUTE FUNCTION public.financial_guard_closed_period();

CREATE TRIGGER trg_expense_guard_closed
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_expense_items
FOR EACH ROW EXECUTE FUNCTION public.financial_guard_closed_period();

CREATE TRIGGER trg_debt_payment_guard_closed
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_debt_payments
FOR EACH ROW EXECUTE FUNCTION public.financial_guard_closed_period();

-- Prevent editing a closed period itself unless reopening it
CREATE OR REPLACE FUNCTION public.financial_guard_period_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_closed = true AND NEW.is_closed = true THEN
    -- Only allow updating opening/closing balance recalc and notes? Block by default.
    IF (NEW.year, NEW.month) IS DISTINCT FROM (OLD.year, OLD.month) THEN
      RAISE EXCEPTION 'Cannot change year/month of a closed period';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_period_guard
BEFORE UPDATE ON public.financial_periods
FOR EACH ROW EXECUTE FUNCTION public.financial_guard_period_edit();

-- ---------- CASH FLOW VIEW ----------
CREATE OR REPLACE VIEW public.financial_period_totals AS
SELECT
  p.id AS period_id,
  p.year,
  p.month,
  p.month_name,
  p.status,
  p.is_closed,
  p.opening_balance,
  COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_income_items i
            WHERE i.period_id = p.id), 0) AS income_projected,
  COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_income_items i
            WHERE i.period_id = p.id AND i.invoice_status = 'paid'), 0) AS income_actual,
  COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_expense_items e
            WHERE e.period_id = p.id AND e.expense_type <> 'debt'), 0) AS expense_projected,
  COALESCE((SELECT sum(COALESCE(actual_amount_inc_vat, amount_inc_vat))
            FROM public.financial_expense_items e
            WHERE e.period_id = p.id AND e.expense_type <> 'debt' AND e.status = 'paid'), 0) AS expense_actual,
  COALESCE((SELECT sum(planned_amount) FROM public.financial_debt_payments d
            WHERE d.period_id = p.id), 0) AS debt_planned,
  COALESCE((SELECT sum(COALESCE(actual_amount, planned_amount)) FROM public.financial_debt_payments d
            WHERE d.period_id = p.id AND d.status = 'paid'), 0) AS debt_actual,
  -- Net cash flow uses projected for forward months, actual for closed/validated
  CASE
    WHEN p.is_closed OR p.status = 'validated' THEN
      COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_income_items i
                WHERE i.period_id = p.id AND i.invoice_status = 'paid'), 0)
      - COALESCE((SELECT sum(COALESCE(actual_amount_inc_vat, amount_inc_vat))
                  FROM public.financial_expense_items e
                  WHERE e.period_id = p.id AND e.expense_type <> 'debt' AND e.status = 'paid'), 0)
      - COALESCE((SELECT sum(COALESCE(actual_amount, planned_amount))
                  FROM public.financial_debt_payments d
                  WHERE d.period_id = p.id AND d.status = 'paid'), 0)
    ELSE
      COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_income_items i
                WHERE i.period_id = p.id), 0)
      - COALESCE((SELECT sum(amount_inc_vat) FROM public.financial_expense_items e
                  WHERE e.period_id = p.id AND e.expense_type <> 'debt'), 0)
      - COALESCE((SELECT sum(planned_amount) FROM public.financial_debt_payments d
                  WHERE d.period_id = p.id), 0)
  END AS net_cash_flow,
  p.closing_balance
FROM public.financial_periods p;

-- ---------- RLS ----------
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_income_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_debt_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'bank_accounts','bank_balance_snapshots','financial_periods',
    'financial_clients','financial_income_items','expense_categories',
    'financial_suppliers','financial_expense_items','financial_debts',
    'financial_debt_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('CREATE POLICY "Authenticated read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Admins insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('CREATE POLICY "Admins update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('CREATE POLICY "Admins delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
  END LOOP;
END$$;