CREATE OR REPLACE FUNCTION public.financial_document_recalc_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_id uuid;
  v_total  numeric(14,2);
  v_paid   numeric(14,2);
  v_status financial_doc_status;
  v_current_status financial_doc_status;
  v_bank_matched boolean;
BEGIN
  v_doc_id := COALESCE(NEW.document_id, OLD.document_id);

  SELECT total_inc_vat, status INTO v_total, v_current_status
    FROM public.financial_documents WHERE id = v_doc_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.financial_document_payments WHERE document_id = v_doc_id;

  SELECT EXISTS (
    SELECT 1 FROM public.financial_document_payments
     WHERE document_id = v_doc_id AND bank_transaction_id IS NOT NULL
  ) INTO v_bank_matched;

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
         payment_status = CASE
           WHEN v_bank_matched THEN 'reconciled'
           WHEN payment_status = 'reconciled' THEN 'awaiting_payment'
           ELSE payment_status
         END,
         updated_at  = now()
   WHERE id = v_doc_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

UPDATE public.financial_documents d
   SET payment_status = 'reconciled'
 WHERE EXISTS (
   SELECT 1 FROM public.financial_document_payments p
    WHERE p.document_id = d.id AND p.bank_transaction_id IS NOT NULL
 )
   AND d.payment_status <> 'reconciled';