-- Finance: simplified PSA classification tree, remap log, policy overrides,
-- category-only rule, "Por reclassificar" suggestions, benefits → Pessoal rule.

-- 1. Remap log ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classification_remap_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  old_code text,
  new_code text,
  reason text NOT NULL DEFAULT 'remap',
  changed_by uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.classification_remap_log TO authenticated;
GRANT ALL ON public.classification_remap_log TO service_role;
ALTER TABLE public.classification_remap_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity rows readable" ON public.classification_remap_log
  FOR SELECT TO authenticated USING (public.fin_row_visible(entity_id));
CREATE INDEX IF NOT EXISTS classification_remap_log_record_idx ON public.classification_remap_log (record_table, record_id);
CREATE TRIGGER classification_remap_log_require_entity BEFORE INSERT ON public.classification_remap_log
  FOR EACH ROW EXECUTE FUNCTION public.fin_require_entity();

-- 2. Old code → new code map (AI learning translates through it) ----------
CREATE TABLE IF NOT EXISTS public.finance_classification_code_map (
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  old_code text NOT NULL,
  new_code text,               -- null = group-level, needs a person (Por reclassificar)
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, old_code)
);
GRANT SELECT ON public.finance_classification_code_map TO authenticated;
GRANT ALL ON public.finance_classification_code_map TO service_role;
ALTER TABLE public.finance_classification_code_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity rows readable" ON public.finance_classification_code_map
  FOR SELECT TO authenticated USING (public.fin_row_visible(entity_id));

-- 3. AI suggestions for group-level records (never applied automatically) --
CREATE TABLE IF NOT EXISTS public.classification_reclass_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  record_table text NOT NULL CHECK (record_table IN ('financial_documents','bank_transaction_classifications')),
  record_id uuid NOT NULL,
  suggested_classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL,
  reason text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_table, record_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classification_reclass_suggestions TO authenticated;
GRANT ALL ON public.classification_reclass_suggestions TO service_role;
ALTER TABLE public.classification_reclass_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity rows" ON public.classification_reclass_suggestions
  FOR ALL TO authenticated USING (public.fin_row_visible(entity_id)) WITH CHECK (public.fin_row_visible(entity_id));
CREATE TRIGGER classification_reclass_suggestions_require_entity BEFORE INSERT ON public.classification_reclass_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.fin_require_entity();

-- 4. Policy overrides and per-entity supplier default ----------------------
ALTER TABLE public.financial_documents ADD COLUMN IF NOT EXISTS spending_policy_override public.financial_spending_policy;
ALTER TABLE public.bank_transaction_classifications ADD COLUMN IF NOT EXISTS spending_policy_override public.financial_spending_policy;
ALTER TABLE public.benefit_expenses ADD COLUMN IF NOT EXISTS spending_policy_override public.financial_spending_policy;
ALTER TABLE public.finance_entity_companies ADD COLUMN IF NOT EXISTS spending_policy_default public.financial_spending_policy;
COMMENT ON COLUMN public.financial_documents.spending_policy_override IS 'Policy for this document only; wins over supplier default (per entity) and category default.';
COMMENT ON COLUMN public.finance_entity_companies.spending_policy_default IS 'Supplier default policy for this entity (suppliers are shared; never stored on companies).';

-- Supplier default policy for the current entity (read / write).
CREATE OR REPLACE FUNCTION public.fin_supplier_policy(_company uuid)
RETURNS public.financial_spending_policy LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT spending_policy_default FROM public.finance_entity_companies
   WHERE company_id = _company AND entity_id = public.current_finance_entity()
     AND public.has_entity_access(entity_id)
$$;

CREATE OR REPLACE FUNCTION public.fin_set_supplier_policy(_company uuid, _policy public.financial_spending_policy)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e uuid := public.current_finance_entity();
BEGIN
  IF e IS NULL OR NOT public.has_entity_access(e) THEN RAISE EXCEPTION 'No finance entity access' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_psa_staff() OR public.fin_company_visible(_company)) THEN
    RAISE EXCEPTION 'Supplier not visible' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.finance_entity_companies (entity_id, company_id, linked_by, spending_policy_default)
  VALUES (e, _company, auth.uid(), _policy)
  ON CONFLICT (entity_id, company_id) DO UPDATE SET spending_policy_default = EXCLUDED.spending_policy_default;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_supplier_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_set_supplier_policy(uuid, public.financial_spending_policy) TO authenticated;

-- 5. Only categories may be chosen, never a group (checked when the reference changes)
CREATE OR REPLACE FUNCTION public.fin_guard_category_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; v_new uuid; v_old uuid; lvl text;
BEGIN
  v_new := (to_jsonb(NEW) ->> col)::uuid;
  IF v_new IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := (to_jsonb(OLD) ->> col)::uuid;
    IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
  END IF;
  SELECT level::text INTO lvl FROM public.financial_classifications WHERE id = v_new;
  IF lvl IS DISTINCT FROM 'category' THEN
    RAISE EXCEPTION 'Choose a category, not a group (%.%)', TG_TABLE_NAME, col USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_category_only_trg BEFORE INSERT OR UPDATE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fin_guard_category_only('classification_id');
CREATE TRIGGER fin_category_only_trg BEFORE INSERT OR UPDATE ON public.bank_transaction_classifications
  FOR EACH ROW EXECUTE FUNCTION public.fin_guard_category_only('classification_id');
CREATE TRIGGER fin_category_only_trg BEFORE INSERT OR UPDATE ON public.financial_document_lines
  FOR EACH ROW EXECUTE FUNCTION public.fin_guard_category_only('classification_id');
CREATE TRIGGER fin_category_only_trg BEFORE INSERT OR UPDATE ON public.bank_classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.fin_guard_category_only('classification_id');
CREATE TRIGGER fin_category_only_trg BEFORE INSERT OR UPDATE ON public.benefit_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fin_guard_category_only('classification_id');

-- 6. Benefits rule (PSA): HR benefit expenses → Pessoal category ------------
CREATE OR REPLACE FUNCTION public.fin_is_pessoal_category(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.financial_classifications c
    JOIN public.financial_classifications g ON g.id = c.parent_id
    WHERE c.id = _id AND c.level = 'category' AND g.code = 'PES'
      AND c.entity_id = '00000000-0000-4000-a000-000000000001')
$$;

CREATE OR REPLACE FUNCTION public.fin_benefit_pessoal_class(_category uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT bc.classification_id FROM public.benefit_categories bc
      WHERE bc.id = _category AND public.fin_is_pessoal_category(bc.classification_id)),
    (SELECT id FROM public.financial_classifications
      WHERE entity_id = '00000000-0000-4000-a000-000000000001' AND code = 'PES.OTHER'))
$$;

CREATE OR REPLACE FUNCTION public.benefit_categories_require_pessoal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_classifications WHERE code = 'PES'
                 AND entity_id = '00000000-0000-4000-a000-000000000001') THEN
    RETURN NEW; -- tree not installed yet
  END IF;
  IF NEW.classification_id IS NULL OR NOT public.fin_is_pessoal_category(NEW.classification_id) THEN
    RAISE EXCEPTION 'A benefit category must map to one Pessoal category' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER benefit_categories_require_pessoal_trg BEFORE INSERT OR UPDATE ON public.benefit_categories
  FOR EACH ROW EXECUTE FUNCTION public.benefit_categories_require_pessoal();

CREATE OR REPLACE FUNCTION public.benefit_expense_classify_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat uuid; v_old text; v_new text;
BEGIN
  IF NEW.origin IS DISTINCT FROM 'hr'
     OR COALESCE(NEW.entity_id, '00000000-0000-4000-a000-000000000001') <> '00000000-0000-4000-a000-000000000001'
     OR NOT EXISTS (SELECT 1 FROM public.financial_classifications WHERE code = 'PES'
                    AND entity_id = '00000000-0000-4000-a000-000000000001') THEN
    RETURN NEW;
  END IF;
  IF NEW.collaborator_id IS NULL THEN
    RAISE EXCEPTION 'Benefit expenses must be linked to the collaborator who submitted them' USING ERRCODE = '23502';
  END IF;
  v_cat := COALESCE(NEW.category_id,
    (SELECT la.category_id FROM public.benefit_category_legacy_aliases la WHERE la.legacy_enum = NEW.categoria));

  IF TG_OP = 'INSERT' OR NEW.classification_id IS NULL
     OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    NEW.classification_id := public.fin_benefit_pessoal_class(v_cat);
  ELSIF NEW.classification_id IS DISTINCT FROM OLD.classification_id THEN
    IF NOT public.fin_is_pessoal_category(NEW.classification_id) THEN
      RAISE EXCEPTION 'Benefit expenses can only use a Pessoal category' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.classification_id IS DISTINCT FROM OLD.classification_id THEN
    SELECT code INTO v_old FROM public.financial_classifications WHERE id = OLD.classification_id;
    SELECT code INTO v_new FROM public.financial_classifications WHERE id = NEW.classification_id;
    INSERT INTO public.classification_remap_log (entity_id, record_table, record_id, old_code, new_code, reason)
    VALUES ('00000000-0000-4000-a000-000000000001', 'benefit_expenses', NEW.id, v_old, v_new,
            CASE WHEN NEW.category_id IS DISTINCT FROM OLD.category_id OR OLD.classification_id IS NULL
                 THEN 'benefit_rule' ELSE 'manual' END);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.spending_policy_override IS DISTINCT FROM OLD.spending_policy_override THEN
    INSERT INTO public.classification_remap_log (entity_id, record_table, record_id, old_code, new_code, reason)
    VALUES ('00000000-0000-4000-a000-000000000001', 'benefit_expenses', NEW.id,
            'policy:' || COALESCE(OLD.spending_policy_override::text, 'default'),
            'policy:' || COALESCE(NEW.spending_policy_override::text, 'default'), 'policy_override');
  END IF;
  RETURN NEW;
END $$;
-- "zz" so it runs after the entity is filled in.
CREATE TRIGGER zz_benefit_expense_classify BEFORE INSERT OR UPDATE ON public.benefit_expenses
  FOR EACH ROW EXECUTE FUNCTION public.benefit_expense_classify_trg();

-- 7. "Por reclassificar": list and one-click accept --------------------------
CREATE OR REPLACE FUNCTION public.fin_reclass_list()
RETURNS TABLE (record_table text, record_id uuid, record_date date, amount numeric, counterparty text,
               description text, old_code text, old_name text, suggested_id uuid, suggested_code text,
               suggested_name text, suggested_group text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT public.current_finance_entity() AS id)
  SELECT 'financial_documents', d.id, d.issue_date, d.total_inc_vat,
         COALESCE(s.nome, d.counterparty_name_snapshot),
         concat_ws(' · ', d.document_number, d.notes), fc.code, fc.name_pt,
         sg.suggested_classification_id, sc.code, sc.name_pt, sgp.name_pt, sg.reason
    FROM public.financial_documents d
    JOIN e ON d.entity_id = e.id
    JOIN public.financial_classifications fc ON fc.id = d.classification_id AND fc.level <> 'category'
    LEFT JOIN public.companies s ON s.id = COALESCE(d.counterparty_supplier_id, d.counterparty_client_id)
    LEFT JOIN public.classification_reclass_suggestions sg ON sg.record_table = 'financial_documents' AND sg.record_id = d.id
    LEFT JOIN public.financial_classifications sc ON sc.id = sg.suggested_classification_id
    LEFT JOIN public.financial_classifications sgp ON sgp.id = sc.parent_id
   WHERE public.has_entity_access(e.id)
  UNION ALL
  SELECT 'bank_transaction_classifications', b.id, t.transaction_date, b.amount,
         COALESCE(s.nome, ''), concat_ws(' · ', t.description, b.notes), fc.code, fc.name_pt,
         sg.suggested_classification_id, sc.code, sc.name_pt, sgp.name_pt, sg.reason
    FROM public.bank_transaction_classifications b
    JOIN public.bank_transactions t ON t.id = b.bank_transaction_id
    JOIN e ON t.entity_id = e.id
    JOIN public.financial_classifications fc ON fc.id = b.classification_id AND fc.level <> 'category'
    LEFT JOIN public.companies s ON s.id = COALESCE(b.supplier_id, b.client_id)
    LEFT JOIN public.classification_reclass_suggestions sg ON sg.record_table = 'bank_transaction_classifications' AND sg.record_id = b.id
    LEFT JOIN public.financial_classifications sc ON sc.id = sg.suggested_classification_id
    LEFT JOIN public.financial_classifications sgp ON sgp.id = sc.parent_id
   WHERE public.has_entity_access(e.id)
$$;
GRANT EXECUTE ON FUNCTION public.fin_reclass_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_class_in_use(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.financial_documents WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.bank_transaction_classifications WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.financial_document_lines WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.financial_document_review_queue WHERE suggested_classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.bank_transactions WHERE suggested_classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.bank_classification_rules WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.benefit_categories WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.benefit_expenses WHERE classification_id = _id)
      OR EXISTS (SELECT 1 FROM public.financial_classifications WHERE parent_id = _id AND active)
$$;

CREATE OR REPLACE FUNCTION public.fin_deactivate_if_unused(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _id IS NULL THEN RETURN; END IF;
  -- Only rows of the retired tree (listed in the code map) are switched off.
  IF EXISTS (SELECT 1 FROM public.financial_classifications c
              JOIN public.finance_classification_code_map m ON m.entity_id = c.entity_id AND m.old_code = c.code
             WHERE c.id = _id)
     AND NOT public.fin_class_in_use(_id) THEN
    UPDATE public.financial_classifications SET active = false WHERE id = _id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_accept_reclass(_table text, _record uuid, _classification uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e uuid := public.current_finance_entity(); v_rec_entity uuid; v_old uuid; v_old_code text; v_new_code text;
BEGIN
  IF e IS NULL OR NOT public.has_entity_access(e) THEN RAISE EXCEPTION 'No finance entity access' USING ERRCODE = '42501'; END IF;
  SELECT code INTO v_new_code FROM public.financial_classifications
   WHERE id = _classification AND entity_id = e AND level = 'category' AND active;
  IF v_new_code IS NULL THEN RAISE EXCEPTION 'Choose an active category of this entity' USING ERRCODE = '23514'; END IF;

  IF _table = 'financial_documents' THEN
    SELECT entity_id, classification_id INTO v_rec_entity, v_old FROM public.financial_documents WHERE id = _record;
  ELSIF _table = 'bank_transaction_classifications' THEN
    SELECT t.entity_id, b.classification_id INTO v_rec_entity, v_old
      FROM public.bank_transaction_classifications b JOIN public.bank_transactions t ON t.id = b.bank_transaction_id
     WHERE b.id = _record;
  ELSE RAISE EXCEPTION 'Unknown record table %', _table; END IF;
  IF v_rec_entity IS DISTINCT FROM e THEN RAISE EXCEPTION 'Record not in this entity' USING ERRCODE = '42501'; END IF;
  SELECT code INTO v_old_code FROM public.financial_classifications WHERE id = v_old;

  IF _table = 'financial_documents' THEN
    UPDATE public.financial_documents SET classification_id = _classification WHERE id = _record;
    UPDATE public.financial_document_lines SET classification_id = _classification
     WHERE document_id = _record AND classification_id = v_old;
  ELSE
    UPDATE public.bank_transaction_classifications SET classification_id = _classification WHERE id = _record;
  END IF;
  INSERT INTO public.classification_remap_log (entity_id, record_table, record_id, old_code, new_code, reason)
  VALUES (e, _table, _record, v_old_code, v_new_code, 'reclassify');
  DELETE FROM public.classification_reclass_suggestions WHERE record_table = _table AND record_id = _record;
  PERFORM public.fin_deactivate_if_unused(v_old);
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_deactivate_if_unused(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_class_in_use(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_accept_reclass(text, uuid, uuid) TO authenticated;

-- 8. One-shot PSA tree rebuild (run once; logs every record it touches) -----
CREATE OR REPLACE FUNCTION public.fin_psa_reclassify_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  psa constant uuid := '00000000-0000-4000-a000-000000000001';
  cc_sal uuid; cc_cons uuid; cc_other uuid;
  g record; c record; s record; ref record;
  v_group uuid; v_reuse uuid; v_first record; v_srcs uuid[]; v_cc uuid;
  n int; out jsonb := '{}'::jsonb;
  reused uuid[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_classifications WHERE entity_id = psa AND code = 'PES') THEN
    RAISE EXCEPTION 'PSA tree already rebuilt';
  END IF;
  SELECT id INTO cc_sal FROM public.cost_categories WHERE entity_id = psa AND slug = 'salaries_hr';
  SELECT id INTO cc_cons FROM public.cost_categories WHERE entity_id = psa AND slug = 'consultants_suppliers';
  SELECT id INTO cc_other FROM public.cost_categories WHERE entity_id = psa AND slug = 'other_operating';

  CREATE TEMP TABLE _g (code text, pt text, en text, pol public.financial_spending_policy,
    nat public.financial_nature, cc text, profit boolean, ord int) ON COMMIT DROP;
  INSERT INTO _g VALUES
   ('PES','Pessoal','Staff','mandatory','payroll','sal',null,1),
   ('ESC','Escritório','Office','mandatory','operational','other',null,2),
   ('SRV','Serviços profissionais','Professional services','mandatory','operational','other',null,3),
   ('EQP','Software e equipamento','Software and equipment','mandatory','operational','other',null,4),
   ('DES','Deslocações e representação','Travel and representation','discretionary','operational','other',null,5),
   ('VIA','Viaturas','Vehicles','mandatory','operational','other',null,6),
   ('MKT','Marketing','Marketing','discretionary','operational','other',null,7),
   ('BAN','Banco','Bank','mandatory','operational','other',null,8),
   ('QUO','Quotas','Memberships','mandatory','operational','other',null,9),
   ('PRJ','Custos de projeto','Project costs','pass_through','project_cost','cons',null,10),
   ('PRO','Produto','Product','discretionary','project_cost','other',null,11),
   ('IMP','Impostos','Taxes','mandatory','tax','keep',null,12),
   ('REC','Receitas','Income','mandatory','income','keep',null,13),
   ('MOV','Movimentos internos','Internal movements','mandatory','transfer','keep',false,14);

  CREATE TEMP TABLE _c (g text, code text, pt text, en text, src text[], ord int) ON COMMIT DROP;
  INSERT INTO _c VALUES
   ('PES','PES.SAL','Salários','Salaries','{HR.SAL.LIQUIDO,HR}',1),
   ('PES','PES.TSU','Segurança Social (TSU)','Social Security (TSU)','{HR.SAL.SOCIALSECURITY,TAX.SS.EMPLOYER,HR.SAL.IRS1}',2),
   ('PES','PES.FOOD','Subsídio de alimentação','Meal allowance','{BEN.FOOD}',3),
   ('PES','PES.HEALTH','Seguro de saúde','Health insurance','{BEN.HEALTH}',4),
   ('PES','PES.PERS','Despesas pessoais','Personal expenses','{BEN.PERS}',5),
   ('PES','PES.OTHER','Outros benefícios e eventos internos','Other benefits and internal events','{BEN.OTHER,OPS.OFFICE.XMAS,OPS.OFFICE.EVENTS}',6),
   ('ESC','ESC.RENT','Renda','Rent','{OPS.OFFICE.RENT}',1),
   ('ESC','ESC.CONDO','Condomínio','Condominium fees','{OPS.OFFICE.CONDO}',2),
   ('ESC','ESC.POWER','Eletricidade','Electricity','{OPS.UTIL.POWER}',3),
   ('ESC','ESC.WATER','Água','Water','{OPS.UTIL.WATER,OPS.OFFICE.WATER_POT}',4),
   ('ESC','ESC.TELCO','Internet e telefones','Internet and phones','{OPS.COM.INTERNET,OPS.COM.FIXED,OPS.COM.MOBILE}',5),
   ('ESC','ESC.CLEAN','Limpeza','Cleaning','{OPS.OFFICE.CLEAN}',6),
   ('ESC','ESC.SUPPLIES','Material, correios e mercearia','Supplies, postage and groceries','{OPS.OFFICE.SUPPLIES,OPS.OFFICE.GROCERY,OPS.OFFICE.POST,OPS.OFFICE.DIY,OPS.OFFICE.MISC}',7),
   ('ESC','ESC.REPAIRS','Manutenção e reparações','Maintenance and repairs','{OPS.OFFICE.REPAIRS,OPS.OFFICE.IT,OPS.OFFICE.COPIER,OPS.EQP.HVAC,OPS.EQP.FIRE}',8),
   ('ESC','ESC.INSUR','Seguros','Insurance','{OPS.OFFICE.INSUR_LIAB}',9),
   ('SRV','SRV.ACCT','Contabilidade','Accounting','{OPS.OFFICE.ACCT}',1),
   ('SRV','SRV.LEGAL','Jurídico','Legal','{OPS.OFFICE.LEGAL}',2),
   ('SRV','SRV.CERT','Certificações','Certifications','{OPS.OFFICE.CERT}',3),
   ('EQP','EQP.SW','Software e subscrições','Software and subscriptions','{OPS.EQP.SW,OPS.EQP.MEDIA}',1),
   ('EQP','EQP.HW','Computadores e hardware','Computers and hardware','{OPS.EQP.HW,OPS.EQP.COMPUTERS,OPS.EQP.ACC}',2),
   ('EQP','EQP.MISC','Equipamento diverso','Other equipment','{OPS.EQP.MISC,OPS.EQP.PHOTO}',3),
   ('DES','DES.MEALS','Refeições','Meals','{OPS.REP.MEALS}',1),
   ('DES','DES.HOTEL','Hotéis','Hotels','{OPS.REP.HOTEL}',2),
   ('DES','DES.TRAVEL','Avião e comboio','Flights and trains','{OPS.REP.AIR,OPS.REP.TRAIN,OPS.REP.TRAVEL,OPS.REP.MISC}',3),
   ('DES','DES.TAXI','Táxi','Taxi','{OPS.REP.TAXI}',4),
   ('DES','DES.TOLL','Portagens e estacionamento','Tolls and parking','{OPS.REP.TOLL,OPS.REP.PARK}',5),
   ('DES','DES.FUEL','Combustível','Fuel','{OPS.AUTO.FUEL}',6),
   ('VIA','VIA.INSUR','Seguro','Insurance','{OPS.AUTO.INSUR}',1),
   ('VIA','VIA.TAX','Imposto (selo)','Vehicle tax','{OPS.AUTO.TAX}',2),
   ('VIA','VIA.SERVICE','Revisões e reparações','Servicing and repairs','{OPS.AUTO.SERVICE,OPS.AUTO.REPAIRS,OPS.AUTO.MISC}',3),
   ('VIA','VIA.FINES','Multas','Fines','{OPS.AUTO.FINES}',4),
   ('MKT','MKT.PHOTO','Foto e vídeo','Photo and video','{OPS.MKT.PHOTO}',1),
   ('MKT','MKT.SOCIAL','Redes sociais','Social media','{OPS.MKT.SOCIAL}',2),
   ('MKT','MKT.WEB','Website e marca','Website and brand','{OPS.MKT.WEB,OPS.MKT.BRAND}',3),
   ('MKT','MKT.AWARDS','Prémios','Awards','{OPS.MKT.AWARDS}',4),
   ('BAN','BAN.FEES','Comissões e anuidades','Fees and annual charges','{OPS.BANK.COMM,OPS.BANK,OPS.BANK.INTL,OPS.BANK.CARD_FEE}',1),
   ('BAN','BAN.STAMP','Imposto de selo','Stamp duty','{OPS.BANK.STAMP}',2),
   ('QUO','QUO.ORDERS','Ordens e associações','Professional bodies and associations','{OPS.SUB.LUSO_ZA,OPS.SUB.UK,OPS.SUB}',1),
   ('PRJ','PRJ.FL','Freelancers','Freelancers','{PC.FL}',1),
   ('PRJ','PRJ.ENG','Engenharia e consultores','Engineering and consultants','{PC.ENG}',2),
   ('PRO','PRO.MAT','Materiais e protótipos','Materials and prototypes','{PRD.CERAMIC,PRD.FURNITURE,PRD.HARDWARE,PRD.INTERIOR_WORKS,PRD.PROTOTYPES}',1),
   ('IMP','IMP.IRC','IRC','Corporate tax (IRC)','{TAX.IRC}',1),
   ('IMP','IMP.IVA','IVA','VAT','{TAX.IVA}',2),
   ('IMP','IMP.IRS','Retenção IRS','IRS withholding','{TAX.IRS,HR.SAL.IRS}',3),
   ('IMP','IMP.SS','SS do trabalhador','Employee social security','{TAX.SS.EMPLOYEE}',4),
   ('REC','REC.FEES','Honorários','Fees','{INC.FEES}',1),
   ('REC','REC.REFUND','Reembolsos','Refunds','{INC.REFUND}',2),
   ('REC','REC.OTHER','Outras receitas','Other income','{INC.OTHER}',3),
   ('MOV','MOV.INTERNAL','Entre contas','Between accounts','{TRF.INTERNAL}',1),
   ('MOV','MOV.OWNER','Sócio','Partner','{TRF.OWNER}',2),
   ('MOV','MOV.REIM','A reembolsar a colaborador','To reimburse a collaborator','{REIM.GENERIC,REIM}',3),
   ('MOV','MOV.PENDING','Por identificar','Unidentified','{TRF.PENDING,TRF}',4);

  CREATE TEMP TABLE _refs (tbl text, col text) ON COMMIT DROP;
  INSERT INTO _refs VALUES
   ('financial_documents','classification_id'),
   ('bank_transaction_classifications','classification_id'),
   ('benefit_expenses','classification_id'),
   ('financial_document_lines','classification_id'),
   ('financial_document_review_queue','suggested_classification_id'),
   ('bank_transactions','suggested_classification_id'),
   ('bank_classification_rules','classification_id'),
   ('benefit_categories','classification_id');

  FOR g IN SELECT * FROM _g ORDER BY ord LOOP
    SELECT fc.* INTO v_first FROM _c JOIN public.financial_classifications fc
      ON fc.entity_id = psa AND fc.code = _c.src[1] WHERE _c.g = g.code ORDER BY _c.ord LIMIT 1;
    v_cc := CASE g.cc WHEN 'sal' THEN cc_sal WHEN 'cons' THEN cc_cons WHEN 'other' THEN cc_other ELSE v_first.cost_category_id END;
    INSERT INTO public.financial_classifications (entity_id, code, name_pt, name_en, parent_id, level,
      financial_nature, spending_policy, affects_profit, affects_cash_flow, cost_category_id, sort_order, active)
    VALUES (psa, g.code, g.pt, g.en, null, 'group', g.nat, g.pol,
      COALESCE(g.profit, v_first.affects_profit, true), COALESCE(v_first.affects_cash_flow, true), v_cc, g.ord * 100, true)
    RETURNING id INTO v_group;

    FOR c IN SELECT * FROM _c WHERE _c.g = g.code ORDER BY ord LOOP
      SELECT array_agg(fc.id ORDER BY array_position(c.src, fc.code)) INTO v_srcs
        FROM public.financial_classifications fc WHERE fc.entity_id = psa AND fc.code = ANY (c.src);
      v_reuse := NULL;
      SELECT fc.id INTO v_reuse FROM public.financial_classifications fc
       WHERE fc.entity_id = psa AND fc.code = ANY (c.src) AND fc.level = 'category'
       ORDER BY array_position(c.src, fc.code) LIMIT 1;

      IF v_reuse IS NULL THEN
        INSERT INTO public.financial_classifications (entity_id, code, name_pt, name_en, parent_id, level,
          financial_nature, spending_policy, affects_profit, affects_cash_flow, cost_category_id, sort_order, active)
        SELECT psa, c.code, c.pt, c.en, v_group, 'category', g.nat, g.pol, affects_profit, affects_cash_flow,
               cost_category_id, g.ord * 100 + c.ord, true
          FROM public.financial_classifications WHERE id = v_group
        RETURNING id INTO v_reuse;
      END IF;

      FOR s IN SELECT id, code FROM public.financial_classifications WHERE id = ANY (COALESCE(v_srcs, '{}')) LOOP
        INSERT INTO public.finance_classification_code_map (entity_id, old_code, new_code)
        VALUES (psa, s.code, c.code) ON CONFLICT DO NOTHING;
        FOR ref IN SELECT * FROM _refs LOOP
          EXECUTE format(
            'INSERT INTO public.classification_remap_log (entity_id, record_table, record_id, old_code, new_code, reason)
             SELECT %L, %L, id, %L, %L, %L FROM public.%I WHERE %I = %L',
            psa, ref.tbl, s.code, c.code, 'tree_2026', ref.tbl, ref.col, s.id);
          IF s.id <> v_reuse THEN
            EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I = %L', ref.tbl, ref.col, v_reuse, ref.col, s.id);
          END IF;
        END LOOP;
      END LOOP;

      v_cc := CASE g.cc WHEN 'sal' THEN cc_sal WHEN 'cons' THEN cc_cons WHEN 'other' THEN cc_other ELSE NULL END;
      UPDATE public.financial_classifications
         SET code = c.code, name_pt = c.pt, name_en = c.en, parent_id = v_group, level = 'category',
             spending_policy = g.pol, financial_nature = g.nat,
             cost_category_id = CASE WHEN g.cc = 'keep' THEN cost_category_id ELSE v_cc END,
             sort_order = g.ord * 100 + c.ord, active = true
       WHERE id = v_reuse;
      reused := reused || v_reuse;
    END LOOP;
  END LOOP;

  UPDATE public.financial_document_review_queue q SET suggested_classification_code = fc.code
    FROM public.financial_classifications fc
   WHERE q.entity_id = psa AND fc.id = q.suggested_classification_id AND q.suggested_classification_code IS DISTINCT FROM fc.code;
  UPDATE public.financial_document_review_queue q SET suggested_classification_code = m.new_code
    FROM public.finance_classification_code_map m
   WHERE q.entity_id = psa AND m.entity_id = psa AND q.suggested_classification_id IS NULL
     AND q.suggested_classification_code = m.old_code AND m.new_code IS NOT NULL;

  INSERT INTO public.finance_classification_code_map (entity_id, old_code, new_code)
  SELECT psa, fc.code, null FROM public.financial_classifications fc
   WHERE fc.entity_id = psa AND fc.level <> 'category' AND fc.code NOT LIKE 'legacy.%'
     AND NOT (fc.id = ANY (reused)) AND fc.code NOT IN (SELECT code FROM _g)
  ON CONFLICT DO NOTHING;

  UPDATE public.financial_classifications fc SET active = false
   WHERE fc.entity_id = psa AND fc.code NOT LIKE 'legacy.%'
     AND NOT (fc.id = ANY (reused)) AND fc.code NOT IN (SELECT code FROM _g)
     AND fc.level = 'category' AND fc.active AND NOT public.fin_class_in_use(fc.id);
  UPDATE public.financial_classifications fc SET active = false
   WHERE fc.entity_id = psa AND fc.code NOT LIKE 'legacy.%'
     AND NOT (fc.id = ANY (reused)) AND fc.code NOT IN (SELECT code FROM _g)
     AND fc.level = 'subgroup' AND fc.active AND NOT public.fin_class_in_use(fc.id);
  UPDATE public.financial_classifications fc SET active = false
   WHERE fc.entity_id = psa AND fc.code NOT LIKE 'legacy.%'
     AND NOT (fc.id = ANY (reused)) AND fc.code NOT IN (SELECT code FROM _g)
     AND fc.level = 'group' AND fc.active AND NOT public.fin_class_in_use(fc.id);

  UPDATE public.benefit_expenses SET classification_id = NULL
   WHERE origin = 'hr' AND entity_id = psa AND classification_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  out := jsonb_build_object('reused', array_length(reused, 1), 'hr_benefits_touched', n);
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_psa_reclassify_v1() FROM PUBLIC, anon, authenticated;
