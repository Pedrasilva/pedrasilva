-- Stricter "same name" for supplier duplicates: full name without accents, punctuation
-- and legal-form words (Lda, SA, Ltd, Unipessoal...), instead of the short matching key.
CREATE OR REPLACE FUNCTION public.fin_company_dup_key(_n text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(
    regexp_replace(
      ' ' || regexp_replace(lower(translate(coalesce(_n, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', ' ', 'g') || ' ',
      ' (lda|limitada|sa|s a|ltd|limited|unipessoal|inc|llc|gmbh|bv|sl|plc|sociedade|soc|e|and|the|de|da|do|das|dos) ', ' ', 'g'),
    '\s+', '', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION public.fin_supplier_duplicate_candidates()
RETURNS TABLE (
  company_a uuid, name_a text, nif_a text, docs_a bigint, total_a numeric,
  company_b uuid, name_b text, nif_b text, docs_b bigint, total_b numeric, reason text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT co.id, co.nome, nullif(co.nif, '') AS nif, public.fin_company_dup_key(co.nome) AS k
    FROM companies co
    WHERE co.is_active AND (co.is_supplier OR EXISTS (SELECT 1 FROM financial_documents d WHERE d.counterparty_supplier_id = co.id))
  ), u AS (
    SELECT d.counterparty_supplier_id AS cid, count(*) AS n, sum(d.total_inc_vat) AS tot
    FROM financial_documents d WHERE d.counterparty_supplier_id IS NOT NULL GROUP BY 1
  ), p AS (
    SELECT a.id AS ia, b.id AS ib, CASE WHEN a.nif IS NOT NULL AND a.nif = b.nif THEN 'same_nif' ELSE 'same_name' END AS why
    FROM c a JOIN c b ON a.id < b.id
      AND ((a.nif IS NOT NULL AND a.nif = b.nif)
        OR (length(a.k) >= 4 AND a.k = b.k AND (a.nif IS NULL OR b.nif IS NULL OR a.nif = b.nif)))
  )
  SELECT p.ia, ca.nome, ca.nif, coalesce(ua.n, 0), coalesce(ua.tot, 0),
         p.ib, cb.nome, cb.nif, coalesce(ub.n, 0), coalesce(ub.tot, 0), p.why
  FROM p JOIN c ca ON ca.id = p.ia JOIN c cb ON cb.id = p.ib
  LEFT JOIN u ua ON ua.cid = p.ia LEFT JOIN u ub ON ub.cid = p.ib
  WHERE NOT EXISTS (SELECT 1 FROM company_duplicate_decisions x
                    WHERE (x.company_a = p.ia AND x.company_b = p.ib) OR (x.company_a = p.ib AND x.company_b = p.ia))
  ORDER BY (p.why = 'same_nif') DESC, ca.nome;
END $$;
REVOKE ALL ON FUNCTION public.fin_supplier_duplicate_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_supplier_duplicate_candidates() TO authenticated;
