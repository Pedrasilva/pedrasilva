CREATE OR REPLACE FUNCTION public.crm_work_restart(_work uuid,_year integer,_expected_revision integer,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE w public.crm_work_identities; n integer; key text; vid uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.crm_work_can_read(_work) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NOT(public.has_role(auth.uid(),'admin') OR
 (public.has_permission(auth.uid(),'crm.pipeline') AND EXISTS(SELECT 1 FROM public.crm_opportunities o JOIN public.crm_work_versions v ON v.id=o.work_version_id WHERE v.work_id=_work AND o.stage='lost')) OR
 EXISTS(SELECT 1 FROM public.pm_projects p JOIN public.crm_work_versions v ON v.id=p.work_version_id WHERE v.work_id=_work AND p.status IN('paused','archived') AND NOT p.finance_only AND public.pm_can_edit_gantt(p.id))) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.crm_work_identities WHERE id=_work FOR UPDATE;
 IF w.id IS NULL OR w.revision<>_expected_revision THEN RAISE EXCEPTION 'Work identity changed; reload';END IF;
 IF NOT public.crm_work_numbering_active() AND NOT w.is_fixture THEN RAISE EXCEPTION 'Work numbering awaits approved mapping';END IF;
 IF _year<>extract(year from now() AT TIME ZONE 'Europe/Lisbon')::integer OR length(trim(_reason))<3 THEN RAISE EXCEPTION 'Invalid restart year or reason';END IF;
 SELECT coalesce(max(restart_ordinal),0)+1 INTO n FROM public.crm_work_versions WHERE work_id=_work AND restart_year=_year;
 key:=right(_year::text,2)||CASE WHEN n=1 THEN '' ELSE '-'||lpad(n::text,2,'0') END;
 INSERT INTO public.crm_work_versions(work_id,version_key,restart_year,restart_ordinal,reason) VALUES(_work,key,_year,n,_reason) RETURNING id INTO vid;
 UPDATE public.crm_work_identities SET revision=revision+1 WHERE id=_work;
 INSERT INTO public.crm_work_identity_audit(work_id,action,before_value,after_value,reason,actor_id) VALUES(_work,'restart',jsonb_build_object('folder','P'||w.canonical_number),jsonb_build_object('versionId',vid,'versionKey',key),_reason,auth.uid()); RETURN vid;
 END $$;
CREATE FUNCTION public.crm_work_numbering_fixture_check(_source uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE src public.fee_proposals; copy_id uuid:=gen_random_uuid(); wid uuid:=gen_random_uuid(); vid uuid; v1 uuid; v2 uuid; a uuid; b uuid; denied boolean:=false; result jsonb; before_rows text; after_rows text; checks integer:=0;
 BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF public.pm_project_b1_active() OR public.crm_work_numbering_active() THEN RAISE EXCEPTION 'Both numbering and B1 gates must be OFF';END IF;
 SELECT * INTO src FROM public.fee_proposals WHERE id=_source;
 IF src.id IS NULL THEN RAISE EXCEPTION 'Source quote missing';END IF;
 SELECT md5(string_agg(to_jsonb(q)::text,'' ORDER BY id)) INTO before_rows FROM public.fee_proposals q;
 BEGIN
 INSERT INTO public.crm_work_identities(id,canonical_number,name,is_fixture,original_created_at) VALUES(wid,'990'||lpad((floor(random()*899)+100)::integer::text,3,'0'),'[QA DISPOSABLE] D53 numbering',true,'2099-01-01');
 INSERT INTO public.crm_work_versions(work_id) VALUES(wid) RETURNING id INTO vid;
 INSERT INTO public.fee_proposals SELECT * FROM jsonb_populate_record(NULL::public.fee_proposals,to_jsonb(src)||jsonb_build_object('id',copy_id,'created_at',now(),'updated_at',now(),'titulo','[QA DISPOSABLE] D53 separate quote','proposal_number',NULL,'work_version_id',vid,'work_revision_ordinal',NULL,'parent_quote_id',NULL,'main_proposal_id',NULL,'opportunity_id',NULL,'company_id',NULL,'contact_id',NULL,'account_id',NULL,'pm_project_id',NULL,'locked_project_id',NULL,'quote_status','draft','is_locked',false,'locked_at',NULL,'signed_at',NULL,'signed_method',NULL,'signed_notes',NULL,'accepted_snapshot_id',NULL,'accepted_content_hash',NULL,'archived_at',NULL,'deleted_at',NULL,'revision_number',1));
 IF copy_id=_source OR (SELECT opportunity_id IS NOT NULL OR pm_project_id IS NOT NULL OR parent_quote_id IS NOT NULL FROM public.fee_proposals WHERE id=copy_id) THEN RAISE EXCEPTION 'Unsafe copied quote';END IF;
 checks:=checks+1;
 a:=public.clone_fee_proposal_as_revision(copy_id);b:=public.clone_fee_proposal_as_revision(copy_id);
 IF (SELECT work_revision_ordinal FROM public.fee_proposals WHERE id=a)<>1 OR (SELECT work_revision_ordinal FROM public.fee_proposals WHERE id=b)<>2 THEN RAISE EXCEPTION 'Revision numbering failed';END IF;
 IF (SELECT parent_quote_id FROM public.fee_proposals WHERE id=a)<>copy_id OR (SELECT parent_quote_id FROM public.fee_proposals WHERE id=b)<>copy_id THEN RAISE EXCEPTION 'Revision escaped copied quote';END IF;
 IF EXISTS(SELECT 1 FROM public.psa_proposals WHERE quote_id IN(copy_id,a,b) AND quote_id=_source) THEN RAISE EXCEPTION 'Unsafe test document';END IF;
 checks:=checks+2;
 v1:=public.crm_work_restart(wid,2026,1,'QA first restart');v2:=public.crm_work_restart(wid,2026,2,'QA second restart');
 IF (SELECT version_key FROM public.crm_work_versions WHERE id=v1)<>'26' OR (SELECT version_key FROM public.crm_work_versions WHERE id=v2)<>'26-02' THEN RAISE EXCEPTION 'Restart keys failed';END IF;checks:=checks+1;
 PERFORM public.crm_work_edit_number(wid,'99123',3,'QA edit number');
 IF (SELECT count(*) FROM public.crm_work_number_registry WHERE work_id=wid)<>2 THEN RAISE EXCEPTION 'Previous alias was not retained';END IF;checks:=checks+1;
 BEGIN UPDATE public.fee_proposals SET proposal_number='99124' WHERE id=copy_id;EXCEPTION WHEN OTHERS THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct numbering mutation allowed';END IF;checks:=checks+1;
 IF public.crm_work_letters(0)<>'' OR public.crm_work_letters(1)<>'A' OR public.crm_work_letters(27)<>'AA' THEN RAISE EXCEPTION 'Revision alphabet failed';END IF;checks:=checks+1;
 result:=jsonb_build_object('checks',checks,'separateQuote',copy_id,'sourceQuote',_source,'rolledBack',true);
 RAISE EXCEPTION 'D53 fixture rollback' USING ERRCODE='ZD053';
 EXCEPTION WHEN SQLSTATE 'ZD053' THEN NULL;
 END;
 SELECT md5(string_agg(to_jsonb(q)::text,'' ORDER BY id)) INTO after_rows FROM public.fee_proposals q;
 IF before_rows IS DISTINCT FROM after_rows OR EXISTS(SELECT 1 FROM public.crm_work_identities WHERE id=wid) OR EXISTS(SELECT 1 FROM public.fee_proposals WHERE id=copy_id) OR public.pm_project_b1_active() OR public.crm_work_numbering_active() THEN RAISE EXCEPTION 'Fixture preservation failed';END IF;
 RETURN result;
 END $$;
REVOKE ALL ON FUNCTION public.crm_work_numbering_fixture_check(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_numbering_fixture_check(uuid) TO authenticated,service_role;