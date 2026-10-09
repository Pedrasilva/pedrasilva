-- Finance intake: one "Confirmar" (both entities).
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS marked_unpaid boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.financial_document_review_queue.marked_unpaid IS 'Reviewer marked the document "Por pagar": no card/account needed to confirm.';

CREATE TABLE IF NOT EXISTS public.finance_intake_confirm_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  queue_item_id uuid NOT NULL,
  step text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_intake_confirm_log_item_idx ON public.finance_intake_confirm_log(queue_item_id, created_at);
GRANT SELECT ON public.finance_intake_confirm_log TO authenticated;
GRANT ALL ON public.finance_intake_confirm_log TO service_role;
ALTER TABLE public.finance_intake_confirm_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "confirm log visible in entity" ON public.finance_intake_confirm_log
  FOR SELECT TO authenticated USING (public.fin_row_visible(entity_id));

-- Is a tax number usable to identify a counterparty? valid PT NIF or a foreign number.
CREATE OR REPLACE FUNCTION public.fin_tax_number_ok(_raw text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _raw IS NULL OR btrim(_raw) = '' THEN false
    WHEN upper(regexp_replace(_raw, '[^A-Za-z0-9]', '', 'g')) ~ '^PT\d{9}$'
      THEN public.fin_pt_nif_valid(substr(upper(regexp_replace(_raw, '[^A-Za-z0-9]', '', 'g')), 3))
    WHEN regexp_replace(_raw, '\D', '', 'g') ~ '^\d{9}$' AND upper(_raw) !~ '[A-Z]{2}'
      THEN public.fin_pt_nif_valid(regexp_replace(_raw, '\D', '', 'g'))
    WHEN upper(regexp_replace(_raw, '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z]{2}[A-Z0-9]{4,}$' THEN true
    ELSE false END
$$;

-- Why a review item can't be confirmed yet (empty array = ready).
CREATE OR REPLACE FUNCTION public.fin_queue_blockers(r public.financial_document_review_queue)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE b text[] := '{}'; issued boolean := r.direction = 'issued';
  cid uuid; c record; cls record; vat text; code text;
BEGIN
  IF r.status::text <> 'pending_review' THEN RETURN ARRAY['status']; END IF;
  IF coalesce(r.intake_route, '') NOT IN ('purchases', 'issued') THEN RETURN ARRAY['not_confirmable']; END IF;
  IF r.entity_conflict_ids IS NOT NULL AND cardinality(r.entity_conflict_ids) > 0 THEN b := b || 'two_entities'; END IF;
  IF r.entity_id IS NULL THEN b := b || 'entity'; END IF;
  IF r.intake_type IS NULL OR r.intake_type = 'desconhecido' THEN b := b || 'doc_type'; END IF;
  IF r.direction::text = 'unclear' THEN b := b || 'direction'; END IF;
  IF r.extracted_date IS NULL THEN b := b || 'date'; END IF;
  IF r.extracted_amount IS NULL THEN b := b || 'total'; END IF;

  cid := CASE WHEN issued THEN r.matched_client_id ELSE r.matched_supplier_id END;
  vat := CASE WHEN issued THEN r.extracted_buyer_vat ELSE coalesce(r.extracted_supplier_vat, r.extracted_seller_vat) END;
  IF cid IS NOT NULL THEN
    SELECT is_platform, nif, foreign_tax_id INTO c FROM public.companies WHERE id = cid;
    IF coalesce(c.is_platform, false) THEN
      IF coalesce(btrim(r.issuer_name), '') = '' THEN b := b || 'platform_issuer'; END IF;
    ELSIF NOT (coalesce(public.fin_pt_nif_valid(c.nif), false) OR coalesce(btrim(c.foreign_tax_id), '') <> '') THEN
      b := b || 'counterparty_tax';
    END IF;
  ELSIF NOT public.fin_tax_number_ok(vat) THEN
    b := b || 'counterparty';
  END IF;

  IF r.suggested_classification_id IS NULL THEN b := b || 'category';
  ELSE
    SELECT level::text AS level, active, entity_id, code INTO cls FROM public.financial_classifications WHERE id = r.suggested_classification_id;
    IF cls.level IS DISTINCT FROM 'category' OR NOT coalesce(cls.active, false) OR cls.entity_id IS DISTINCT FROM r.entity_id THEN
      b := b || 'category_group';
    END IF;
    code := cls.code;
    IF code IS NOT NULL AND (code = 'BEN' OR code LIKE 'BEN.%' OR code IN ('PES.FOOD','PES.HEALTH','PES.PERS','PES.OTHER'))
       AND r.assigned_collaborator_id IS NULL THEN b := b || 'collaborator'; END IF;
  END IF;

  IF r.paid_from_card_id IS NULL AND r.paid_from_account_id IS NULL AND NOT r.marked_unpaid THEN
    b := b || CASE WHEN r.extracted_card_last4 IS NOT NULL THEN 'card_unknown' ELSE 'paid_with' END;
  END IF;

  IF jsonb_typeof(r.possible_duplicates) = 'array' AND jsonb_array_length(r.possible_duplicates) > 0
     AND NOT coalesce(r.possible_duplicate_resolved, false) THEN b := b || 'duplicate'; END IF;
  RETURN b;
END $$;

-- Same counterparty and entity, same category as the last approved items, amount within ±2% of the last one.
CREATE OR REPLACE FUNCTION public.fin_queue_is_repeat(r public.financial_document_review_queue)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE cid uuid := CASE WHEN r.direction = 'issued' THEN r.matched_client_id ELSE r.matched_supplier_id END;
  n int; same int; last_amt numeric;
BEGIN
  IF cid IS NULL OR r.suggested_classification_id IS NULL OR r.extracted_amount IS NULL THEN RETURN false; END IF;
  WITH last AS (
    SELECT q.suggested_classification_id, q.extracted_amount, q.reviewed_at
    FROM public.financial_document_review_queue q
    WHERE q.entity_id = r.entity_id AND q.id <> r.id AND q.status = 'approved'
      AND (CASE WHEN r.direction = 'issued' THEN q.matched_client_id ELSE q.matched_supplier_id END) = cid
    ORDER BY q.reviewed_at DESC NULLS LAST LIMIT 3)
  SELECT count(*), count(*) FILTER (WHERE suggested_classification_id = r.suggested_classification_id),
         (SELECT extracted_amount FROM last ORDER BY reviewed_at DESC NULLS LAST LIMIT 1)
    INTO n, same, last_amt FROM last;
  RETURN n > 0 AND same = n AND last_amt IS NOT NULL
     AND abs(r.extracted_amount - last_amt) <= 0.02 * abs(last_amt);
END $$;

-- Readiness for the screen (RLS applies: only the caller's current entity).
CREATE OR REPLACE FUNCTION public.fin_queue_readiness(_ids uuid[])
RETURNS TABLE(id uuid, blockers text[], is_repeat boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT q.id, public.fin_queue_blockers(q),
         cardinality(public.fin_queue_blockers(q)) = 0 AND public.fin_queue_is_repeat(q)
  FROM public.financial_document_review_queue q WHERE q.id = ANY(_ids)
$$;
GRANT EXECUTE ON FUNCTION public.fin_queue_readiness(uuid[]) TO authenticated;

-- One transaction: edits → counterparty → classification → paid with → finalise.
CREATE OR REPLACE FUNCTION public.fin_confirm_queue_item(_id uuid, _edits jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  r public.financial_document_review_queue;
  e jsonb := coalesce(_edits, '{}'::jsonb);
  issued boolean;
  cid uuid; vat text; vat_clean text; cname text; ex record; created boolean := false; linked boolean := false;
  cls record; ai_code text; blk text[]; doc_id uuid; total numeric; vatamt numeric; wh numeric;
  cp_name text; cat record; d date; it jsonb; i int; qty numeric; amt numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF r.entity_id IS DISTINCT FROM public.current_finance_entity() OR NOT public.has_entity_access(r.entity_id)
     OR NOT (public.has_role(uid, 'admin') OR public.has_permission(uid, 'finance.dashboard')) THEN
    RAISE EXCEPTION 'Forbidden: finance access required for this entity' USING ERRCODE = '42501';
  END IF;
  IF r.status::text <> 'pending_review' THEN RAISE EXCEPTION 'BLOCKED:status'; END IF;
  issued := r.direction = 'issued';

  -- 1) field edits
  IF e ?| ARRAY['supplier_name','supplier_vat','document_number','date','amount','vat','withholding','currency',
                'payment_method','card_last4','paid_from_card_id','paid_from_account_id','marked_unpaid',
                'classification_id','project_id','assigned_collaborator_id'] THEN
    UPDATE public.financial_document_review_queue q SET
      extracted_supplier_name = CASE WHEN NOT issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_supplier_name END,
      extracted_seller_name   = CASE WHEN NOT issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_seller_name END,
      extracted_supplier_vat  = CASE WHEN NOT issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_supplier_vat END,
      extracted_seller_vat    = CASE WHEN NOT issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_seller_vat END,
      extracted_buyer_name    = CASE WHEN issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_buyer_name END,
      extracted_buyer_vat     = CASE WHEN issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_buyer_vat END,
      extracted_document_number = CASE WHEN e ? 'document_number' THEN nullif(e->>'document_number','') ELSE q.extracted_document_number END,
      extracted_date   = CASE WHEN e ? 'date' THEN nullif(e->>'date','')::date ELSE q.extracted_date END,
      extracted_amount = CASE WHEN e ? 'amount' THEN nullif(e->>'amount','')::numeric ELSE q.extracted_amount END,
      extracted_vat_amount = CASE WHEN e ? 'vat' THEN nullif(e->>'vat','')::numeric ELSE q.extracted_vat_amount END,
      extracted_withholding_amount = CASE WHEN e ? 'withholding' THEN nullif(e->>'withholding','')::numeric ELSE q.extracted_withholding_amount END,
      extracted_currency = CASE WHEN e ? 'currency' THEN coalesce(nullif(e->>'currency',''), 'EUR') ELSE q.extracted_currency END,
      extracted_payment_method = CASE WHEN e ? 'payment_method' THEN nullif(e->>'payment_method','') ELSE q.extracted_payment_method END,
      extracted_card_last4 = CASE WHEN e ? 'card_last4' THEN nullif(right(regexp_replace(coalesce(e->>'card_last4',''), '\D', '', 'g'), 4), '') ELSE q.extracted_card_last4 END,
      paid_from_card_id = CASE WHEN e ? 'paid_from_card_id' OR e ? 'paid_from_account_id' THEN nullif(e->>'paid_from_card_id','')::uuid ELSE q.paid_from_card_id END,
      paid_from_account_id = CASE WHEN e ? 'paid_from_card_id' OR e ? 'paid_from_account_id'
        THEN CASE WHEN nullif(e->>'paid_from_card_id','') IS NULL THEN nullif(e->>'paid_from_account_id','')::uuid END
        ELSE q.paid_from_account_id END,
      marked_unpaid = CASE WHEN e ? 'marked_unpaid' THEN coalesce((e->>'marked_unpaid')::boolean, false) ELSE q.marked_unpaid END,
      suggested_classification_id = CASE WHEN e ? 'classification_id' THEN nullif(e->>'classification_id','')::uuid ELSE q.suggested_classification_id END,
      created_project_id = CASE WHEN e ? 'project_id' THEN nullif(e->>'project_id','')::uuid ELSE q.created_project_id END,
      assigned_collaborator_id = CASE WHEN e ? 'assigned_collaborator_id' THEN nullif(e->>'assigned_collaborator_id','')::uuid ELSE q.assigned_collaborator_id END
    WHERE q.id = _id;
    INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
      VALUES (r.entity_id, _id, 'edits', e - 'counterparty_id' - 'link_counterparty_id', uid);
    SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;
  END IF;

  -- 2) counterparty (find by NIF, platform rules, create if new)
  cid := nullif(e->>'counterparty_id','')::uuid;
  IF cid IS NULL AND nullif(e->>'link_counterparty_id','') IS NOT NULL THEN
    cid := (e->>'link_counterparty_id')::uuid; linked := true;
  END IF;
  IF cid IS NULL THEN cid := CASE WHEN issued THEN r.matched_client_id ELSE r.matched_supplier_id END; END IF;
  IF cid IS NOT NULL AND NOT public.fin_company_visible(cid) AND NOT linked THEN
    RAISE EXCEPTION 'Counterparty not visible in this entity';
  END IF;
  IF cid IS NULL THEN
    vat := CASE WHEN issued THEN r.extracted_buyer_vat ELSE coalesce(r.extracted_supplier_vat, r.extracted_seller_vat) END;
    cname := CASE WHEN issued THEN r.extracted_buyer_name ELSE coalesce(r.extracted_supplier_name, r.extracted_seller_name) END;
    IF NOT public.fin_tax_number_ok(vat) THEN RAISE EXCEPTION 'BLOCKED:counterparty'; END IF;
    vat_clean := upper(regexp_replace(vat, '[^A-Za-z0-9]', '', 'g'));
    IF vat_clean ~ '^(PT)?\d{9}$' THEN
      vat_clean := regexp_replace(vat_clean, '^PT', '');
      SELECT id INTO ex FROM public.companies WHERE nif = vat_clean LIMIT 1;
    ELSE
      SELECT id INTO ex FROM public.companies
       WHERE upper(regexp_replace(coalesce(foreign_tax_id,''), '[^A-Za-z0-9]', '', 'g')) = vat_clean LIMIT 1;
    END IF;
    IF ex.id IS NOT NULL THEN
      cid := ex.id;
      linked := NOT public.fin_company_visible(cid);
    ELSE
      INSERT INTO public.companies(nome, nif, tax_country, is_supplier, is_client, created_by)
      VALUES (coalesce(nullif(cname,''), CASE WHEN issued THEN 'Cliente' ELSE 'Fornecedor' END),
              vat_clean,
              CASE WHEN vat_clean ~ '^\d{9}$' THEN 'PT' ELSE left(vat_clean, 2) END,
              NOT issued, issued, uid)
      RETURNING id INTO cid;
      created := true;
    END IF;
  END IF;
  IF linked THEN
    INSERT INTO public.finance_entity_companies(entity_id, company_id, linked_by)
    VALUES (r.entity_id, cid, uid) ON CONFLICT DO NOTHING;
  END IF;
  -- flag the role only where the caller may edit the company (PSA staff, or not used by PSA)
  IF NOT created AND (public.is_psa_staff() OR NOT public.company_psa_referenced(cid)) THEN
    UPDATE public.companies SET is_supplier = true WHERE id = cid AND NOT issued AND NOT coalesce(is_supplier, false);
    UPDATE public.companies SET is_client = true WHERE id = cid AND issued AND NOT coalesce(is_client, false);
  END IF;
  IF issued THEN
    UPDATE public.financial_document_review_queue SET matched_client_id = cid, client_match_status = 'matched',
      supplier_approved_at = now(), supplier_approved_by = uid WHERE id = _id;
  ELSE
    UPDATE public.financial_document_review_queue SET matched_supplier_id = cid, supplier_match_status = 'matched',
      supplier_approved_at = now(), supplier_approved_by = uid WHERE id = _id;
  END IF;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, CASE WHEN issued THEN 'client_approved' ELSE 'supplier_approved' END,
            jsonb_build_object('company_id', cid, 'created', created, 'linked', linked), uid);
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;

  -- 3) every rule must hold before anything is approved/finalised
  blk := public.fin_queue_blockers(r);
  IF cardinality(blk) > 0 THEN RAISE EXCEPTION 'BLOCKED:%', array_to_string(blk, ','); END IF;

  -- 4) classification (+ learning correction as today)
  SELECT code INTO cls FROM public.financial_classifications WHERE id = r.suggested_classification_id;
  ai_code := coalesce(r.applied_learning->>'ai_code', r.model_runs->'claude'->>'classification_code', r.suggested_classification_code);
  IF cls.code IS NOT NULL AND ai_code IS DISTINCT FROM cls.code THEN
    INSERT INTO public.finance_intake_corrections(entity_id, queue_item_id, supplier_nif, field, ai_value, corrected_value, corrected_by)
    VALUES (r.entity_id, _id,
            nullif(lower(regexp_replace(regexp_replace(upper(coalesce(r.extracted_supplier_vat,'')), '[^A-Z0-9]', '', 'g'), '^PT', '')), ''),
            'classification_code', ai_code, cls.code, uid);
  END IF;
  UPDATE public.financial_document_review_queue SET
    suggested_classification_code = cls.code,
    assigned_collaborator_id = CASE WHEN cls.code = 'BEN' OR cls.code LIKE 'BEN.%' OR cls.code IN ('PES.FOOD','PES.HEALTH','PES.PERS','PES.OTHER') THEN assigned_collaborator_id END,
    classification_approved_at = now(), classification_approved_by = uid
  WHERE id = _id;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'classification_approved', jsonb_build_object('classification_id', r.suggested_classification_id, 'code', cls.code), uid);
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'paid_with', jsonb_build_object('card_id', r.paid_from_card_id, 'account_id', r.paid_from_account_id, 'unpaid', r.marked_unpaid), uid);
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;

  -- 5) finalise: one document per linked group
  SELECT created_expense_id INTO doc_id FROM public.financial_document_review_queue
   WHERE linked_document_group_id = r.linked_document_group_id AND created_expense_id IS NOT NULL LIMIT 1;
  IF doc_id IS NULL THEN
    total := coalesce(r.extracted_amount, 0);
    vatamt := coalesce(r.extracted_vat_amount, 0);
    wh := CASE WHEN coalesce(r.extracted_withholding_amount, 0) > 0 THEN least(abs(r.extracted_withholding_amount), total) ELSE 0 END;
    SELECT nome INTO cp_name FROM public.companies WHERE id = cid;
    INSERT INTO public.financial_documents(
      entity_id, doc_type, direction, source, status, document_number, issue_date, due_date,
      counterparty_supplier_id, counterparty_client_id, issuer_name, issuer_nif, issuer_tax_country, issuer_foreign_tax_id,
      counterparty_name_snapshot, classification_id, project_id, not_project_related, currency,
      subtotal_ex_vat, vat_amount, total_inc_vat, withholding_tax_amount, file_path, ocr_metadata,
      billed_to_own_vat, payment_method_extracted, card_last4, paid_from_account_id, paid_from_card_id,
      payment_status, created_by)
    VALUES (
      r.entity_id,
      (CASE WHEN r.intake_type = 'nota_credito' THEN CASE WHEN issued THEN 'client_credit_note' ELSE 'supplier_credit_note' END
            ELSE CASE WHEN issued THEN 'client_invoice' ELSE 'supplier_invoice' END END)::financial_doc_type,
      (CASE WHEN issued THEN 'issued' ELSE 'received' END)::financial_doc_direction,
      'ocr'::financial_doc_source, 'issued'::financial_doc_status,
      r.extracted_document_number, coalesce(r.extracted_date, current_date), r.extracted_due_date,
      CASE WHEN issued THEN NULL ELSE cid END, CASE WHEN issued THEN cid END,
      r.issuer_name, r.issuer_nif, r.issuer_tax_country, r.issuer_foreign_tax_id,
      coalesce(cp_name, CASE WHEN issued THEN r.extracted_buyer_name ELSE r.extracted_supplier_name END),
      r.suggested_classification_id, r.created_project_id, r.created_project_id IS NULL,
      coalesce(r.extracted_currency, 'EUR'), greatest(total - vatamt, 0), vatamt, total, wh,
      r.source_file_url, r.raw_extraction, coalesce(r.buyer_vat_is_own, false), r.extracted_payment_method,
      r.extracted_card_last4, r.paid_from_account_id, r.paid_from_card_id,
      CASE WHEN r.payment_status = 'paid_at_source' THEN 'paid_at_source' ELSE 'awaiting_payment' END, uid)
    RETURNING id INTO doc_id;
  END IF;

  -- inventory marker (same as finalizeQueueItem)
  IF coalesce(r.mark_for_inventory, false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.financial_document_lines WHERE document_id = doc_id)
       AND jsonb_typeof(r.raw_extraction->'line_items') = 'array' THEN
      i := 0;
      FOR it IN SELECT * FROM jsonb_array_elements(r.raw_extraction->'line_items') LOOP
        qty := coalesce(nullif(it->>'quantity','')::numeric, 1); IF qty = 0 THEN qty := 1; END IF;
        amt := coalesce(nullif(it->>'amount_ex_vat','')::numeric, nullif(it->>'unit_price_ex_vat','')::numeric * qty);
        INSERT INTO public.financial_document_lines(document_id, description, quantity, unit_price_ex_vat, amount_ex_vat, vat_rate, sort_order, project_id, classification_id)
        VALUES (doc_id, coalesce(nullif(btrim(it->>'description'),''), 'Item ' || (i + 1)), qty,
                coalesce(nullif(it->>'unit_price_ex_vat','')::numeric, amt / qty), amt, nullif(it->>'vat_rate','')::numeric,
                i, r.created_project_id, r.suggested_classification_id);
        i := i + 1;
      END LOOP;
    END IF;
    UPDATE public.financial_documents SET inventory_status = 'pending' WHERE id = doc_id AND inventory_status IS NULL;
  END IF;

  -- staff benefit → HR dashboard (same as finalizeQueueItem)
  IF r.assigned_collaborator_id IS NOT NULL AND coalesce(r.extracted_amount, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.benefit_expenses WHERE financial_document_id = doc_id) THEN
    SELECT id, legacy_enum INTO cat FROM public.benefit_categories
     WHERE classification_id = r.suggested_classification_id AND active ORDER BY sort_order LIMIT 1;
    d := coalesce(r.extracted_date, current_date);
    INSERT INTO public.benefit_expenses(entity_id, collaborator_id, ano_fiscal, categoria, category_id, classification_id,
      descricao, valor, data_despesa, estado, origin, financial_document_id, supplier_company_id, supplier_name_snapshot,
      supplier_nif, document_number, vat_amount, foto_path)
    VALUES (r.entity_id, r.assigned_collaborator_id, extract(year FROM d)::int, coalesce(cat.legacy_enum::text, 'outros')::benefit_category,
      cat.id, r.suggested_classification_id,
      coalesce(r.extracted_supplier_name, r.original_filename, r.suggested_classification_code, 'Benefício'),
      r.extracted_amount, d, 'pendente', 'finance', doc_id, r.matched_supplier_id, r.extracted_supplier_name,
      r.extracted_supplier_vat, r.extracted_document_number, nullif(coalesce(r.extracted_vat_amount, 0), 0), r.source_file_url);
  END IF;

  UPDATE public.financial_document_review_queue SET status = 'approved', created_expense_id = doc_id,
    reviewed_by = uid, reviewed_at = now()
  WHERE linked_document_group_id = r.linked_document_group_id
    AND supplier_approved_at IS NOT NULL AND classification_approved_at IS NOT NULL;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'finalized', jsonb_build_object('document_id', doc_id, 'historical', r.historical), uid);

  RETURN jsonb_build_object('ok', true, 'document_id', doc_id, 'counterparty_id', cid, 'created_counterparty', created, 'linked_counterparty', linked);
END $$;
REVOKE ALL ON FUNCTION public.fin_confirm_queue_item(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_confirm_queue_item(uuid, jsonb) TO authenticated;
