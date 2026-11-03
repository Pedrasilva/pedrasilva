CREATE OR REPLACE FUNCTION public.pm_payment_dates_audited_boundary()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 IF NEW.planned_invoice_date_override IS NOT NULL OR NEW.planned_payment_date_override IS NOT NULL OR NEW.contract_baseline_payment_id IS NOT NULL OR NEW.timing_evidence IS NOT NULL OR NEW.dates_frozen_at IS NOT NULL THEN
 RAISE EXCEPTION 'Use the audited payment date action' USING ERRCODE='42501'; END IF;
 RETURN NEW;
 END IF;
 IF NEW.direction='inflow' AND (NEW.stage_id,NEW.trigger_type,NEW.expected_invoice_date,NEW.expected_payment_date)
 IS DISTINCT FROM (OLD.stage_id,OLD.trigger_type,OLD.expected_invoice_date,OLD.expected_payment_date)
 AND coalesce(current_setting('pm.payment_date_action',true),'')<>'yes' THEN
 RAISE EXCEPTION 'Use the audited payment date action' USING ERRCODE='42501'; END IF;
 IF (NEW.planned_invoice_date_override IS NOT NULL AND NEW.planned_invoice_date_override<DATE '2010-01-01') OR
 (NEW.planned_payment_date_override IS NOT NULL AND NEW.planned_payment_date_override<DATE '2010-01-01') OR
 (NEW.appointment_date IS NOT NULL AND NEW.appointment_date<DATE '2010-01-01') THEN RAISE EXCEPTION 'Placeholder dates cannot be used'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_pm_payment_dates_audited_boundary BEFORE INSERT OR UPDATE ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_payment_dates_audited_boundary();