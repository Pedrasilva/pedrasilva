ALTER TYPE public.fdrq_source ADD VALUE IF NOT EXISTS 'hr_benefit';

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS source_benefit_expense_id uuid
    REFERENCES public.benefit_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fdrq_source_benefit_expense_idx
  ON public.financial_document_review_queue(source_benefit_expense_id);

CREATE OR REPLACE FUNCTION public.benefit_expense_finance_sync_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_in_queue boolean;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    SELECT EXISTS (
      SELECT 1 FROM public.financial_document_review_queue q
      WHERE q.source_benefit_expense_id = NEW.id
        AND q.status <> 'rejected'
    ) INTO v_in_queue;

    IF NEW.estado = 'aprovada' AND OLD.estado <> 'aprovada' THEN
      -- Receipts routed to the accounting review queue are recorded there
      -- (classified by accounting); skip the automatic reimbursement line.
      IF NOT v_in_queue THEN
        PERFORM public.benefit_expense_link_to_finance(NEW.id);
      END IF;
    ELSIF NEW.estado = 'rejeitada' AND OLD.estado = 'aprovada' THEN
      PERFORM public.benefit_expense_cancel_finance_link(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;