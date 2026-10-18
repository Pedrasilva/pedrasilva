CREATE OR REPLACE FUNCTION public.pm_invoice_conversion_reset() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Rows copied from a proposal arrive with live (real) dates already mapped; grouping restarts from them.
  IF NEW.source_quote_payment_item_id IS NOT NULL AND COALESCE(NEW.billing_status::text,'planned') = 'planned' THEN
    NEW.invoice_group_id := NULL;
    NEW.original_invoice_date := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pm_invoice_conversion_reset_trg ON public.pm_payment_schedule_items;
CREATE TRIGGER pm_invoice_conversion_reset_trg BEFORE INSERT ON public.pm_payment_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.pm_invoice_conversion_reset();