CREATE OR REPLACE FUNCTION public.fin_withholding_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_id IS NULL AND NEW.financial_document_id IS NOT NULL THEN
    NEW.entity_id := public.fin_entity_of('financial_documents', NEW.financial_document_id);
  END IF;
  RETURN NEW;
END $$;