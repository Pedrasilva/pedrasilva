CREATE OR REPLACE FUNCTION public.crm_work_d53_hashes_match(_saved jsonb,_current jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT (_saved-ARRAY['email_events','email_sync_state','intake_source_runs']) IS NOT DISTINCT FROM (_current-ARRAY['email_events','email_sync_state','intake_source_runs']) $$;
REVOKE ALL ON FUNCTION public.crm_work_d53_hashes_match(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_d53_hashes_match(jsonb,jsonb) TO service_role;
DO $patch$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.crm_work_activate_d53(uuid)'::regprocedure) INTO d;
IF position('b.protected_hashes<>public.crm_work_protected_hashes()' IN d)=0 THEN RAISE EXCEPTION 'Unexpected activation definition'; END IF;
d:=replace(d,'b.protected_hashes<>public.crm_work_protected_hashes()','NOT public.crm_work_d53_hashes_match(b.protected_hashes,public.crm_work_protected_hashes())');
d:=replace(d,'INSERT INTO crm_work_numbering_gate', $checks$
-- Lock identity, alias, reservation and version owners too; retain every original record/mapping check.
LOCK TABLE crm_work_identities,crm_work_versions,crm_work_number_registry,crm_work_identity_audit IN SHARE ROW EXCLUSIVE MODE;
IF (SELECT count(*) FROM crm_work_identities)<>64 OR (SELECT count(*) FROM crm_work_identities WHERE is_fixture)<>26 THEN RAISE EXCEPTION 'Identity count mismatch'; END IF;
IF EXISTS (
 WITH expected AS (SELECT DISTINCT value->>'number' AS number FROM jsonb_array_elements(b.approved_map))
 SELECT 1 FROM expected e FULL JOIN crm_work_identities w ON w.canonical_number=e.number WHERE e.number IS NULL OR w.id IS NULL OR w.is_fixture IS DISTINCT FROM (e.number LIKE 'QA-%')
) THEN RAISE EXCEPTION 'Identity mapping mismatch'; END IF;
IF EXISTS (
 WITH expected AS (SELECT DISTINCT value->>'number' AS number,value->>'version' AS version FROM jsonb_array_elements(b.approved_map)), actual AS (SELECT w.canonical_number AS number,v.version_key AS version FROM crm_work_versions v JOIN crm_work_identities w ON w.id=v.work_id)
 SELECT 1 FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) differences
) THEN RAISE EXCEPTION 'Version set mismatch'; END IF;
IF EXISTS (
 WITH expected AS (
 SELECT DISTINCT value->>'number' AS number,value->>'number' AS owner FROM jsonb_array_elements(b.approved_map)
 UNION SELECT DISTINCT a.alias,value->>'number' FROM jsonb_array_elements(b.approved_map) CROSS JOIN LATERAL jsonb_array_elements_text(value->'aliases') a(alias)
 UNION SELECT n,CASE WHEN EXISTS(SELECT 1 FROM crm_work_identities WHERE canonical_number=n) THEN n END FROM unnest(ARRAY['2009','2101','2128','2311','2315','2323','2324','2404','2417','2418','2420','2425','2427','2428','2501','2502','2503','2504','2505','2506','2507','2508','2509','2510','2511','2512','2514','2518','2519','2520','2521','2522','2524','2527','2530','2602','2603','2604','2605','2606','2607','2608','2609','2610','2611','2612','2613','2614','2615','2616','2617','2618']) n
 ), actual AS (SELECT r.number,w.canonical_number AS owner FROM crm_work_number_registry r LEFT JOIN crm_work_identities w ON w.id=r.work_id)
 SELECT 1 FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) differences
) THEN RAISE EXCEPTION 'Alias or reservation mapping mismatch'; END IF;
IF EXISTS(SELECT 1 FROM crm_work_number_registry r JOIN crm_work_identities w ON w.id=r.work_id WHERE w.is_fixture AND r.number<>w.canonical_number) THEN RAISE EXCEPTION 'QA aliases forbidden'; END IF;
IF (SELECT count(*) FROM crm_work_identity_audit WHERE action='approved-mapping')<>64 OR EXISTS(SELECT 1 FROM crm_work_identity_audit a JOIN crm_work_identities w ON w.id=a.work_id WHERE a.action='approved-mapping' AND a.after_value->>'number' IS DISTINCT FROM w.canonical_number) THEN RAISE EXCEPTION 'Identity audit mismatch'; END IF;
IF public.pm_project_b1_active() THEN RAISE EXCEPTION 'B1 must remain OFF'; END IF;
INSERT INTO crm_work_numbering_gate
$checks$);
EXECUTE d;
END $patch$;
COMMENT ON FUNCTION public.crm_work_d53_hashes_match(jsonb,jsonb) IS 'Luis 13 November 2026: exclude only verified background email sync/intake tables; preserve original backup and exact comparison for every other protected public table.';