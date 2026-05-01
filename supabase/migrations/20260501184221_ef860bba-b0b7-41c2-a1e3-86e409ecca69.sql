-- Trigger: auto-classify bank_transactions when a payment links to one
CREATE OR REPLACE FUNCTION public.bank_tx_auto_classify_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.bank_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.bank_transactions bt
     SET status = 'classified',
         classified_at = COALESCE(bt.classified_at, now()),
         classified_by = COALESCE(bt.classified_by, NEW.created_by)
   WHERE bt.id = NEW.bank_transaction_id
     AND bt.status IS DISTINCT FROM 'classified';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_tx_auto_classify_on_payment_ins ON public.financial_document_payments;
CREATE TRIGGER trg_bank_tx_auto_classify_on_payment_ins
AFTER INSERT ON public.financial_document_payments
FOR EACH ROW
EXECUTE FUNCTION public.bank_tx_auto_classify_on_payment();

DROP TRIGGER IF EXISTS trg_bank_tx_auto_classify_on_payment_upd ON public.financial_document_payments;
CREATE TRIGGER trg_bank_tx_auto_classify_on_payment_upd
AFTER UPDATE OF bank_transaction_id ON public.financial_document_payments
FOR EACH ROW
WHEN (NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id)
EXECUTE FUNCTION public.bank_tx_auto_classify_on_payment();

-- Backfill: any existing linked payments where bank_tx is not classified
UPDATE public.bank_transactions bt
   SET status = 'classified',
       classified_at = COALESCE(bt.classified_at, now()),
       classified_by = COALESCE(bt.classified_by, p.created_by)
  FROM public.financial_document_payments p
 WHERE p.bank_transaction_id = bt.id
   AND bt.status IS DISTINCT FROM 'classified';

-- Inconsistency report function (admin-only)
CREATE OR REPLACE FUNCTION public.finance_inconsistency_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_linked_not_classified jsonb;
  v_classified_orphan jsonb;
  v_payment_missing_tx jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1) linked payment but bank_tx not classified
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bank_transaction_id', bt.id,
           'description', bt.description,
           'amount', bt.amount,
           'status', bt.status,
           'document_id', p.document_id
         )), '[]'::jsonb)
    INTO v_linked_not_classified
    FROM public.financial_document_payments p
    JOIN public.bank_transactions bt ON bt.id = p.bank_transaction_id
   WHERE bt.status IS DISTINCT FROM 'classified';

  -- 2) bank_tx classified but no split AND no linked payment
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bank_transaction_id', bt.id,
           'description', bt.description,
           'amount', bt.amount
         )), '[]'::jsonb)
    INTO v_classified_orphan
    FROM public.bank_transactions bt
   WHERE bt.status = 'classified'
     AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_classifications c WHERE c.bank_transaction_id = bt.id)
     AND NOT EXISTS (SELECT 1 FROM public.financial_document_payments p WHERE p.bank_transaction_id = bt.id);

  -- 3) payment with bank_transfer method but no bank_transaction_id
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'payment_id', p.id,
           'document_id', p.document_id,
           'amount', p.amount,
           'payment_date', p.payment_date,
           'method', p.method
         )), '[]'::jsonb)
    INTO v_payment_missing_tx
    FROM public.financial_document_payments p
   WHERE p.bank_transaction_id IS NULL
     AND p.method = 'bank_transfer';

  RETURN jsonb_build_object(
    'linked_payment_not_classified', v_linked_not_classified,
    'classified_orphan', v_classified_orphan,
    'payment_missing_bank_tx', v_payment_missing_tx,
    'counts', jsonb_build_object(
      'linked_payment_not_classified', jsonb_array_length(v_linked_not_classified),
      'classified_orphan', jsonb_array_length(v_classified_orphan),
      'payment_missing_bank_tx', jsonb_array_length(v_payment_missing_tx)
    )
  );
END;
$$;