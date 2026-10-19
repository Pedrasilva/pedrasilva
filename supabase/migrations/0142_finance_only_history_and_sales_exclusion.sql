ALTER TABLE public.pm_projects ADD COLUMN finance_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.financial_documents ADD COLUMN sales_excluded boolean NOT NULL DEFAULT false;
ALTER TABLE public.financial_documents ADD COLUMN sales_exclusion_reason text;
ALTER TABLE public.financial_documents ADD COLUMN shareholder_debt_id uuid REFERENCES public.financial_debts(id);
COMMENT ON COLUMN public.pm_projects.finance_only IS 'Closed historical document container: no quote numbering, operational stages or planning.';
COMMENT ON COLUMN public.financial_documents.sales_excluded IS 'Retain documents and bank-backed payments outside sales; shareholder_debt_id links financing liability.';
CREATE FUNCTION public.pm_finance_only_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.finance_only AND (NEW.status<>'archived' OR NEW.quote_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.sold_at IS NOT NULL) THEN RAISE EXCEPTION 'Historical finance-only projects must remain archived without a quote or opportunity' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.finance_only AND NOT OLD.finance_only AND EXISTS(SELECT 1 FROM public.pm_stages WHERE project_id=NEW.id) THEN RAISE EXCEPTION 'Operational history cannot become a finance-only container' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pm_finance_only_guard BEFORE INSERT OR UPDATE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.pm_finance_only_guard();
CREATE FUNCTION public.pm_finance_only_child_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pm_projects WHERE id=NEW.project_id AND finance_only) THEN RAISE EXCEPTION 'Historical finance-only projects cannot receive operational stages' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pm_finance_only_stage_guard BEFORE INSERT OR UPDATE OF project_id ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_finance_only_child_guard();
CREATE FUNCTION public.pm_finance_only_quote_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pm_projects WHERE id=NEW.pm_project_id AND finance_only) THEN RAISE EXCEPTION 'Historical finance-only projects cannot consume proposal numbers' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pm_finance_only_quote_guard BEFORE INSERT OR UPDATE OF pm_project_id ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.pm_finance_only_quote_guard();
CREATE FUNCTION public.fin_sales_exclusion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.shareholder_debt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.financial_debts WHERE id=NEW.shareholder_debt_id AND entity_id=NEW.entity_id) THEN RAISE EXCEPTION 'Shareholder loan must belong to the same entity' USING ERRCODE='23514'; END IF;
 IF NEW.shareholder_debt_id IS NOT NULL AND NOT NEW.sales_excluded THEN RAISE EXCEPTION 'Shareholder loans are not sales' USING ERRCODE='23514'; END IF;
 IF NEW.sales_excluded AND nullif(btrim(NEW.sales_exclusion_reason),'') IS NULL THEN RAISE EXCEPTION 'Sales exclusion requires an audit reason' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fin_sales_exclusion_guard BEFORE INSERT OR UPDATE OF sales_excluded,sales_exclusion_reason,shareholder_debt_id,entity_id ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fin_sales_exclusion_guard();
REVOKE ALL ON FUNCTION public.pm_finance_only_guard(),public.pm_finance_only_child_guard(),public.pm_finance_only_quote_guard(),public.fin_sales_exclusion_guard() FROM PUBLIC,anon,authenticated;
