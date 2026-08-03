CREATE TABLE public.bank_statement_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  statement_number text NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT bank_statement_periods_range_ck CHECK (period_end_date >= period_start_date),
  CONSTRAINT bank_statement_periods_number_uk UNIQUE (bank_account_id, statement_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_periods TO authenticated;
GRANT ALL ON public.bank_statement_periods TO service_role;

ALTER TABLE public.bank_statement_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bank_statement_periods" ON public.bank_statement_periods
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert bank_statement_periods" ON public.bank_statement_periods
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update bank_statement_periods" ON public.bank_statement_periods
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete bank_statement_periods" ON public.bank_statement_periods
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bank_statement_periods_updated_at
  BEFORE UPDATE ON public.bank_statement_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX bank_statement_periods_account_idx
  ON public.bank_statement_periods (bank_account_id, period_start_date DESC);

ALTER TABLE public.bank_transactions
  ADD COLUMN statement_period_id uuid REFERENCES public.bank_statement_periods(id) ON DELETE SET NULL;

CREATE INDEX bank_transactions_statement_period_idx
  ON public.bank_transactions (statement_period_id);

CREATE OR REPLACE FUNCTION public.bank_statement_period_status(_account_id uuid DEFAULT NULL)
RETURNS TABLE(
  period_id uuid,
  bank_account_id uuid,
  statement_number text,
  period_start_date date,
  period_end_date date,
  opening_balance numeric,
  declared_closing numeric,
  reconciled_total numeric,
  reconciled_count integer,
  tx_count integer,
  computed_closing numeric,
  difference numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.id,
         p.bank_account_id,
         p.statement_number,
         p.period_start_date,
         p.period_end_date,
         p.opening_balance,
         p.closing_balance,
         COALESCE(m.total, 0),
         COALESCE(m.rec_cnt, 0),
         COALESCE(m.all_cnt, 0),
         p.opening_balance + COALESCE(m.total, 0),
         (p.opening_balance + COALESCE(m.total, 0)) - p.closing_balance
    FROM public.bank_statement_periods p
    LEFT JOIN LATERAL (
      SELECT SUM(bt.amount) FILTER (WHERE bt.reconciled_at IS NOT NULL) AS total,
             COUNT(*) FILTER (WHERE bt.reconciled_at IS NOT NULL)::int AS rec_cnt,
             COUNT(*)::int AS all_cnt
        FROM public.bank_transactions bt
       WHERE bt.bank_account_id = p.bank_account_id
         AND (
           bt.statement_period_id = p.id
           OR (bt.statement_period_id IS NULL
               AND bt.transaction_date >= p.period_start_date
               AND bt.transaction_date <= p.period_end_date)
         )
    ) m ON true
   WHERE _account_id IS NULL OR p.bank_account_id = _account_id
   ORDER BY p.period_start_date DESC;
$$;