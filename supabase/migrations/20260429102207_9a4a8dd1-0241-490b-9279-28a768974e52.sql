-- ============================================================
-- Bank import correction flows: undo + move to another account
-- ============================================================

-- 1. Extend bank_import_status enum with 'archived' (soft-cancel)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'bank_import_status' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE public.bank_import_status ADD VALUE 'archived';
  END IF;
END$$;

-- 2. Audit columns on bank_statement_imports
ALTER TABLE public.bank_statement_imports
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS undo_reason text,
  ADD COLUMN IF NOT EXISTS original_account_id uuid,
  ADD COLUMN IF NOT EXISTS moved_at timestamptz,
  ADD COLUMN IF NOT EXISTS moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Update the immutability guard so that bank_account_id MAY be changed
--    when the session sets the bypass flag (used only inside the move RPC).
CREATE OR REPLACE FUNCTION public.bank_tx_guard_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allow_account_move boolean := false;
BEGIN
  BEGIN
    v_allow_account_move := current_setting('app.allow_bank_tx_account_move', true) = 'on';
  EXCEPTION WHEN OTHERS THEN
    v_allow_account_move := false;
  END;

  IF (NOT v_allow_account_move) AND NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN
    RAISE EXCEPTION 'bank_transactions.bank_account_id is immutable outside the move-import flow';
  END IF;

  IF NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
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
END $function$;

-- 4. Undo import RPC
CREATE OR REPLACE FUNCTION public.bank_import_undo(
  _import_id uuid,
  _force boolean DEFAULT false,
  _reason text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_classified int;
  v_with_payments int;
  v_total int;
  v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.bank_transactions WHERE statement_import_id = _import_id;

  SELECT count(*) INTO v_classified
    FROM public.bank_transactions bt
    WHERE bt.statement_import_id = _import_id
      AND (bt.status <> 'unclassified'
           OR EXISTS (SELECT 1 FROM public.bank_transaction_classifications c WHERE c.bank_transaction_id = bt.id));

  SELECT count(*) INTO v_with_payments
    FROM public.financial_document_payments p
    JOIN public.bank_transactions bt ON bt.id = p.bank_transaction_id
    WHERE bt.statement_import_id = _import_id;

  IF (v_classified > 0 OR v_with_payments > 0) AND NOT _force THEN
    RETURN jsonb_build_object(
      'status', 'requires_confirmation',
      'total', v_total,
      'classified', v_classified,
      'with_payments', v_with_payments
    );
  END IF;

  IF v_with_payments > 0 THEN
    -- Never destroy linked payments. Soft-archive instead.
    UPDATE public.bank_statement_imports
       SET status = 'archived',
           undone_at = now(),
           undone_by = v_caller,
           undo_reason = _reason
     WHERE id = _import_id;
    RETURN jsonb_build_object('status', 'archived', 'reason', 'has_linked_payments');
  END IF;

  -- Safe to hard-delete: cascade removes bank_transaction_classifications via FK.
  DELETE FROM public.bank_transactions WHERE statement_import_id = _import_id;

  UPDATE public.bank_statement_imports
     SET status = 'rolled_back',
         undone_at = now(),
         undone_by = v_caller,
         undo_reason = _reason
   WHERE id = _import_id;

  RETURN jsonb_build_object('status', 'rolled_back', 'deleted', v_total);
END$function$;

-- 5. Move import to another bank account RPC
CREATE OR REPLACE FUNCTION public.bank_import_move_account(
  _import_id uuid,
  _new_account_id uuid
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_old_account uuid;
  v_file_checksum text;
  v_dup_file int;
  v_dup_rows int;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT bank_account_id, file_checksum
    INTO v_old_account, v_file_checksum
    FROM public.bank_statement_imports WHERE id = _import_id;

  IF v_old_account IS NULL THEN
    RAISE EXCEPTION 'import not found';
  END IF;
  IF v_old_account = _new_account_id THEN
    RAISE EXCEPTION 'target account is the same as current account';
  END IF;

  -- File-level duplicate check on target account
  SELECT count(*) INTO v_dup_file
    FROM public.bank_statement_imports
   WHERE bank_account_id = _new_account_id
     AND file_checksum = v_file_checksum
     AND id <> _import_id;
  IF v_dup_file > 0 THEN
    RAISE EXCEPTION 'duplicate_file_on_target' USING DETAIL = 'Target account already has an import with the same file checksum';
  END IF;

  -- Row-level duplicate check on target
  SELECT count(*) INTO v_dup_rows
    FROM public.bank_transactions tgt
    JOIN public.bank_transactions src ON src.row_checksum = tgt.row_checksum
   WHERE tgt.bank_account_id = _new_account_id
     AND src.statement_import_id = _import_id
     AND tgt.statement_import_id <> _import_id;
  IF v_dup_rows > 0 THEN
    RAISE EXCEPTION 'duplicate_rows_on_target' USING DETAIL = 'Target account already contains transactions with overlapping checksums';
  END IF;

  -- Bypass immutability guard for the account-id field only.
  PERFORM set_config('app.allow_bank_tx_account_move', 'on', true);

  UPDATE public.bank_transactions
     SET bank_account_id = _new_account_id
   WHERE statement_import_id = _import_id;

  PERFORM set_config('app.allow_bank_tx_account_move', 'off', true);

  UPDATE public.bank_statement_imports
     SET bank_account_id = _new_account_id,
         original_account_id = COALESCE(original_account_id, v_old_account),
         moved_at = now(),
         moved_by = v_caller
   WHERE id = _import_id;

  RETURN jsonb_build_object('status', 'moved', 'from', v_old_account, 'to', _new_account_id);
END$function$;

GRANT EXECUTE ON FUNCTION public.bank_import_undo(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bank_import_move_account(uuid, uuid) TO authenticated;