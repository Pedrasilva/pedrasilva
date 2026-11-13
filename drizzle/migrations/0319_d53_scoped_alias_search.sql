CREATE OR REPLACE FUNCTION public.crm_work_alias_match(_work uuid,_query text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.crm_work_can_read(_work) AND EXISTS(SELECT 1 FROM crm_work_number_registry WHERE work_id=_work AND number ILIKE '%'||trim(_query)||'%') $$;
REVOKE ALL ON FUNCTION public.crm_work_alias_match(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_alias_match(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_work_search(_query text) RETURNS TABLE(kind text,record_id uuid,reference text,name text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH matched AS (SELECT DISTINCT w.id FROM public.crm_work_identities w WHERE public.crm_work_can_read(w.id) AND (w.canonical_number ILIKE '%'||trim(_query)||'%' OR w.name ILIKE '%'||trim(_query)||'%' OR public.crm_work_alias_match(w.id,_query)))
SELECT 'lead',o.id,public.crm_work_reference(v.id,0),o.name FROM matched m JOIN crm_work_versions v ON v.work_id=m.id JOIN crm_opportunities o ON o.work_version_id=v.id
UNION ALL SELECT 'quote',q.id,public.crm_work_reference(v.id,coalesce(q.work_revision_ordinal,0)),q.titulo FROM matched m JOIN crm_work_versions v ON v.work_id=m.id JOIN fee_proposals q ON q.work_version_id=v.id
UNION ALL SELECT 'project',p.id,public.crm_work_reference(v.id,0),p.name FROM matched m JOIN crm_work_versions v ON v.work_id=m.id JOIN pm_projects p ON p.work_version_id=v.id
UNION ALL SELECT 'document',p.id,public.crm_work_reference(v.id,coalesce(p.work_revision_ordinal,0)),p.title FROM matched m JOIN crm_work_versions v ON v.work_id=m.id JOIN psa_proposals p ON p.work_version_id=v.id
$$;
REVOKE ALL ON FUNCTION public.crm_work_search(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_search(text) TO authenticated,service_role;