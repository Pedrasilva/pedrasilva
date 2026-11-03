CREATE OR REPLACE FUNCTION public.pm_incoming_date_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_changed boolean; v_resolved jsonb;
BEGIN
 v_changed:=(to_jsonb(NEW)-ARRAY['updated_at','billing_status']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','billing_status']);
 IF OLD.dates_frozen_at IS NOT NULL OR OLD.billing_status::text IN ('issued','paid','cancelled') THEN
 IF (to_jsonb(NEW)->'stage_id',NEW.trigger_type,NEW.expected_invoice_date,NEW.expected_payment_date,NEW.planned_invoice_date_override,NEW.planned_payment_date_override,NEW.appointment_date,NEW.timing_month_index,NEW.frozen_invoice_date,NEW.frozen_payment_date,NEW.dates_frozen_at)
 IS DISTINCT FROM (to_jsonb(OLD)->'stage_id',OLD.trigger_type,OLD.expected_invoice_date,OLD.expected_payment_date,OLD.planned_invoice_date_override,OLD.planned_payment_date_override,OLD.appointment_date,OLD.timing_month_index,OLD.frozen_invoice_date,OLD.frozen_payment_date,OLD.dates_frozen_at)
 THEN RAISE EXCEPTION 'Issued or paid payment dates are frozen'; END IF;
 END IF;
 IF (NEW.planned_invoice_date_override,NEW.planned_payment_date_override,NEW.appointment_date,NEW.timing_month_index,NEW.contract_baseline_payment_id,NEW.timing_evidence)
 IS DISTINCT FROM (OLD.planned_invoice_date_override,OLD.planned_payment_date_override,OLD.appointment_date,OLD.timing_month_index,OLD.contract_baseline_payment_id,OLD.timing_evidence)
 AND coalesce(current_setting('pm.payment_date_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Use the audited payment date action' USING ERRCODE='42501'; END IF;
 IF coalesce(current_setting('pm.payment_date_action',true),'')='yes' THEN
 IF (to_jsonb(NEW)-ARRAY['planned_invoice_date_override','planned_payment_date_override','trigger_type','stage_id','timing_month_index','appointment_date','timing_evidence','date_override_by','date_override_at','updated_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['planned_invoice_date_override','planned_payment_date_override','trigger_type','stage_id','timing_month_index','appointment_date','timing_evidence','date_override_by','date_override_at','updated_at'])
 THEN RAISE EXCEPTION 'Only payment dates and stage links may be edited' USING ERRCODE='42501'; END IF;
 END IF;
 IF OLD.dates_frozen_at IS NULL AND OLD.billing_status::text NOT IN ('issued','paid','cancelled') AND NEW.billing_status::text IN ('issued','paid') THEN
 v_resolved:=public.pm_incoming_resolve(OLD.id);
 NEW.frozen_invoice_date:=(v_resolved->>'planned_invoice_date')::date;
 NEW.frozen_payment_date:=(v_resolved->>'planned_payment_date')::date;
 NEW.dates_frozen_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a1_pm_incoming_date_guard BEFORE UPDATE ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_incoming_date_guard();
CREATE OR REPLACE FUNCTION public.pm_incoming_document_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item uuid; v_doc public.financial_documents; v_resolved jsonb;
BEGIN
 IF TG_TABLE_NAME='financial_document_lines' THEN SELECT * INTO v_doc FROM public.financial_documents WHERE id=NEW.document_id;
 ELSE v_doc:=NEW; END IF;
 IF v_doc.direction::text<>'issued' OR v_doc.status::text IN ('draft','cancelled') THEN RETURN NEW; END IF;
 FOR v_item IN SELECT DISTINCT l.payment_schedule_item_id FROM public.financial_document_lines l
 WHERE l.document_id=v_doc.id AND l.payment_schedule_item_id IS NOT NULL LOOP
 PERFORM 1 FROM public.pm_payment_schedule_items WHERE id=v_item FOR UPDATE;
 v_resolved:=public.pm_incoming_resolve(v_item);
 UPDATE public.pm_payment_schedule_items SET frozen_invoice_date=(v_resolved->>'planned_invoice_date')::date,
 frozen_payment_date=(v_resolved->>'planned_payment_date')::date,dates_frozen_at=now(),dates_frozen_document_id=v_doc.id
 WHERE id=v_item AND dates_frozen_at IS NULL AND billing_status::text NOT IN ('issued','paid','cancelled');
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_pm_incoming_line_freeze AFTER INSERT OR UPDATE OF payment_schedule_item_id ON public.financial_document_lines FOR EACH ROW EXECUTE FUNCTION public.pm_incoming_document_freeze();
CREATE TRIGGER zz_pm_incoming_document_freeze AFTER INSERT OR UPDATE OF status ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.pm_incoming_document_freeze();
COMMENT ON FUNCTION public.pm_incoming_resolve(uuid) IS 'Service-internal read-only live timing resolver; only guarded public wrappers may return its financial values.';
COMMENT ON COLUMN public.pm_payment_schedule_items.timing_evidence IS 'Date-action and immutable accepted-snapshot provenance; never a commercial manual_override.';