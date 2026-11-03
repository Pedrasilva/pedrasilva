ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS stage_role text;
ALTER TABLE public.pm_stages ADD CONSTRAINT pm_stages_stage_role_check CHECK (stage_role IS NULL OR stage_role IN ('architecture','client','supplier_group','supplier_phase'));
COMMENT ON COLUMN public.pm_stages.stage_role IS 'Operational scheduling role. NULL legacy converted rows resolve through the immutable accepted snapshot, never the mutable proposal.';

CREATE OR REPLACE FUNCTION public.pm_stage_role_at_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
 IF NEW.stage_role IS NULL AND NEW.source_quote_stage_id IS NOT NULL THEN
  SELECT item->>'stage_role' INTO v_role FROM public.pm_projects p JOIN public.fee_proposals q ON q.id=p.quote_id JOIN public.psa_proposal_snapshots snap ON snap.id=q.accepted_snapshot_id
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot#>'{quote_data,raw,quote_stages}','[]'::jsonb)) item
  WHERE p.id=NEW.project_id AND item->>'id'=NEW.source_quote_stage_id::text;
  IF v_role IN ('architecture','client','supplier_group','supplier_phase') THEN NEW.stage_role:=v_role; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pm_stage_role_at_insert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pm_stage_role_insert BEFORE INSERT ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_stage_role_at_insert();

CREATE OR REPLACE FUNCTION public.pm_project_stage_roles(_project_id uuid) RETURNS TABLE(stage_id uuid,stage_role text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'projects.all') OR public.has_permission(auth.uid(),'projects.financials') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_module_permission(auth.uid(),'projects.view','all') OR (public.has_module_permission(auth.uid(),'projects.view','assigned') AND public.pm_has_assigned_access(auth.uid(),_project_id))) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT st.id, coalesce(st.stage_role, CASE WHEN count(item)=1 THEN min(item->>'stage_role') END)
 FROM public.pm_stages st JOIN public.pm_projects p ON p.id=st.project_id
 LEFT JOIN public.fee_proposals q ON q.id=p.quote_id AND q.pm_project_id=p.id
 LEFT JOIN public.psa_proposal_snapshots snap ON snap.id=q.accepted_snapshot_id
 LEFT JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot#>'{quote_data,raw,quote_stages}','[]'::jsonb)) item ON item->>'id'=st.source_quote_stage_id::text
 WHERE p.id=_project_id GROUP BY st.id,st.stage_role;
END $$;
REVOKE ALL ON FUNCTION public.pm_project_stage_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_stage_roles(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_project_client_insert() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.company_id IS NOT NULL AND nullif(btrim(NEW.client),'') IS NULL THEN SELECT c.nome INTO NEW.client FROM public.companies c WHERE c.id=NEW.company_id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pm_project_client_insert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pm_project_client_insert BEFORE INSERT OR UPDATE OF company_id ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.pm_project_client_insert();

DO $$
DECLARE v_name text; v_definition text;
BEGIN
 FOREACH v_name IN ARRAY ARRAY['sync_quote_stage_to_pm','sync_quote_allocation_to_pm','sync_quote_payment_to_pm'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO v_definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=v_name;
  IF v_definition IS NULL OR position('p.sync_status = ''live''' in v_definition)=0 THEN RAISE EXCEPTION 'Unexpected sync function: %',v_name; END IF;
  v_definition:=replace(v_definition,'p.sync_status = ''live''','p.sync_status = ''live'' AND p.quote_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.fee_proposals converted WHERE converted.pm_project_id=p.id)');
  EXECUTE v_definition;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pm_allocation_client_role_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.stage_id=OLD.stage_id THEN RETURN NEW; END IF;
 SELECT roles.stage_role INTO v_role FROM public.pm_stages st CROSS JOIN LATERAL public.pm_project_stage_roles(st.project_id) roles WHERE st.id=NEW.stage_id AND roles.stage_id=st.id;
 IF v_role='client' THEN RAISE EXCEPTION 'Client approval stages cannot receive team allocations'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pm_allocation_client_role_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pm_allocation_client_role_guard BEFORE INSERT OR UPDATE OF stage_id ON public.pm_allocations FOR EACH ROW EXECUTE FUNCTION public.pm_allocation_client_role_guard();