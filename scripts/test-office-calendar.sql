-- Rollback-only check of office closures: everything happens inside a DO
-- block that ends by raising its results, so no row is kept.
DO $t$
DECLARE admin uuid; intern uuid; sick uuid; p jsonb; out text := '';
BEGIN
  SELECT user_id INTO admin FROM user_roles WHERE role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',admin,'role','authenticated')::text, true);
  SELECT id INTO intern FROM collaborators WHERE archived_at IS NULL ORDER BY nome LIMIT 1;
  SELECT id INTO sick FROM collaborators WHERE archived_at IS NULL ORDER BY nome OFFSET 1 LIMIT 1;
  UPDATE collaborators SET ferias_entitled=false WHERE id=intern;
  PERFORM set_config('psa.leave_decide','on',true);
  INSERT INTO vacation_requests(collaborator_id,data_inicio,data_fim,dias_uteis,estado,tipo,attachment_path)
    VALUES(sick,'2026-12-28','2026-12-29',2,'aprovada','baixa_medica','__test__');
  INSERT INTO office_closures(name,start_date,end_date,repeats_yearly) VALUES('__TEST_CLOSURE__','2026-12-24','2027-01-01',true);
  p := public.pm_office_calendar_plan();
  out := out || format('days2026=%s; ', (SELECT string_agg(DISTINCT l->>'day',',' ORDER BY l->>'day') FROM jsonb_array_elements(p->'leave') l WHERE (l->>'day') < '2027-01-01'));
  out := out || format('2027repeat=%s; ', (SELECT count(*) FROM jsonb_array_elements(p->'holidays_add') h WHERE (h->>'day') >= '2027-12-24'));
  out := out || format('intern=%s; ', (SELECT string_agg(DISTINCT l->>'action',',') FROM jsonb_array_elements(p->'leave') l WHERE (l->>'collaborator_id')::uuid=intern));
  out := out || format('sick=%s; ', (SELECT string_agg(l->>'day'||':'||(l->>'action'),',' ORDER BY l->>'day') FROM jsonb_array_elements(p->'leave') l WHERE (l->>'collaborator_id')::uuid=sick AND (l->>'day') < '2027-01-01'));
  out := out || format('fractions=%s; ', (SELECT string_agg(DISTINCT l->>'days',',') FROM jsonb_array_elements(p->'leave') l WHERE l->>'action'='deduct'));
  out := out || format('apply=%s; ', public.pm_office_calendar_apply(p->>'token'));
  out := out || format('ts_entries_on_closure=%s; ', (SELECT count(*) FROM pm_time_entries e JOIN holidays h ON h.data=e.entry_date AND h.office_closure_id IS NOT NULL WHERE e.source='auto-nonworking'));
  UPDATE office_closures SET end_date='2026-12-31' WHERE name='__TEST_CLOSURE__';
  p := public.pm_office_calendar_plan();
  out := out || format('after_shorten: refunds=%s holidays_removed=%s; ', (SELECT count(*) FROM jsonb_array_elements(p->'leave') l WHERE l->>'action'='refund'), jsonb_array_length(p->'holidays_remove'));
  RAISE EXCEPTION 'RESULT %', out;
END $t$;
