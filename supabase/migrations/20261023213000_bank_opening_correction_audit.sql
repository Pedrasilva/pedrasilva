CREATE TABLE public.bank_balance_correction_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
 record_table text NOT NULL CHECK(record_table IN ('bank_accounts','bank_transactions','bank_statement_imports')),
 record_id uuid NOT NULL, before_row jsonb NOT NULL, after_changes jsonb NOT NULL,
 source_document text NOT NULL, source_url text, reason text NOT NULL,
 actor_id uuid NOT NULL, actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank_balance_correction_audit TO authenticated;
GRANT ALL ON public.bank_balance_correction_audit TO service_role;
REVOKE ALL ON public.bank_balance_correction_audit FROM anon;
REVOKE TRUNCATE ON public.bank_balance_correction_audit FROM anon, authenticated;
ALTER TABLE public.bank_balance_correction_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_correction_admin_read ON public.bank_balance_correction_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') AND public.has_entity_access(entity_id));
CREATE OR REPLACE FUNCTION public.bank_tx_guard_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
DECLARE v_allow_account_move boolean := coalesce(current_setting('app.allow_bank_tx_account_move',true)='on',false); v_authorized_date boolean := false;
BEGIN
 IF NOT v_allow_account_move AND NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN RAISE EXCEPTION 'bank_transactions.bank_account_id is immutable outside the move-import flow'; END IF;
 -- A service-written approval is required for this exact previously confirmed date correction.
 IF OLD.id='6bfa8c0a-e52b-4433-88c2-01f2c6cd3e2c' AND OLD.transaction_date='2026-05-31' AND NEW.transaction_date='2026-06-01' AND OLD.amount=-6.70 THEN
  SELECT EXISTS(SELECT 1 FROM public.bank_balance_correction_audit a WHERE a.record_table='bank_transactions' AND a.record_id=OLD.id AND a.before_row->>'transaction_date'='2026-05-31' AND a.after_changes->>'transaction_date'='2026-06-01' AND public.has_role(a.actor_id,'admin')) INTO v_authorized_date;
 END IF;
 IF (NEW.transaction_date IS DISTINCT FROM OLD.transaction_date AND NOT v_authorized_date)
 OR NEW.value_date IS DISTINCT FROM OLD.value_date OR NEW.description IS DISTINCT FROM OLD.description OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.running_balance IS DISTINCT FROM OLD.running_balance OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.row_checksum IS DISTINCT FROM OLD.row_checksum OR NEW.statement_import_id IS DISTINCT FROM OLD.statement_import_id THEN
 RAISE EXCEPTION 'Raw imported bank transaction fields are immutable. Edit classification or status only.'; END IF;
 IF OLD.reconciled_at IS NOT NULL AND NEW.reconciled_at IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.suggested_classification_id IS DISTINCT FROM OLD.suggested_classification_id) THEN RAISE EXCEPTION 'This bank transaction is reconciled and locked. Unreconcile it before editing.'; END IF;
 RETURN NEW;
END;
$function$;
COMMENT ON TABLE public.bank_balance_correction_audit IS 'Service-written approved bank corrections: complete original rows, source, actor and time. Never reconciliation approval.';