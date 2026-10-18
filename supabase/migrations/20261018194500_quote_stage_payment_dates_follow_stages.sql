CREATE OR REPLACE FUNCTION public.pm_quote_stage_payment_dates_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qid uuid := NEW.quote_id; pstart date;
BEGIN
  IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN RETURN NEW; END IF;
  -- Only proposals not yet linked to a live project; planned, stage-driven invoices follow their stage dates.
  IF EXISTS (SELECT 1 FROM fee_proposals WHERE id = qid AND pm_project_id IS NOT NULL) THEN RETURN NEW; END IF;
  SELECT min(start_date) INTO pstart FROM quote_stages WHERE quote_id = qid;
  UPDATE quote_payment_schedule_items i SET
      expected_invoice_date = d.nd,
      expected_payment_date = CASE WHEN i.expected_payment_date IS NULL THEN NULL
        ELSE d.nd + coalesce(i.payment_offset_days, i.expected_payment_date - i.expected_invoice_date, 0) END
    FROM (SELECT x.id, CASE x.trigger_type::text WHEN 'stage_start' THEN s.start_date WHEN 'stage_end' THEN s.end_date ELSE pstart END nd
          FROM quote_payment_schedule_items x LEFT JOIN quote_stages s ON s.id = x.stage_id
          WHERE x.quote_id = qid AND x.trigger_type::text IN ('stage_start','stage_end','project_start')) d
   WHERE i.id = d.id AND coalesce(i.billing_status::text,'planned') = 'planned' AND NOT coalesce(i.manual_override,false)
     AND d.nd IS NOT NULL AND i.expected_invoice_date IS DISTINCT FROM d.nd;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quote_stage_payment_dates ON public.quote_stages;
CREATE TRIGGER quote_stage_payment_dates AFTER UPDATE OF start_date, end_date ON public.quote_stages
  FOR EACH ROW EXECUTE FUNCTION public.pm_quote_stage_payment_dates_trg();
REVOKE ALL ON FUNCTION public.pm_quote_stage_payment_dates_trg() FROM PUBLIC, anon, authenticated;