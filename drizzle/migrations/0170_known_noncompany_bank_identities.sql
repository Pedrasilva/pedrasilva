CREATE TABLE public.finance_known_bank_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_name text NOT NULL, holder text NOT NULL,
 iban text, account_number text, ownership text NOT NULL CHECK (ownership IN ('personal','external')),
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (iban IS NOT NULL OR account_number IS NOT NULL)
);
GRANT SELECT ON public.finance_known_bank_identities TO authenticated;
GRANT ALL ON public.finance_known_bank_identities TO service_role;
REVOKE TRUNCATE ON public.finance_known_bank_identities FROM anon, authenticated;
ALTER TABLE public.finance_known_bank_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY known_bank_read ON public.finance_known_bank_identities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard'));
ALTER TABLE public.financial_document_review_queue ADD COLUMN bank_ownership text;
ALTER TABLE public.financial_document_review_queue ADD COLUMN known_bank_identity_id uuid REFERENCES public.finance_known_bank_identities(id);
CREATE FUNCTION public.fin_known_bank_identity(_iban text, _account text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT id FROM public.finance_known_bank_identities k
 WHERE (length(regexp_replace(coalesce(_iban,''),'[^A-Za-z0-9]','','g'))>=15 AND upper(regexp_replace(k.iban,'[^A-Za-z0-9]','','g'))=upper(regexp_replace(_iban,'[^A-Za-z0-9]','','g')))
 OR (length(regexp_replace(coalesce(_account,''),'[^0-9]','','g'))>=6 AND regexp_replace(k.account_number,'[^0-9]','','g')=regexp_replace(_account,'[^0-9]','','g'))
 ORDER BY id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fin_known_bank_identity(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_known_bank_identity(text,text) TO authenticated,service_role;
CREATE FUNCTION public.fin_queue_known_bank_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.finance_known_bank_identities;
BEGIN
 IF NEW.intake_type='extrato_bancario' OR NEW.bank_doc_kind IN ('account_statement','card_statement','bank_export') THEN
 SELECT * INTO k FROM public.finance_known_bank_identities WHERE id=public.fin_known_bank_identity(NEW.extracted_iban,NEW.extracted_account_number);
 IF k.id IS NOT NULL THEN
 NEW.bank_ownership:=k.ownership; NEW.known_bank_identity_id:=k.id;
 NEW.bank_identity_flag:=CASE WHEN k.ownership='personal' THEN 'personal_account' ELSE 'not_company' END;
 NEW.matched_bank_account_id:=NULL; NEW.statement_period_id:=NULL;
 NEW.intake_route:='other'; NEW.status:='removed'; NEW.purge_exempt:=true;
 NEW.removed_at:=coalesce(NEW.removed_at,now()); NEW.removed_source:='known_bank_identity';
 NEW.removed_reason:=CASE WHEN k.ownership='personal' THEN 'Pessoal - não empresa' ELSE 'Não pertence à empresa' END;
 NEW.removed_tag:=NEW.bank_identity_flag; NEW.drive_copy_status:=NULL; NEW.drive_next_retry_at:=NULL;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a1_fdrq_known_bank BEFORE INSERT OR UPDATE ON public.financial_document_review_queue FOR EACH ROW EXECUTE FUNCTION public.fin_queue_known_bank_guard();
CREATE FUNCTION public.fin_partner_transfer_hint(_tx_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('holder',k.holder,'bank',k.bank_name,'ownership',k.ownership)
 INTO result FROM public.bank_transactions t JOIN public.finance_known_bank_identities k ON k.ownership='personal'
 WHERE t.id=_tx_id AND (position(upper(regexp_replace(k.iban,'[^A-Za-z0-9]','','g')) in upper(regexp_replace(t.description||' '||coalesce(t.raw_row::text,''),'[^A-Za-z0-9]','','g')))>0
 OR (length(regexp_replace(k.account_number,'[^0-9]','','g'))>=6 AND position(regexp_replace(k.account_number,'[^0-9]','','g') in regexp_replace(t.description||' '||coalesce(t.raw_row::text,''),'[^0-9]','','g'))>0))
 ORDER BY k.id LIMIT 1;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fin_partner_transfer_hint(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_partner_transfer_hint(uuid) TO authenticated,service_role;