-- Stage 3b: refuse references that point to a row of another entity.
-- Trigger args: pairs of (column, referenced_table). A column whose name ends in
-- "_ids" is a uuid[] and every element is checked. Checked only when the column
-- (or entity_id) is set/changed, so untouched legacy rows keep saving.
CREATE OR REPLACE FUNCTION public.fin_guard_entity_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i int; col text; tbl text; newj jsonb := to_jsonb(NEW); oldj jsonb;
  own uuid := NEW.entity_id; bad int;
BEGIN
  IF TG_OP = 'UPDATE' THEN oldj := to_jsonb(OLD); END IF;
  FOR i IN 0 .. (TG_NARGS / 2) - 1 LOOP
    col := TG_ARGV[i*2]; tbl := TG_ARGV[i*2+1];
    CONTINUE WHEN newj->col IS NULL OR newj->col = 'null'::jsonb;
    CONTINUE WHEN TG_OP = 'UPDATE' AND newj->col IS NOT DISTINCT FROM oldj->col
                  AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id;
    IF col LIKE '%\_ids' THEN
      EXECUTE format('SELECT count(*) FROM %I t WHERE t.id = ANY($1) AND t.entity_id IS DISTINCT FROM $2', tbl)
        INTO bad USING ARRAY(SELECT jsonb_array_elements_text(newj->col))::uuid[], own;
    ELSE
      EXECUTE format('SELECT count(*) FROM %I t WHERE t.id = $1 AND t.entity_id IS DISTINCT FROM $2', tbl)
        INTO bad USING (newj->>col)::uuid, own;
    END IF;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Cross-entity reference refused: %.% points to a % row of another entity', TG_TABLE_NAME, col, tbl
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- Transaction classifications have no entity of their own: they take their bank line's.
CREATE OR REPLACE FUNCTION public.fin_guard_btc_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE own uuid;
BEGIN
  IF NEW.classification_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.classification_id IS NOT DISTINCT FROM OLD.classification_id
     AND NEW.bank_transaction_id IS NOT DISTINCT FROM OLD.bank_transaction_id THEN RETURN NEW; END IF;
  SELECT entity_id INTO own FROM bank_transactions WHERE id = NEW.bank_transaction_id;
  IF EXISTS (SELECT 1 FROM financial_classifications c WHERE c.id = NEW.classification_id AND c.entity_id IS DISTINCT FROM own) THEN
    RAISE EXCEPTION 'Cross-entity reference refused: bank_transaction_classifications.classification_id points to a financial_classifications row of another entity'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fin_guard_entity_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_guard_btc_entity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.financial_document_review_queue
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'suggested_classification_id','financial_classifications',
  'matched_bank_account_id','bank_accounts',
  'paid_from_account_id','bank_accounts',
  'credit_note_original_document_id','financial_documents',
  'payment_match_document_id','financial_documents',
  'settled_document_id','financial_documents',
  'duplicate_of_document_id','financial_documents',
  'duplicate_of_id','financial_document_review_queue',
  'recebimento_id','finance_recebimentos');

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.financial_documents
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'classification_id','financial_classifications',
  'cost_category_id','cost_categories',
  'paid_from_account_id','bank_accounts',
  'voided_duplicate_of','financial_documents');

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'bank_account_id','bank_accounts',
  'suggested_classification_id','financial_classifications',
  'statement_import_id','bank_statement_imports',
  'statement_period_id','bank_statement_periods');

CREATE TRIGGER fin_guard_btc_entity_trg BEFORE INSERT OR UPDATE ON public.bank_transaction_classifications
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_btc_entity();

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.finance_recebimentos
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'bank_transaction_ids','bank_transactions',
  'suggested_bank_transaction_ids','bank_transactions',
  'pm_invoice_ids','pm_invoices',
  'schedule_item_ids','pm_payment_schedule_items',
  'financial_document_ids','financial_documents');

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.bank_classification_rules
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'classification_id','financial_classifications');

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.financial_classifications
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs(
  'parent_id','financial_classifications',
  'cost_category_id','cost_categories');

CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.bank_statement_imports
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs('bank_account_id','bank_accounts');
CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.bank_statement_periods
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs('bank_account_id','bank_accounts');
CREATE TRIGGER fin_guard_entity_refs_trg BEFORE INSERT OR UPDATE ON public.bank_balance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.fin_guard_entity_refs('bank_account_id','bank_accounts');