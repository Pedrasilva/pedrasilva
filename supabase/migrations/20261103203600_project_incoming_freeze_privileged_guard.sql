CREATE OR REPLACE FUNCTION public.pm_incoming_date_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_resolved jsonb;
BEGIN
 IF OLD.dates_frozen_at IS NOT NULL OR OLD.billing_status::text IN ('issued','paid','cancelled') THEN
 IF (NEW.stage_id,NEW.trigger_type,NEW.expected_invoice_date,NEW.expected_payment_date,NEW.planned_invoice_date_override,NEW.planned_payment_date_override,NEW.appointment_date,NEW.timing_month_index,NEW.frozen_invoice_date,NEW.frozen_payment_date,NEW.dates_frozen_at)
 IS DISTINCT FROM (OLD.stage_id,OLD.trigger_type,OLD.expected_invoice_date,OLD.expected_payment_date,OLD.planned_invoice_date_override,OLD.planned_payment_date_override,OLD.appointment_date,OLD.timing_month_index,OLD.frozen_invoice_date,OLD.frozen_payment_date,OLD.dates_frozen_at)
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
REVOKE ALL ON FUNCTION public.pm_incoming_date_guard(),public.pm_incoming_document_freeze() FROM PUBLIC,anon,authenticated;