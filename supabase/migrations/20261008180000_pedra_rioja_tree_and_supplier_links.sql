-- Stage 3c: Pedra Rioja classification tree + find-by-NIF supplier links.
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
-- Pedra Rioja classification tree (entity e0b3ac8e-…); categories carry the policy.
WITH e AS (SELECT 'e0b3ac8e-97a5-4fb1-a2b0-53f65125d114'::uuid AS id),
g(code, name_pt, name_en, nature, sort) AS (VALUES
  ('PR.IMO', 'Imóveis', 'Properties', 'operational', 10),
  ('PR.FIN', 'Financiamento', 'Financing', 'financing', 20),
  ('PR.SRV', 'Serviços', 'Services', 'operational', 30),
  ('PR.BNK', 'Bancos', 'Banks', 'financing', 40),
  ('PR.REF', 'Refaturação', 'Re-invoicing', 'operational', 50),
  ('PR.INC', 'Rendimentos', 'Income', 'income', 60))
INSERT INTO public.financial_classifications (entity_id, code, name_pt, name_en, level, financial_nature, spending_policy, sort_order)
SELECT e.id, g.code, g.name_pt, g.name_en, 'group', g.nature::financial_nature, 'mandatory', g.sort FROM g, e
ON CONFLICT (entity_id, code) DO NOTHING;

WITH e AS (SELECT 'e0b3ac8e-97a5-4fb1-a2b0-53f65125d114'::uuid AS id),
c(parent, code, name_pt, name_en, nature, policy, sort) AS (VALUES
  ('PR.IMO', 'PR.IMO.CONDO', 'Condomínio', 'Condominium fees', 'operational', 'mandatory', 11),
  ('PR.IMO', 'PR.IMO.IMI', 'IMI / AIMI', 'Property tax (IMI / AIMI)', 'tax', 'mandatory', 12),
  ('PR.IMO', 'PR.IMO.INSUR', 'Seguro multirriscos', 'Multi-risk insurance', 'operational', 'mandatory', 13),
  ('PR.IMO', 'PR.IMO.MAINT', 'Manutenção e reparações', 'Maintenance and repairs', 'operational', 'mandatory', 14),
  ('PR.IMO', 'PR.IMO.IMPROV', 'Obras de melhoria', 'Improvement works', 'operational', 'discretionary', 15),
  ('PR.IMO', 'PR.IMO.UTIL', 'Água, luz, gás – frações vazias', 'Utilities – vacant units', 'operational', 'mandatory', 16),
  ('PR.FIN', 'PR.FIN.INTEREST', 'Juros do crédito', 'Loan interest', 'financing', 'mandatory', 21),
  ('PR.FIN', 'PR.FIN.FEES', 'Comissões e imposto do selo', 'Loan fees and stamp duty', 'financing', 'mandatory', 22),
  ('PR.SRV', 'PR.SRV.ACCOUNT', 'Contabilidade', 'Accounting', 'operational', 'mandatory', 31),
  ('PR.SRV', 'PR.SRV.LEGAL', 'Jurídico e notariado', 'Legal and notary', 'operational', 'mandatory', 32),
  ('PR.SRV', 'PR.SRV.AGENCY', 'Mediação e gestão de imóveis', 'Property brokerage and management', 'operational', 'discretionary', 33),
  ('PR.BNK', 'PR.BNK.FEES', 'Comissões bancárias', 'Bank fees', 'financing', 'mandatory', 41),
  ('PR.REF', 'PR.REF.TENANT', 'Custos a refaturar a inquilinos', 'Costs to re-invoice to tenants', 'operational', 'pass_through', 51),
  ('PR.INC', 'PR.INC.RENT', 'Rendas', 'Rents', 'income', 'mandatory', 61),
  ('PR.INC', 'PR.INC.REINV', 'Refaturação a inquilinos', 'Re-invoicing to tenants', 'income', 'mandatory', 62),
  ('PR.INC', 'PR.INC.OTHER', 'Outros proveitos', 'Other income', 'income', 'mandatory', 63))
INSERT INTO public.financial_classifications (entity_id, parent_id, code, name_pt, name_en, level, financial_nature, spending_policy, sort_order)
SELECT e.id, p.id, c.code, c.name_pt, c.name_en, 'category', c.nature::financial_nature, c.policy::financial_spending_policy, c.sort
FROM c CROSS JOIN e JOIN public.financial_classifications p ON p.entity_id = e.id AND p.code = c.parent
ON CONFLICT (entity_id, code) DO NOTHING;
