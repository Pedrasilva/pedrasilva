-- Personal-card decisions act; amounts owed to card holders; archived-account cards explain past lines.
CREATE TABLE public.finance_holder_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  document_id uuid NOT NULL UNIQUE REFERENCES public.financial_documents(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.payment_cards(id) ON DELETE SET NULL,
  collaborator_id uuid,
  holder_name text,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','repaid','cancelled')),
  repaid_at timestamptz,
  repaid_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.finance_holder_reimbursements IS 'A reembolsar: PSA expenses paid with a personal card; owed to the holder until marked repaid.';
GRANT SELECT, UPDATE ON public.finance_holder_reimbursements TO authenticated;
GRANT ALL ON public.finance_holder_reimbursements TO service_role;
ALTER TABLE public.finance_holder_reimbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read holder reimbursements" ON public.finance_holder_reimbursements FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'::text)) AND fin_row_visible(entity_id));
CREATE POLICY "Finance users update holder reimbursements" ON public.finance_holder_reimbursements FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.documents.edit'::text)) AND fin_row_visible(entity_id))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.documents.edit'::text)) AND fin_row_visible(entity_id));

CREATE TABLE public.finance_personal_card_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  document_id uuid,
  reimbursement_id uuid,
  action text NOT NULL,
  old_value text,
  new_value text,
  amount numeric(14,2),
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_personal_card_log TO authenticated;
GRANT ALL ON public.finance_personal_card_log TO service_role;
ALTER TABLE public.finance_personal_card_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read personal card log" ON public.finance_personal_card_log FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'finance.dashboard'::text)) AND fin_row_visible(entity_id));

ALTER TABLE public.financial_documents ADD COLUMN IF NOT EXISTS personal_card_prev_status text;

CREATE OR REPLACE FUNCTION public.fin_personal_card_decision_act() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who uuid := coalesce(auth.uid(), NEW.personal_card_decided_by); c record;
BEGIN
  IF NEW.personal_card_decision IS NOT DISTINCT FROM OLD.personal_card_decision THEN RETURN NEW; END IF;
  INSERT INTO finance_personal_card_log(entity_id, document_id, action, old_value, new_value, amount, actor)
  VALUES (NEW.entity_id, NEW.id, 'decision', OLD.personal_card_decision, NEW.personal_card_decision, NEW.total_inc_vat, who);

  IF OLD.personal_card_decision = 'personal' THEN
    IF NEW.status = 'cancelled' AND NEW.void_reason = 'Pessoal' THEN
      NEW.status := coalesce(NEW.personal_card_prev_status, 'issued')::financial_doc_status;
      NEW.void_reason := NULL; NEW.voided_by := NULL; NEW.voided_at := NULL;
    END IF;
    UPDATE financial_document_review_queue
       SET status = coalesce(removed_prev_status, 'approved')::fdrq_status,
           removed_at = NULL, removed_by = NULL, removed_source = NULL, removed_reason = NULL, removed_prev_status = NULL
     WHERE created_expense_id = NEW.id AND status = 'removed' AND removed_source = 'personal_card';
  END IF;
  IF OLD.personal_card_decision = 'psa_paid_by_holder' THEN
    UPDATE finance_holder_reimbursements SET status = 'cancelled'
     WHERE document_id = NEW.id AND status = 'owed';
  END IF;

  IF NEW.personal_card_decision = 'personal' THEN
    NEW.personal_card_prev_status := NEW.status::text;
    NEW.status := 'cancelled'; NEW.void_reason := 'Pessoal'; NEW.voided_by := who; NEW.voided_at := now();
    UPDATE financial_document_review_queue
       SET removed_prev_status = status::text, status = 'removed', removed_at = now(), removed_by = who,
           removed_source = 'personal_card', removed_reason = 'Pessoal'
     WHERE created_expense_id = NEW.id AND status <> 'removed';
  ELSIF NEW.personal_card_decision = 'psa_paid_by_holder' THEN
    SELECT id, holder_name, collaborator_id INTO c FROM payment_cards WHERE id = NEW.paid_from_card_id AND is_personal;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Paid with must be a personal card' USING ERRCODE = '23514'; END IF;
    NEW.paid_from_account_id := NULL;
    INSERT INTO finance_holder_reimbursements(entity_id, document_id, card_id, collaborator_id, holder_name, amount, status, created_by)
    VALUES (NEW.entity_id, NEW.id, c.id, c.collaborator_id, c.holder_name, coalesce(NEW.total_inc_vat, 0), 'owed', who)
    ON CONFLICT (document_id) DO UPDATE SET status = 'owed', card_id = EXCLUDED.card_id, collaborator_id = EXCLUDED.collaborator_id,
      holder_name = EXCLUDED.holder_name, amount = EXCLUDED.amount;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fd_personal_card_decision BEFORE UPDATE OF personal_card_decision ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fin_personal_card_decision_act();

CREATE OR REPLACE FUNCTION public.fin_holder_reimb_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'repaid' AND OLD.status <> 'repaid' THEN
    NEW.repaid_at := now(); NEW.repaid_by := auth.uid();
  ELSIF NEW.status <> 'repaid' THEN NEW.repaid_at := NULL; NEW.repaid_by := NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO finance_personal_card_log(entity_id, document_id, reimbursement_id, action, old_value, new_value, amount, actor)
    VALUES (NEW.entity_id, NEW.document_id, NEW.id, 'reimbursement_status', OLD.status, NEW.status, NEW.amount, auth.uid());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER holder_reimb_log BEFORE UPDATE ON public.finance_holder_reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.fin_holder_reimb_log();

CREATE OR REPLACE FUNCTION public.fin_paid_from_of_bank_line(_tx uuid, OUT card_id uuid, OUT account_id uuid)
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record; n int;
BEGIN
  SELECT bt.id, bt.entity_id, bt.bank_account_id, bt.description, (ba.archived_at IS NOT NULL) AS archived
    INTO t FROM bank_transactions bt LEFT JOIN bank_accounts ba ON ba.id = bt.bank_account_id WHERE bt.id = _tx;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT pc.id INTO card_id FROM payment_cards pc
   WHERE pc.entity_id = t.entity_id AND pc.active
     AND EXISTS (SELECT 1 FROM unnest(pc.bank_refs) r WHERE r <> '' AND position(upper(r) IN upper(coalesce(t.description,''))) > 0)
   LIMIT 1;
  IF card_id IS NULL THEN
    SELECT count(*), (array_agg(pc.id))[1] INTO n, card_id FROM payment_cards pc
     WHERE pc.entity_id = t.entity_id AND (pc.active OR t.archived) AND pc.card_type = 'credit' AND pc.bank_account_id = t.bank_account_id;
    IF n <> 1 THEN card_id := NULL; END IF;
  END IF;
  IF card_id IS NULL THEN account_id := t.bank_account_id; END IF;
END $function$;
