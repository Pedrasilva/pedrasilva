-- Supplier tax numbers: platforms, foreign tax ids, issuer on documents,
-- Portuguese NIF validation and a change log.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS foreign_tax_id text;
COMMENT ON COLUMN public.companies.is_platform IS 'Brand/platform supplier (Uber, Bolt, Amazon, taxis): needs no NIF; the real issuer lives on each document (issuer_*).';
COMMENT ON COLUMN public.companies.foreign_tax_id IS 'Tax number of a non-PT supplier (tax_country <> PT). nif holds Portuguese NIFs only.';

ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS issuer_name text,
  ADD COLUMN IF NOT EXISTS issuer_nif text,
  ADD COLUMN IF NOT EXISTS issuer_tax_country text,
  ADD COLUMN IF NOT EXISTS issuer_foreign_tax_id text;
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS issuer_name text,
  ADD COLUMN IF NOT EXISTS issuer_nif text,
  ADD COLUMN IF NOT EXISTS issuer_tax_country text,
  ADD COLUMN IF NOT EXISTS issuer_foreign_tax_id text;

-- Obvious placeholder numbers: periodic (111111111, 123123123, 500500500),
-- 7+ identical digits in a row (000000001, 500000002), straight runs
-- (123456789) and doubled digits (112233445).
CREATE OR REPLACE FUNCTION public.fin_nif_is_placeholder(_nif text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _nif IS NULL OR _nif !~ '^\d{9}$' THEN false ELSE
    _nif ~ '^(\d)\1{8}$' OR _nif ~ '^(\d{2})\1{3}\d$' OR _nif ~ '^(\d{3})\1\1$'
    OR _nif ~ '(\d)\1{6}'
    OR _nif LIKE '12345678%' OR _nif LIKE '98765432%'
    OR _nif ~ '^(\d)\1(\d)\2(\d)\3(\d)\4'
  END
$$;

CREATE OR REPLACE FUNCTION public.fin_pt_nif_valid(_nif text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s int := 0; i int; m int; c int;
BEGIN
  IF _nif IS NULL OR _nif !~ '^\d{9}$' THEN RETURN false; END IF;
  IF substr(_nif,1,1) NOT IN ('1','2','3','5','6','8','9')
     AND substr(_nif,1,2) NOT IN ('45','70','71','72','74','75','77','79','90','91','98','99') THEN RETURN false; END IF;
  FOR i IN 1..8 LOOP s := s + substr(_nif,i,1)::int * (10 - i); END LOOP;
  m := s % 11; c := CASE WHEN m < 2 THEN 0 ELSE 11 - m END;
  IF c <> substr(_nif,9,1)::int THEN RETURN false; END IF;
  RETURN NOT public.fin_nif_is_placeholder(_nif);
END $$;

-- Change log for supplier and document tax fields.
CREATE TABLE IF NOT EXISTS public.tax_number_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_number_change_log TO authenticated;
GRANT ALL ON public.tax_number_change_log TO service_role;
ALTER TABLE public.tax_number_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reads tax number log" ON public.tax_number_change_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_finance_user(auth.uid()));
CREATE INDEX IF NOT EXISTS tax_number_change_log_record_idx ON public.tax_number_change_log (record_table, record_id);

CREATE OR REPLACE FUNCTION public.fin_tax_log(_t text, _id uuid, _f text, _o text, _n text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.tax_number_change_log (record_table, record_id, field, old_value, new_value, reason, changed_by)
  SELECT _t, _id, _f, _o, _n, nullif(current_setting('fin.change_reason', true), ''), auth.uid()
  WHERE _o IS DISTINCT FROM _n
$$;
REVOKE EXECUTE ON FUNCTION public.fin_tax_log(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- Companies: foreign numbers go to foreign_tax_id; Portuguese NIFs must pass.
CREATE OR REPLACE FUNCTION public.companies_tax_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tax_country := upper(coalesce(nullif(trim(NEW.tax_country), ''), 'PT'));
  IF NEW.nif IS NOT NULL AND trim(NEW.nif) = '' THEN NEW.nif := NULL; END IF;
  IF TG_OP = 'INSERT' OR NEW.nif IS DISTINCT FROM OLD.nif OR NEW.tax_country IS DISTINCT FROM OLD.tax_country THEN
    IF NEW.nif IS NOT NULL AND NEW.tax_country <> 'PT' THEN
      NEW.foreign_tax_id := coalesce(NEW.foreign_tax_id, NEW.nif);
      NEW.nif := NULL;
    END IF;
    IF NEW.nif IS NOT NULL THEN
      NEW.nif := regexp_replace(regexp_replace(upper(NEW.nif), '^PT', ''), '\D', '', 'g');
      IF NOT public.fin_pt_nif_valid(NEW.nif) THEN
        RAISE EXCEPTION 'Invalid Portuguese NIF %', NEW.nif USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_tax_guard_trg ON public.companies;
CREATE TRIGGER companies_tax_guard_trg BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_tax_guard();

CREATE OR REPLACE FUNCTION public.companies_tax_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fin_tax_log('companies', NEW.id, 'nif', OLD.nif, NEW.nif);
  PERFORM public.fin_tax_log('companies', NEW.id, 'tax_country', OLD.tax_country, NEW.tax_country);
  PERFORM public.fin_tax_log('companies', NEW.id, 'foreign_tax_id', OLD.foreign_tax_id, NEW.foreign_tax_id);
  PERFORM public.fin_tax_log('companies', NEW.id, 'is_platform', OLD.is_platform::text, NEW.is_platform::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_tax_log_trg ON public.companies;
CREATE TRIGGER companies_tax_log_trg AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_tax_log();

-- Documents: the issuer's Portuguese NIF must pass; changes are logged.
CREATE OR REPLACE FUNCTION public.fin_issuer_tax_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.issuer_nif IS NOT NULL AND trim(NEW.issuer_nif) = '' THEN NEW.issuer_nif := NULL; END IF;
  IF TG_OP = 'INSERT' OR NEW.issuer_nif IS DISTINCT FROM OLD.issuer_nif OR NEW.issuer_tax_country IS DISTINCT FROM OLD.issuer_tax_country THEN
    IF NEW.issuer_nif IS NOT NULL AND coalesce(upper(NEW.issuer_tax_country), 'PT') <> 'PT' THEN
      NEW.issuer_foreign_tax_id := coalesce(NEW.issuer_foreign_tax_id, NEW.issuer_nif);
      NEW.issuer_nif := NULL;
    END IF;
    IF NEW.issuer_nif IS NOT NULL THEN
      NEW.issuer_nif := regexp_replace(regexp_replace(upper(NEW.issuer_nif), '^PT', ''), '\D', '', 'g');
      IF NOT public.fin_pt_nif_valid(NEW.issuer_nif) THEN
        RAISE EXCEPTION 'Invalid Portuguese NIF %', NEW.issuer_nif USING ERRCODE = '23514';
      END IF;
      NEW.issuer_tax_country := 'PT';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fin_issuer_tax_guard_trg ON public.financial_documents;
CREATE TRIGGER fin_issuer_tax_guard_trg BEFORE INSERT OR UPDATE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fin_issuer_tax_guard();

CREATE OR REPLACE FUNCTION public.fin_issuer_tax_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fin_tax_log('financial_documents', NEW.id, 'issuer_name', OLD.issuer_name, NEW.issuer_name);
  PERFORM public.fin_tax_log('financial_documents', NEW.id, 'issuer_nif', OLD.issuer_nif, NEW.issuer_nif);
  PERFORM public.fin_tax_log('financial_documents', NEW.id, 'issuer_tax_country', OLD.issuer_tax_country, NEW.issuer_tax_country);
  PERFORM public.fin_tax_log('financial_documents', NEW.id, 'issuer_foreign_tax_id', OLD.issuer_foreign_tax_id, NEW.issuer_foreign_tax_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fin_issuer_tax_log_trg ON public.financial_documents;
CREATE TRIGGER fin_issuer_tax_log_trg AFTER UPDATE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fin_issuer_tax_log();

CREATE INDEX IF NOT EXISTS financial_documents_issuer_nif_idx ON public.financial_documents (issuer_nif) WHERE issuer_nif IS NOT NULL;
