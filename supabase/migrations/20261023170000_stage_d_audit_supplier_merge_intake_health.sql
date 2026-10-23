-- Stage D: reconciliation audit trail, supplier duplicate merge with aliases, intake source health.

-- 1. Reconciliation audit trail (written only by triggers; read per entity).
CREATE TABLE public.fin_reconcile_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid,
  bank_transaction_id uuid,
  document_id uuid,
  payment_id uuid,
  action text NOT NULL,
  amount numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_reconcile_audit_tx_idx ON public.fin_reconcile_audit (bank_transaction_id, created_at DESC);
CREATE INDEX fin_reconcile_audit_doc_idx ON public.fin_reconcile_audit (document_id, created_at DESC);
CREATE INDEX fin_reconcile_audit_at_idx ON public.fin_reconcile_audit (created_at DESC);
GRANT SELECT ON public.fin_reconcile_audit TO authenticated;
GRANT ALL ON public.fin_reconcile_audit TO service_role;
REVOKE TRUNCATE ON public.fin_reconcile_audit FROM anon, authenticated;
ALTER TABLE public.fin_reconcile_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read their entity's reconciliation audit"
  ON public.fin_reconcile_audit FOR SELECT TO authenticated
  USING (public.fin_row_visible(entity_id));

CREATE OR REPLACE FUNCTION public.fin_reconcile_audit_write(
  _tx uuid, _doc uuid, _pay uuid, _action text, _amount numeric, _detail jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _entity uuid;
BEGIN
  SELECT entity_id INTO _entity FROM bank_transactions WHERE id = _tx;
  IF _entity IS NULL AND _doc IS NOT NULL THEN
    SELECT entity_id INTO _entity FROM financial_documents WHERE id = _doc;
  END IF;
  INSERT INTO fin_reconcile_audit (entity_id, bank_transaction_id, document_id, payment_id, action, amount, detail, actor_id, actor_email)
  VALUES (_entity, _tx, _doc, _pay, _action, _amount, coalesce(_detail, '{}'::jsonb), auth.uid(), auth.jwt() ->> 'email');
END $$;
REVOKE ALL ON FUNCTION public.fin_reconcile_audit_write(uuid, uuid, uuid, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_reconcile_audit_payment_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.bank_transaction_id IS NOT NULL THEN
      PERFORM fin_reconcile_audit_write(NEW.bank_transaction_id, NEW.document_id, NEW.id, 'match', NEW.amount,
        jsonb_build_object('payment_date', NEW.payment_date, 'method', NEW.method));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.bank_transaction_id IS NOT NULL THEN
      PERFORM fin_reconcile_audit_write(OLD.bank_transaction_id, OLD.document_id, OLD.id, 'unmatch', OLD.amount,
        jsonb_build_object('payment_date', OLD.payment_date, 'method', OLD.method));
    END IF;
    RETURN OLD;
  ELSE
    IF OLD.bank_transaction_id IS DISTINCT FROM NEW.bank_transaction_id THEN
      IF OLD.bank_transaction_id IS NOT NULL THEN
        PERFORM fin_reconcile_audit_write(OLD.bank_transaction_id, OLD.document_id, OLD.id, 'unmatch', OLD.amount, '{}'::jsonb);
      END IF;
      IF NEW.bank_transaction_id IS NOT NULL THEN
        PERFORM fin_reconcile_audit_write(NEW.bank_transaction_id, NEW.document_id, NEW.id, 'match', NEW.amount, '{}'::jsonb);
      END IF;
    ELSIF NEW.bank_transaction_id IS NOT NULL AND (OLD.amount IS DISTINCT FROM NEW.amount OR OLD.document_id IS DISTINCT FROM NEW.document_id) THEN
      PERFORM fin_reconcile_audit_write(NEW.bank_transaction_id, NEW.document_id, NEW.id, 'amount_change', NEW.amount,
        jsonb_build_object('old_amount', OLD.amount, 'old_document_id', OLD.document_id));
    END IF;
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER fin_reconcile_audit_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_document_payments
  FOR EACH ROW EXECUTE FUNCTION public.fin_reconcile_audit_payment_trg();

CREATE OR REPLACE FUNCTION public.fin_reconcile_audit_tx_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     OR (OLD.reconciled_at IS NULL) <> (NEW.reconciled_at IS NULL)
     OR OLD.ignored_reason IS DISTINCT FROM NEW.ignored_reason THEN
    PERFORM fin_reconcile_audit_write(NEW.id, NULL, NULL,
      CASE WHEN OLD.reconciled_at IS NULL AND NEW.reconciled_at IS NOT NULL THEN 'reconciled'
           WHEN OLD.reconciled_at IS NOT NULL AND NEW.reconciled_at IS NULL THEN 'unreconciled'
           ELSE 'status_change' END,
      NEW.amount,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'ignored_reason', NEW.ignored_reason));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_reconcile_audit_tx
  AFTER UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fin_reconcile_audit_tx_trg();

-- Searchable register (invoker: RLS on every joined table applies).
CREATE OR REPLACE FUNCTION public.fin_reconcile_audit_search(
  _q text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _tx uuid DEFAULT NULL, _doc uuid DEFAULT NULL, _limit int DEFAULT 200
) RETURNS TABLE (
  id uuid, created_at timestamptz, action text, amount numeric, detail jsonb, actor_email text,
  bank_transaction_id uuid, tx_date date, tx_description text, tx_amount numeric, bank_account_id uuid,
  document_id uuid, document_number text, counterparty text, document_total numeric
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT a.id, a.created_at, a.action, a.amount, a.detail, a.actor_email,
         a.bank_transaction_id, t.transaction_date, t.description, t.amount, t.bank_account_id,
         a.document_id, d.document_number, coalesce(d.counterparty_name_snapshot, d.issuer_name), d.total_inc_vat
  FROM fin_reconcile_audit a
  LEFT JOIN bank_transactions t ON t.id = a.bank_transaction_id
  LEFT JOIN financial_documents d ON d.id = a.document_id
  WHERE (_tx IS NULL OR a.bank_transaction_id = _tx)
    AND (_doc IS NULL OR a.document_id = _doc)
    AND (_from IS NULL OR a.created_at >= _from)
    AND (_to IS NULL OR a.created_at < _to + 1)
    AND (_q IS NULL OR _q = '' OR concat_ws(' ', t.description, d.document_number, d.counterparty_name_snapshot, d.issuer_name,
           a.actor_email, a.action, a.amount::text, t.amount::text) ILIKE '%' || _q || '%')
  ORDER BY a.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 200), 1), 1000)
$$;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_audit_search(text, date, date, uuid, uuid, int) TO authenticated;

-- 2. Supplier duplicates: aliases, decisions, merge log.
CREATE TABLE public.company_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  alias text NOT NULL,
  alias_nif text,
  source_company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_aliases_company_idx ON public.company_aliases (company_id);
CREATE INDEX company_aliases_source_idx ON public.company_aliases (source_company_id);
GRANT SELECT ON public.company_aliases TO authenticated;
GRANT ALL ON public.company_aliases TO service_role;
REVOKE TRUNCATE ON public.company_aliases FROM anon, authenticated;
ALTER TABLE public.company_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PSA staff read company aliases" ON public.company_aliases FOR SELECT TO authenticated
  USING (public.is_psa_staff());

CREATE TABLE public.company_duplicate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_a uuid NOT NULL,
  company_b uuid NOT NULL,
  decision text NOT NULL DEFAULT 'not_duplicate',
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_a, company_b)
);
GRANT SELECT ON public.company_duplicate_decisions TO authenticated;
GRANT ALL ON public.company_duplicate_decisions TO service_role;
REVOKE TRUNCATE ON public.company_duplicate_decisions FROM anon, authenticated;
ALTER TABLE public.company_duplicate_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read company duplicate decisions" ON public.company_duplicate_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.company_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keep_company_id uuid NOT NULL,
  merged_company_id uuid NOT NULL,
  merged_snapshot jsonb NOT NULL,
  moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  left_in_place jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  merged_by uuid,
  merged_by_email text,
  merged_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_merge_log TO authenticated;
GRANT ALL ON public.company_merge_log TO service_role;
REVOKE TRUNCATE ON public.company_merge_log FROM anon, authenticated;
ALTER TABLE public.company_merge_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read company merge log" ON public.company_merge_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Candidates: same valid NIF, or same normalised name, both active, no "not duplicate" decision.
CREATE OR REPLACE FUNCTION public.fin_supplier_duplicate_candidates()
RETURNS TABLE (
  company_a uuid, name_a text, nif_a text, docs_a bigint, total_a numeric,
  company_b uuid, name_b text, nif_b text, docs_b bigint, total_b numeric, reason text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT co.id, co.nome, nullif(co.nif, '') AS nif, public.fin_name_key(co.nome) AS k
    FROM companies co
    WHERE co.is_active AND (co.is_supplier OR EXISTS (SELECT 1 FROM financial_documents d WHERE d.counterparty_supplier_id = co.id))
  ), u AS (
    SELECT d.counterparty_supplier_id AS cid, count(*) AS n, sum(d.total_inc_vat) AS tot
    FROM financial_documents d WHERE d.counterparty_supplier_id IS NOT NULL GROUP BY 1
  ), p AS (
    SELECT a.id AS ia, b.id AS ib, CASE WHEN a.nif IS NOT NULL AND a.nif = b.nif THEN 'same_nif' ELSE 'same_name' END AS why
    FROM c a JOIN c b ON a.id < b.id AND ((a.nif IS NOT NULL AND a.nif = b.nif) OR (length(a.k) >= 3 AND a.k = b.k))
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

CREATE OR REPLACE FUNCTION public.fin_company_not_duplicate(_a uuid, _b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Only administrators can decide supplier duplicates' USING ERRCODE = '42501'; END IF;
  INSERT INTO company_duplicate_decisions (company_a, company_b, decided_by)
  VALUES (least(_a, _b), greatest(_a, _b), auth.uid()) ON CONFLICT (company_a, company_b) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.fin_company_not_duplicate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_company_not_duplicate(uuid, uuid) TO authenticated;

-- Merge after a person's confirmation: every reference moves to the kept company,
-- the merged company stays (inactive, never deleted) and its name/NIF become aliases.
CREATE OR REPLACE FUNCTION public.fin_merge_companies(_keep uuid, _merge uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; n bigint; moved jsonb := '{}'::jsonb; kept jsonb := '{}'::jsonb; snap jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Only administrators can merge suppliers' USING ERRCODE = '42501'; END IF;
  IF _keep IS NULL OR _merge IS NULL OR _keep = _merge THEN RAISE EXCEPTION 'Choose two different companies'; END IF;
  IF coalesce(trim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT to_jsonb(c) INTO snap FROM companies c WHERE c.id = _merge FOR UPDATE;
  IF snap IS NULL OR NOT EXISTS (SELECT 1 FROM companies WHERE id = _keep AND is_active) THEN
    RAISE EXCEPTION 'Company not found or inactive';
  END IF;
  IF NOT (snap ->> 'is_active')::boolean THEN RAISE EXCEPTION 'This company was already merged or archived'; END IF;

  FOR r IN
    SELECT c.conrelid::regclass::text AS t, a.attname AS col
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.companies'::regclass AND c.conrelid <> 'public.company_aliases'::regclass
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.t, r.col, r.col) USING _keep, _merge;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN moved := moved || jsonb_build_object(r.t || '.' || r.col, n); END IF;
    EXCEPTION WHEN unique_violation THEN
      -- The kept company already has the same link (e.g. entity membership): leave the old row untouched.
      EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.t, r.col) INTO n USING _merge;
      kept := kept || jsonb_build_object(r.t || '.' || r.col, n);
    END;
  END LOOP;

  UPDATE company_aliases SET company_id = _keep WHERE company_id = _merge;
  INSERT INTO company_aliases (company_id, alias, alias_nif, source_company_id, created_by)
  VALUES (_keep, snap ->> 'nome', nullif(snap ->> 'nif', ''), _merge, auth.uid());
  UPDATE companies SET is_active = false,
    notas = concat_ws(E'\n', nullif(notas, ''), format('Fundido em %s (%s) em %s: %s',
      (SELECT nome FROM companies WHERE id = _keep), _keep, to_char(now(), 'YYYY-MM-DD'), trim(_reason)))
  WHERE id = _merge;
  INSERT INTO company_merge_log (keep_company_id, merged_company_id, merged_snapshot, moved, left_in_place, reason, merged_by, merged_by_email)
  VALUES (_keep, _merge, snap, moved, kept, trim(_reason), auth.uid(), auth.jwt() ->> 'email');
  RETURN jsonb_build_object('moved', moved, 'left_in_place', kept);
END $$;
REVOKE ALL ON FUNCTION public.fin_merge_companies(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_merge_companies(uuid, uuid, text) TO authenticated;

-- 3. Intake source health (docs@, Drive, ideas@): runs and alerts sent.
CREATE TABLE public.intake_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('docs', 'drive', 'ideas')),
  ok boolean NOT NULL,
  items integer NOT NULL DEFAULT 0,
  error text,
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intake_source_runs_idx ON public.intake_source_runs (source, ran_at DESC);
GRANT SELECT ON public.intake_source_runs TO authenticated;
GRANT ALL ON public.intake_source_runs TO service_role;
REVOKE TRUNCATE ON public.intake_source_runs FROM anon, authenticated;
ALTER TABLE public.intake_source_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read intake source runs" ON public.intake_source_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.intake_source_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('failures', 'silence')),
  alert_day date NOT NULL,
  message text NOT NULL,
  emailed boolean NOT NULL DEFAULT false,
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, kind, alert_day)
);
GRANT SELECT ON public.intake_source_alerts TO authenticated;
GRANT ALL ON public.intake_source_alerts TO service_role;
REVOKE TRUNCATE ON public.intake_source_alerts FROM anon, authenticated;
ALTER TABLE public.intake_source_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read intake source alerts" ON public.intake_source_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
