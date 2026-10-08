CREATE TABLE IF NOT EXISTS public.finance_entity_companies (
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  linked_by uuid DEFAULT auth.uid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, company_id)
);
GRANT SELECT ON public.finance_entity_companies TO authenticated;
GRANT ALL ON public.finance_entity_companies TO service_role;
ALTER TABLE public.finance_entity_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity members read their links" ON public.finance_entity_companies
  FOR SELECT TO authenticated USING (public.is_psa_staff() OR public.has_entity_access(entity_id));

CREATE OR REPLACE FUNCTION public.fin_company_visible(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.financial_documents d WHERE (d.counterparty_supplier_id = _company_id OR d.counterparty_client_id = _company_id) AND d.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(d.entity_id))
      OR EXISTS (SELECT 1 FROM public.financial_document_review_queue q WHERE (q.matched_supplier_id = _company_id OR q.matched_client_id = _company_id) AND q.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(q.entity_id))
      OR EXISTS (SELECT 1 FROM public.financial_expense_items i WHERE i.supplier_id = _company_id AND i.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(i.entity_id))
      OR EXISTS (SELECT 1 FROM public.finance_entity_companies l WHERE l.company_id = _company_id AND l.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(l.entity_id))
$function$;

CREATE OR REPLACE FUNCTION public.fin_find_company_by_nif(_nif text)
 RETURNS TABLE(id uuid, nome text, nif text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nome, c.nif FROM public.companies c
  WHERE (public.is_psa_staff() OR public.is_non_psa_entity_member())
    AND nullif(regexp_replace(coalesce(_nif, ''), '\D', '', 'g'), '') IS NOT NULL
    AND c.nif = regexp_replace(_nif, '\D', '', 'g')
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.fin_link_company_to_entity(_company_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _e uuid := public.current_finance_entity();
BEGIN
  IF _e IS NULL OR NOT public.has_entity_access(_e) THEN
    RAISE EXCEPTION 'No finance entity access' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  INSERT INTO public.finance_entity_companies(entity_id, company_id, linked_by)
  VALUES (_e, _company_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN _company_id;
END $function$;

REVOKE ALL ON FUNCTION public.fin_find_company_by_nif(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.fin_link_company_to_entity(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_find_company_by_nif(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_link_company_to_entity(uuid) TO authenticated, service_role;