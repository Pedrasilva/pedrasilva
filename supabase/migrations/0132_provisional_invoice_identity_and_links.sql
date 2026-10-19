ALTER TABLE public.financial_documents
 ADD COLUMN fiscal_type text,
 ADD COLUMN fiscal_series text,
 ADD COLUMN fiscal_number text,
 ADD COLUMN fiscal_review_reasons text[] NOT NULL DEFAULT '{}',
 ADD COLUMN original_document_id uuid REFERENCES public.financial_documents(id),
 ADD COLUMN receipt_invoice_candidates uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN registration_origin text,
 ADD COLUMN import_metadata jsonb;
ALTER TABLE public.financial_document_lines ADD COLUMN payment_schedule_item_id uuid REFERENCES public.pm_payment_schedule_items(id);

CREATE OR REPLACE FUNCTION public.fin_fiscal_identity(_type text, _number text, _series text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE s text := upper(btrim(coalesce(_number,''))); m text[]; ft text; fs text; fn text;
BEGIN
 ft := CASE _type WHEN 'client_invoice' THEN 'FT' WHEN 'client_credit_note' THEN 'NC' ELSE NULL END;
 m := regexp_match(s, '^(FT|NC|R|RECIBO)[[:space:]]+N[º°O.]?[[:space:]]*([0-9]+)/([0-9]{4})$');
 IF m IS NOT NULL THEN fs := m[3]; fn := m[2];
 ELSE
  m := regexp_match(s, '^(FT|NC|R)[[:space:]]+([^/[:space:]]+)/([0-9]+)$');
  IF m IS NOT NULL THEN fs := m[2]; fn := m[3];
  ELSE
   m := regexp_match(s, '^(R|RECIBO)[[:space:]]+N[º°O.]?[[:space:]]*([0-9]+)$');
   IF m IS NOT NULL THEN fn := m[2];
   ELSIF s ~ '^[0-9]+$' THEN fn := s; END IF;
   fs := nullif(upper(btrim(_series)),'');
  END IF;
 END IF;
 RETURN jsonb_build_object('type',ft,'series',fs,'number',fn);
END $$;
REVOKE ALL ON FUNCTION public.fin_fiscal_identity(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_fiscal_identity(text,text,text) TO authenticated,service_role;

-- Approved additive backfill: preserve all original text, values, payment states and project links.
UPDATE public.financial_documents d SET
 fiscal_type=public.fin_fiscal_identity(doc_type::text,document_number,series)->>'type',
 fiscal_series=public.fin_fiscal_identity(doc_type::text,document_number,series)->>'series',
 fiscal_number=public.fin_fiscal_identity(doc_type::text,document_number,series)->>'number',
 registration_origin='manual',
 fiscal_review_reasons=CASE WHEN document_number IN ('FT Nº12/2026','FT 2026/12') THEN ARRAY['cttReview'] WHEN document_number='FT 2026/2024' THEN ARRAY['numberReview'] ELSE '{}'::text[] END
WHERE direction='issued';

UPDATE public.financial_documents SET receipt_invoice_candidates = CASE id
 WHEN '42410e7f-e6b2-4e83-babc-2d9580a95be1'::uuid THEN ARRAY['d84e5eb0-65ac-415b-94c3-1e4740f63346'::uuid]
 WHEN 'dc5b418d-dc5c-49c9-8cb8-df5e0a8147bd'::uuid THEN ARRAY['7eaf05d3-a7bd-4cb2-9c0d-7b9f734ee2f7'::uuid]
 WHEN '59019914-84d1-4d8e-9cf1-1b6933275bc3'::uuid THEN ARRAY['569e4396-cf17-4b1c-920f-23214ef216af'::uuid]
 ELSE '{}'::uuid[] END
WHERE id IN ('42410e7f-e6b2-4e83-babc-2d9580a95be1','dc5b418d-dc5c-49c9-8cb8-df5e0a8147bd','59019914-84d1-4d8e-9cf1-1b6933275bc3');

CREATE UNIQUE INDEX financial_documents_active_fiscal_identity ON public.financial_documents(entity_id,fiscal_type,fiscal_series,fiscal_number)
WHERE direction='issued' AND status<>'cancelled' AND nullif(fiscal_type,'') IS NOT NULL AND nullif(fiscal_series,'') IS NOT NULL AND nullif(fiscal_number,'') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fin_invoice_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE j jsonb; original public.financial_documents%ROWTYPE;
BEGIN
 IF NEW.direction='issued' THEN
  IF TG_OP='INSERT' OR NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.series IS DISTINCT FROM OLD.series OR NEW.doc_type IS DISTINCT FROM OLD.doc_type THEN
   j:=public.fin_fiscal_identity(NEW.doc_type::text,NEW.document_number,NEW.series);
   IF NEW.registration_origin IS DISTINCT FROM 'saft' THEN
    NEW.fiscal_type:=j->>'type'; NEW.fiscal_series:=j->>'series'; NEW.fiscal_number:=j->>'number';
   END IF;
  END IF;
  IF NEW.doc_type='receipt' AND NEW.registration_origin IS DISTINCT FROM 'saft' THEN NEW.fiscal_type:=NULL; END IF;
 END IF;
 IF NEW.original_document_id IS NOT NULL THEN
  SELECT * INTO original FROM public.financial_documents WHERE id=NEW.original_document_id;
  IF NOT FOUND OR original.entity_id IS DISTINCT FROM NEW.entity_id OR original.direction<>'issued' OR original.doc_type<>'client_invoice' OR NEW.original_document_id=NEW.id OR NEW.doc_type NOT IN ('client_credit_note','receipt') OR original.counterparty_client_id IS DISTINCT FROM NEW.counterparty_client_id THEN
   RAISE EXCEPTION 'Invalid original invoice reference' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_fin_invoice_identity_guard BEFORE INSERT OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fin_invoice_identity_guard();

CREATE OR REPLACE FUNCTION public.fin_invoice_milestone_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p uuid; e uuid; de uuid; dp uuid;
BEGIN
 IF NEW.payment_schedule_item_id IS NULL THEN RETURN NEW; END IF;
 SELECT project_id,entity_id INTO p,e FROM public.pm_payment_schedule_items WHERE id=NEW.payment_schedule_item_id;
 SELECT entity_id,project_id INTO de,dp FROM public.financial_documents WHERE id=NEW.document_id;
 IF p IS NULL OR NEW.project_id IS DISTINCT FROM p OR e IS DISTINCT FROM de OR (dp IS NOT NULL AND dp IS DISTINCT FROM p) THEN
  RAISE EXCEPTION 'Milestone must belong to invoice project and entity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_fin_invoice_milestone_guard BEFORE INSERT OR UPDATE ON public.financial_document_lines FOR EACH ROW EXECUTE FUNCTION public.fin_invoice_milestone_guard();
COMMENT ON COLUMN public.financial_documents.fiscal_type IS 'Confirmed fiscal identity; receipts remain NULL until SAF-T evidence. Original document_number is preserved.';
COMMENT ON COLUMN public.financial_documents.receipt_invoice_candidates IS 'Suggestions only. Does not confirm payments or original_document_id.';
COMMENT ON COLUMN public.financial_documents.fiscal_review_reasons IS 'Review flags, never automatically resolve CTT or FT 2026/2024.';