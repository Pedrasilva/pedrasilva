CREATE OR REPLACE FUNCTION public.fin_queue_known_bank_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.finance_known_bank_identities;
BEGIN
 IF NEW.intake_type='extrato_bancario' OR NEW.bank_doc_kind IN ('account_statement','card_statement','bank_export') THEN
 SELECT * INTO k FROM public.finance_known_bank_identities WHERE id=public.fin_known_bank_identity(NEW.extracted_iban,NEW.extracted_account_number);
 IF k.id IS NOT NULL THEN
 NEW.bank_ownership:=k.ownership; NEW.known_bank_identity_id:=k.id;
 NEW.bank_identity_flag:=NULL;
 NEW.matched_bank_account_id:=NULL; NEW.statement_period_id:=NULL;
 NEW.intake_route:='other'; NEW.status:='removed'; NEW.purge_exempt:=true;
 NEW.removed_at:=coalesce(NEW.removed_at,now()); NEW.removed_source:='known_bank_identity';
 NEW.removed_reason:=CASE WHEN k.ownership='personal' THEN 'Pessoal - não empresa' ELSE 'Não pertence à empresa' END;
 NEW.removed_tag:=k.ownership; NEW.drive_copy_status:=NULL; NEW.drive_next_retry_at:=NULL;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.fin_bank_statement_sync_period(_id uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE q public.financial_document_review_queue%ROWTYPE; v_pid uuid; p public.bank_statement_periods%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.financial_document_review_queue WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF q.bank_ownership IS NOT NULL THEN RAISE EXCEPTION 'not_company_statement' USING ERRCODE='23514'; END IF;
 IF q.bank_doc_kind IS NULL OR q.bank_doc_kind NOT IN ('account_statement','card_statement') THEN RETURN NULL; END IF;
 IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_pid:=public.fin_statement_draft_upsert(_id,true);
 SELECT * INTO p FROM public.bank_statement_periods WHERE id=v_pid;
 IF p.locked_at IS NOT NULL THEN RAISE EXCEPTION 'period_locked' USING ERRCODE='23514',HINT='Reopen the statement period with a reason first.'; END IF;
 UPDATE public.bank_statement_periods SET period_start_date=q.extracted_period_start,period_end_date=q.extracted_period_end,
 opening_balance=q.extracted_opening_balance,closing_balance=q.extracted_closing_balance,payment_card_id=q.matched_payment_card_id,
 bank_statement_number=COALESCE(NULLIF(btrim(q.extracted_statement_number),''),bank_statement_number),status='confirmed',
 confirmed_at=COALESCE(confirmed_at,now()),confirmed_by=COALESCE(confirmed_by,auth.uid()) WHERE id=v_pid AND source_queue_item_id=_id;
 RETURN v_pid;
END $$;