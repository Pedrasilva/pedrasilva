-- ============================================================
-- Phase 2d.3 — Stabilisation patch
-- BUG-1: FEI SELECT for finance.dashboard
-- BUG-3: Audit HR sync failures during settlement
-- BUG-6: Stable reimbursement-supplier marker
-- ============================================================

-- ---------- BUG-1: extend FEI SELECT policy ----------
DROP POLICY IF EXISTS "Admins read financial_expense_items" ON public.financial_expense_items;
DROP POLICY IF EXISTS "Finance reads financial_expense_items" ON public.financial_expense_items;

CREATE POLICY "Finance reads financial_expense_items"
ON public.financial_expense_items
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_permission(auth.uid(), 'finance.dashboard')
);

-- ---------- BUG-6: stable reimbursement supplier marker ----------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_reimbursement_supplier boolean NOT NULL DEFAULT false;

-- Backfill existing synthetic supplier (idempotent: name lookup is one-time bootstrap)
UPDATE public.companies
   SET is_reimbursement_supplier = true
 WHERE nome = 'Reembolsos a Colaboradores'
   AND is_supplier = true
   AND is_reimbursement_supplier = false;

-- Ensure at most one row carries the marker
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_one_reimbursement_supplier
  ON public.companies ((true))
  WHERE is_reimbursement_supplier = true;

-- Helper to resolve the supplier by stable marker (callable from client)
CREATE OR REPLACE FUNCTION public.get_reimbursement_supplier_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT id
    FROM public.companies
   WHERE is_reimbursement_supplier = true
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_reimbursement_supplier_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reimbursement_supplier_id() TO authenticated;

-- Update link function to use stable marker (fallback to legacy name for safety)
CREATE OR REPLACE FUNCTION public.benefit_expense_link_to_finance(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_exp        public.benefit_expenses;
  v_existing   uuid;
  v_supplier   uuid;
  v_collab_nm  text;
  v_cat_label  text;
  v_due        date;
  v_period     uuid;
  v_new_id     uuid;
BEGIN
  SELECT * INTO v_exp FROM public.benefit_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'benefit expense % not found', p_expense_id;
  END IF;

  IF v_exp.estado <> 'aprovada' THEN
    RAISE EXCEPTION 'benefit expense % not in aprovada state', p_expense_id;
  END IF;

  SELECT id INTO v_existing
  FROM public.financial_expense_items
  WHERE source_ref_table = 'benefit_expenses'
    AND source_ref_id    = p_expense_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Stable marker lookup; fallback to legacy name for resiliency
  SELECT id INTO v_supplier
    FROM public.companies
   WHERE is_reimbursement_supplier = true
   LIMIT 1;

  IF v_supplier IS NULL THEN
    SELECT id INTO v_supplier
      FROM public.companies
     WHERE nome = 'Reembolsos a Colaboradores' AND is_supplier = true
     LIMIT 1;
  END IF;

  SELECT nome INTO v_collab_nm FROM public.collaborators WHERE id = v_exp.collaborator_id;
  SELECT COALESCE(c.label_pt, lc.label_pt, v_exp.categoria::text)
    INTO v_cat_label
    FROM (SELECT 1) s
    LEFT JOIN public.benefit_categories c ON c.id = v_exp.category_id
    LEFT JOIN public.benefit_category_legacy_aliases la ON la.legacy_enum = v_exp.categoria
    LEFT JOIN public.benefit_categories lc ON lc.id = la.category_id;

  v_due := (date_trunc('month', v_exp.data_despesa) + INTERVAL '1 month - 1 day')::date;

  SELECT id INTO v_period
  FROM public.financial_periods
  WHERE year = EXTRACT(YEAR FROM v_due)::int
    AND month = EXTRACT(MONTH FROM v_due)::int
    AND is_closed = false
  LIMIT 1;

  INSERT INTO public.financial_expense_items (
    supplier_id, period_id, due_date, description,
    expense_type, status,
    amount_ex_vat, vat_rate, actual_amount_inc_vat,
    source_ref_table, source_ref_id, created_by
  ) VALUES (
    v_supplier, v_period, v_due,
    format('Reembolso benefícios — %s — %s', COALESCE(v_collab_nm, '?'), COALESCE(v_cat_label, '?')),
    'operational', 'confirmed',
    v_exp.valor, 0, v_exp.valor,
    'benefit_expenses', p_expense_id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

-- ---------- BUG-3: audit HR sync failures during settlement ----------
CREATE OR REPLACE FUNCTION public.finance_settle_expense(
  p_expense_item_id     uuid,
  p_bank_transaction_id uuid,
  p_amount              numeric,
  p_payment_date        date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_fei          record;
  v_tx_exists    boolean;
  v_already_sum  numeric(14,2);
  v_expected     numeric(14,2);
  v_payment_id   uuid;
  v_sync_err     text;
  v_sync_state   text;
  v_be_id        uuid;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_permission(v_uid, 'finance.dashboard')
  ) THEN
    RAISE EXCEPTION 'forbidden: admin or finance role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_expense_item_id IS NULL OR p_bank_transaction_id IS NULL THEN
    RAISE EXCEPTION 'expense_item_id and bank_transaction_id are required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment_date is required';
  END IF;

  SELECT id, status, actual_amount_inc_vat, amount_inc_vat, amount_ex_vat,
         source_ref_table, source_ref_id
    INTO v_fei
    FROM public.financial_expense_items
   WHERE id = p_expense_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense item % not found', p_expense_item_id;
  END IF;
  IF v_fei.status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot settle cancelled expense item %', p_expense_item_id;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.bank_transactions WHERE id = p_bank_transaction_id)
    INTO v_tx_exists;
  IF NOT v_tx_exists THEN
    RAISE EXCEPTION 'bank transaction % not found', p_bank_transaction_id;
  END IF;

  v_expected := COALESCE(v_fei.actual_amount_inc_vat, v_fei.amount_inc_vat, v_fei.amount_ex_vat, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_already_sum
    FROM public.financial_expense_payments
   WHERE expense_item_id = p_expense_item_id;

  IF v_expected > 0 AND v_already_sum >= v_expected THEN
    RAISE EXCEPTION 'expense item % is already fully settled', p_expense_item_id;
  END IF;

  INSERT INTO public.financial_expense_payments (
    expense_item_id, bank_transaction_id, amount, payment_date,
    method, notes, created_by
  ) VALUES (
    p_expense_item_id, p_bank_transaction_id, p_amount, p_payment_date,
    'bank_transfer',
    'Settled via bank reconciliation',
    v_uid
  )
  RETURNING id INTO v_payment_id;

  -- Best-effort HR mirror — failures are audited, never block settlement
  IF EXISTS (
    SELECT 1 FROM public.financial_expense_items fei
     WHERE fei.id = p_expense_item_id
       AND fei.status = 'paid'
       AND fei.source_ref_table = 'benefit_expenses'
  ) THEN
    SELECT source_ref_id INTO v_be_id
      FROM public.financial_expense_items WHERE id = p_expense_item_id;

    BEGIN
      PERFORM public.benefit_expense_set_status(
        v_be_id,
        'paga'::public.expense_status,
        NULL
      );

      INSERT INTO public.benefit_expense_events (expense_id, event_type, metadata)
      VALUES (
        v_be_id,
        'finance_paid',
        jsonb_build_object(
          'finance_item_id',     p_expense_item_id,
          'payment_id',          v_payment_id,
          'bank_transaction_id', p_bank_transaction_id,
          'amount',              p_amount,
          'bank_linked',         true,
          'via',                 'reconciliation'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_sync_err   := SQLERRM;
      v_sync_state := SQLSTATE;
      -- Record the drift so admins can spot it
      BEGIN
        INSERT INTO public.benefit_expense_events (expense_id, event_type, metadata)
        VALUES (
          v_be_id,
          'finance_paid_hr_sync_failed',
          jsonb_build_object(
            'finance_item_id',     p_expense_item_id,
            'payment_id',          v_payment_id,
            'bank_transaction_id', p_bank_transaction_id,
            'amount',              p_amount,
            'sqlstate',            v_sync_state,
            'sqlerrm',             v_sync_err,
            'via',                 'reconciliation'
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- last-resort: even the audit insert failed, swallow
        NULL;
      END;
    END;
  END IF;

  RETURN v_payment_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finance_settle_expense(uuid, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_settle_expense(uuid, uuid, numeric, date) TO authenticated;