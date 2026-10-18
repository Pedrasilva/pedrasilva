ALTER TABLE public.fee_proposals ADD COLUMN invoice_grouping_enabled boolean NOT NULL DEFAULT false, ADD COLUMN invoice_grouping_days integer NOT NULL DEFAULT 7 CHECK (invoice_grouping_days BETWEEN 0 AND 60);
ALTER TABLE public.fee_proposals ALTER COLUMN invoice_grouping_enabled SET DEFAULT true;
ALTER TABLE public.pm_projects ADD COLUMN invoice_grouping_enabled boolean, ADD COLUMN invoice_grouping_days integer NOT NULL DEFAULT 7 CHECK (invoice_grouping_days BETWEEN 0 AND 60);
UPDATE public.pm_projects SET invoice_grouping_enabled=false;
COMMENT ON COLUMN public.pm_projects.invoice_grouping_enabled IS 'NULL = inherit from the converted proposal on first regroup';
ALTER TABLE public.quote_payment_schedule_items ADD COLUMN original_invoice_date date;
ALTER TABLE public.pm_payment_schedule_items ADD COLUMN original_invoice_date date;

-- Groups planned outgoing-to-client invoices within N calendar days of the first one in each group
-- (same payment terms and VAT; "Pronto pagamento" never groups). Amounts never change.
CREATE OR REPLACE FUNCTION public.pm_invoice_regroup(_tbl text,_scope uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE col text; enabled boolean; days integer; r record; k text:=NULL; gstart date; ids uuid[]:='{}'; bases date[]:='{}'; curs date[]:='{}'; gids uuid[]:='{}'; prev text;
BEGIN
  IF _tbl='quote_payment_schedule_items' THEN col:='quote_id'; SELECT invoice_grouping_enabled,invoice_grouping_days INTO enabled,days FROM fee_proposals WHERE id=_scope;
  ELSIF _tbl='pm_payment_schedule_items' THEN col:='project_id'; SELECT invoice_grouping_enabled,invoice_grouping_days INTO enabled,days FROM pm_projects WHERE id=_scope;
    IF enabled IS NULL THEN
      SELECT f.invoice_grouping_enabled,f.invoice_grouping_days INTO enabled,days FROM fee_proposals f WHERE f.pm_project_id=_scope OR f.id IN (SELECT q.quote_id FROM quote_payment_schedule_items q JOIN pm_payment_schedule_items p ON p.source_quote_payment_item_id=q.id WHERE p.project_id=_scope) ORDER BY f.updated_at DESC LIMIT 1;
      enabled:=coalesce(enabled,false); days:=coalesce(days,7);
      UPDATE pm_projects SET invoice_grouping_enabled=enabled,invoice_grouping_days=days WHERE id=_scope;
    END IF;
  ELSE RAISE EXCEPTION 'invalid table'; END IF;
  IF enabled IS NULL THEN RETURN; END IF;
  prev:=current_setting('pm.invoice_regroup',true);
  PERFORM set_config('pm.invoice_regroup','on',true);
  FOR r IN EXECUTE format($q$SELECT id, coalesce(original_invoice_date,expected_invoice_date) base, expected_invoice_date cur, invoice_group_id gid,
      coalesce(payment_terms,'')||'|'||coalesce(vat_rate::text,'') k
    FROM %I WHERE %I=$1 AND coalesce(direction,'inflow')='inflow' AND billing_status='planned' AND expected_invoice_date IS NOT NULL
      AND coalesce(payment_terms,'') !~* '^\s*pronto'
    ORDER BY 5, 2, sort_order NULLS LAST, id$q$,_tbl,col) USING _scope LOOP
    IF k IS NOT NULL AND (r.k<>k OR r.base>gstart+days) THEN
      PERFORM public.pm_invoice_apply_group(_tbl,ids,bases,curs,gids,enabled);
      ids:='{}'; bases:='{}'; curs:='{}'; gids:='{}';
    END IF;
    IF array_length(ids,1) IS NULL THEN gstart:=r.base; k:=r.k; END IF;
    ids:=ids||r.id; bases:=bases||r.base; curs:=curs||r.cur; gids:=gids||r.gid;
  END LOOP;
  IF array_length(ids,1) IS NOT NULL THEN PERFORM public.pm_invoice_apply_group(_tbl,ids,bases,curs,gids,enabled); END IF;
  PERFORM set_config('pm.invoice_regroup',coalesce(prev,''),true);
END $$;

CREATE OR REPLACE FUNCTION public.pm_invoice_apply_group(_tbl text,_ids uuid[],_bases date[],_curs date[],_gids uuid[],_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target date; gid uuid; i integer;
BEGIN
  IF _enabled AND array_length(_ids,1)>=2 THEN
    SELECT max(b) INTO target FROM unnest(_bases) b;
    SELECT g INTO gid FROM unnest(_gids) g WHERE g IS NOT NULL LIMIT 1;
    gid:=coalesce(gid,gen_random_uuid());
    FOR i IN 1..array_length(_ids,1) LOOP
      EXECUTE format('UPDATE %I SET expected_invoice_date=$1, expected_payment_date=CASE WHEN expected_payment_date IS NULL THEN NULL ELSE expected_payment_date+($1-$2) END, original_invoice_date=$3, invoice_group_id=$4 WHERE id=$5 AND (expected_invoice_date IS DISTINCT FROM $1 OR original_invoice_date IS DISTINCT FROM $3 OR invoice_group_id IS DISTINCT FROM $4)',_tbl)
        USING target,_curs[i],_bases[i],gid,_ids[i];
    END LOOP;
  ELSE
    FOR i IN 1..array_length(_ids,1) LOOP
      EXECUTE format('UPDATE %I SET expected_invoice_date=$1, expected_payment_date=CASE WHEN expected_payment_date IS NULL THEN NULL ELSE expected_payment_date+($1-$2) END, original_invoice_date=NULL, invoice_group_id=NULL WHERE id=$3 AND original_invoice_date IS NOT NULL',_tbl)
        USING _bases[i],_curs[i],_ids[i];
    END LOOP;
  END IF;
END $$;

-- A person's own date edit becomes the new base date for that line.
CREATE OR REPLACE FUNCTION public.pm_invoice_user_date_edit() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF coalesce(current_setting('pm.invoice_regroup',true),'')<>'on' AND NEW.expected_invoice_date IS DISTINCT FROM OLD.expected_invoice_date THEN NEW.original_invoice_date:=NULL; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.pm_invoice_regroup_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid;
BEGIN
  IF coalesce(current_setting('pm.invoice_regroup',true),'')='on' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='quote_payment_schedule_items' THEN s:=CASE WHEN TG_OP='DELETE' THEN OLD.quote_id ELSE NEW.quote_id END;
  ELSE s:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END; END IF;
  IF s IS NOT NULL THEN PERFORM public.pm_invoice_regroup(TG_TABLE_NAME,s); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.pm_invoice_regroup_parent_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='fee_proposals' THEN PERFORM public.pm_invoice_regroup('quote_payment_schedule_items',NEW.id);
  ELSE PERFORM public.pm_invoice_regroup('pm_payment_schedule_items',NEW.id); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER quote_payment_invoice_date_edit BEFORE UPDATE OF expected_invoice_date ON public.quote_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_user_date_edit();
CREATE TRIGGER pm_payment_invoice_date_edit BEFORE UPDATE OF expected_invoice_date ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_user_date_edit();
CREATE TRIGGER quote_payment_invoice_regroup AFTER INSERT OR DELETE OR UPDATE OF expected_invoice_date,payment_terms,vat_rate,billing_status,direction ON public.quote_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_regroup_trg();
CREATE TRIGGER pm_payment_invoice_regroup AFTER INSERT OR DELETE OR UPDATE OF expected_invoice_date,payment_terms,vat_rate,billing_status,direction ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_regroup_trg();
CREATE TRIGGER fee_proposals_invoice_grouping AFTER UPDATE OF invoice_grouping_enabled,invoice_grouping_days ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_regroup_parent_trg();
CREATE TRIGGER pm_projects_invoice_grouping AFTER UPDATE OF invoice_grouping_enabled,invoice_grouping_days ON public.pm_projects FOR EACH ROW WHEN (NEW.invoice_grouping_enabled IS NOT NULL) EXECUTE FUNCTION public.pm_invoice_regroup_parent_trg();

REVOKE ALL ON FUNCTION public.pm_invoice_regroup(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_invoice_apply_group(text,uuid[],date[],date[],uuid[],boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_invoice_regroup_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_invoice_regroup_parent_trg() FROM PUBLIC, anon, authenticated;
