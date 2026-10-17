-- Rollback-only: a 5-working-day stage crossing a 24-25 Dec closure keeps hours/fee; end moves 25 -> 29 Dec.
BEGIN;
DO $$
DECLARE u uuid; q uuid; s uuid; resource uuid; preview jsonb; st jsonb; result jsonb; project uuid;
BEGIN
SELECT user_id INTO u FROM user_roles WHERE role='admin' LIMIT 1;
PERFORM set_config('request.jwt.claim.sub',u::text,true);
INSERT INTO holidays(data,nome,tipo) SELECT '2026-12-24','__TEST_CLOSURE__','fecho_atelier' WHERE NOT EXISTS(SELECT 1 FROM holidays WHERE data='2026-12-24');
SELECT id INTO resource FROM pm_resources LIMIT 1;
INSERT INTO fee_proposals(titulo,quote_status) VALUES('__XMAS_ROLLBACK__','draft') RETURNING id INTO q;
INSERT INTO quote_stages(quote_id,name,start_date,end_date) VALUES(q,'Concept','2000-01-03','2000-01-07') RETURNING id INTO s;
INSERT INTO quote_allocations(quote_id,stage_id,resource_id,start_date,end_date,hours_per_day,cost_rate_snapshot,sale_rate_snapshot) VALUES(q,s,resource,'2000-01-03','2000-01-07',4,20,30);
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(q,pm_gantt_state('quote',q));
UPDATE fee_proposals SET quote_status='approved' WHERE id=q;
preview:=pm_quote_conversion_preview(q,'2026-12-21'); st:=preview->'stages'->0;
IF st->>'baseline_end_date'<>'2026-12-25' OR st->>'end_date'<>'2026-12-29' THEN RAISE EXCEPTION 'Dates %',st; END IF;
IF (st->>'working_days')::int<>5 OR (st->>'hours')::numeric<>20 OR (st->>'fee')::numeric<>600 THEN RAISE EXCEPTION 'Effort %',st; END IF;
result:=pm_convert_relative_quote(q,'2026-12-21',preview->>'revision'); project:=(result->>'id')::uuid;
IF (SELECT sold_fee FROM pm_projects WHERE id=project)<>600 THEN RAISE EXCEPTION 'Fee dropped'; END IF;
IF (SELECT end_date FROM pm_stages WHERE project_id=project)<>'2026-12-29' THEN RAISE EXCEPTION 'Live end'; END IF;
IF (SELECT sum(hours_per_day*5) FROM pm_allocations a JOIN pm_stages x ON x.id=a.stage_id WHERE x.project_id=project AND a.end_date='2026-12-29')<>20 THEN RAISE EXCEPTION 'Hours'; END IF;
RAISE NOTICE 'Christmas conversion: 5 wd, 20h, 600 fee, end 25->29 Dec passed';
END $$;
ROLLBACK;
