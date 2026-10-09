CREATE OR REPLACE FUNCTION public.fin_queue_blockers(r public.financial_document_review_queue)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE b text[] := '{}'; issued boolean := r.direction = 'issued';
  cid uuid; c record; cls record; vat text; ccode text;
BEGIN
  IF r.status::text <> 'pending_review' THEN RETURN ARRAY['status']; END IF;
  IF coalesce(r.intake_route, '') NOT IN ('purchases', 'issued') THEN RETURN ARRAY['not_confirmable']; END IF;
  IF r.entity_conflict_ids IS NOT NULL AND cardinality(r.entity_conflict_ids) > 0 THEN b := array_append(b, 'two_entities'); END IF;
  IF r.entity_id IS NULL THEN b := array_append(b, 'entity'); END IF;
  IF r.intake_type IS NULL OR r.intake_type = 'desconhecido' THEN b := array_append(b, 'doc_type'); END IF;
  IF r.direction::text = 'unclear' THEN b := array_append(b, 'direction'); END IF;
  IF r.extracted_date IS NULL THEN b := array_append(b, 'date'); END IF;
  IF r.extracted_amount IS NULL THEN b := array_append(b, 'total'); END IF;

  cid := CASE WHEN issued THEN r.matched_client_id ELSE r.matched_supplier_id END;
  vat := CASE WHEN issued THEN r.extracted_buyer_vat ELSE coalesce(r.extracted_supplier_vat, r.extracted_seller_vat) END;
  IF cid IS NOT NULL THEN
    SELECT co.is_platform, co.nif, co.foreign_tax_id INTO c FROM public.companies co WHERE co.id = cid;
    IF coalesce(c.is_platform, false) THEN
      IF coalesce(btrim(r.issuer_name), '') = '' THEN b := array_append(b, 'platform_issuer'); END IF;
    ELSIF NOT (coalesce(public.fin_pt_nif_valid(c.nif), false) OR coalesce(btrim(c.foreign_tax_id), '') <> '') THEN
      b := array_append(b, 'counterparty_tax');
    END IF;
  ELSIF NOT public.fin_tax_number_ok(vat) THEN
    b := array_append(b, 'counterparty');
  END IF;

  IF r.suggested_classification_id IS NULL THEN b := array_append(b, 'category');
  ELSE
    SELECT fc.level::text AS lvl, fc.active, fc.entity_id AS ent, fc.code AS cd INTO cls
      FROM public.financial_classifications fc WHERE fc.id = r.suggested_classification_id;
    IF cls.lvl IS DISTINCT FROM 'category' OR NOT coalesce(cls.active, false) OR cls.ent IS DISTINCT FROM r.entity_id THEN
      b := array_append(b, 'category_group');
    END IF;
    ccode := cls.cd;
    IF ccode IS NOT NULL AND (ccode = 'BEN' OR ccode LIKE 'BEN.%' OR ccode IN ('PES.FOOD','PES.HEALTH','PES.PERS','PES.OTHER'))
       AND r.assigned_collaborator_id IS NULL THEN b := array_append(b, 'collaborator'); END IF;
  END IF;

  IF r.paid_from_card_id IS NULL AND r.paid_from_account_id IS NULL AND NOT r.marked_unpaid THEN
    b := array_append(b, CASE WHEN r.extracted_card_last4 IS NOT NULL THEN 'card_unknown' ELSE 'paid_with' END);
  END IF;

  IF jsonb_typeof(r.possible_duplicates) = 'array' AND jsonb_array_length(r.possible_duplicates) > 0
     AND NOT coalesce(r.possible_duplicate_resolved, false) THEN b := array_append(b, 'duplicate'); END IF;
  RETURN b;
END $$;
