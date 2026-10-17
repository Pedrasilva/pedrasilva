-- All fixture records and conversions are rolled back, including failures.
BEGIN;
DO $$
DECLARE u uuid; q uuid; s uuid; s2 uuid; a uuid; resource uuid; p uuid; preview jsonb; result jsonb; project uuid; old_revision text; expected numeric; actual numeric; month record;
BEGIN
SELECT user_id INTO u FROM user_roles WHERE role='admin' LIMIT 1;
PERFORM set_config('request.jwt.claim.sub',u::text,true);
SELECT id INTO resource FROM pm_resources LIMIT 1;
INSERT INTO fee_proposals(titulo,quote_status) VALUES('__GANTT_ROLLBACK_STANDARD__','draft') RETURNING id INTO q;
INSERT INTO quote_stages(quote_id,name,start_date,end_date) VALUES(q,'Technical Design','2000-01-03','2000-01-07') RETURNING id INTO s;
INSERT INTO quote_allocations(quote_id,stage_id,resource_id,start_date,end_date,hours_per_day,cost_rate_snapshot,sale_rate_snapshot) VALUES(q,s,resource,'2000-01-03','2000-01-07',4,20,30) RETURNING id INTO a;
INSERT INTO quote_payment_schedule_items(quote_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,payment_offset_days) VALUES(q,'30%','project_start','percent',30,'2000-01-03','2000-02-02',30) RETURNING id INTO p;
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(q,pm_gantt_state('quote',q));
UPDATE fee_proposals SET quote_status='approved' WHERE id=q;
preview:=pm_quote_conversion_preview(q,'2026-10-19');
IF (preview->'commercial'->>'total_fee')::numeric<>600 THEN RAISE EXCEPTION 'Expected fee 600'; END IF;
IF (preview->'payments'->0->>'amount')::numeric<>180 THEN RAISE EXCEPTION 'Expected percentage payment 180'; END IF;
result:=pm_convert_relative_quote(q,'2026-10-19',preview->>'revision');project:=(result->>'id')::uuid;
IF (SELECT sold_fee FROM pm_projects WHERE id=project)<>600 THEN RAISE EXCEPTION 'Copied fee mismatch'; END IF;
IF (SELECT amount FROM pm_project_contract_baseline_payments WHERE baseline_id IN(SELECT id FROM pm_project_contract_baseline WHERE project_id=project))<>180 THEN RAISE EXCEPTION 'Copied payment mismatch'; END IF;
IF (SELECT expected_invoice_date FROM pm_payment_schedule_items WHERE project_id=project)<>'2026-10-19'::date THEN RAISE EXCEPTION 'Project-start invoice mismatch'; END IF;
IF (pm_convert_relative_quote(q,'2026-11-02','retry')->>'id')::uuid<>project THEN RAISE EXCEPTION 'Duplicate retry'; END IF;
RAISE NOTICE 'Regular conversion: 600 fee, 180 payment, dates and idempotent retry passed';

INSERT INTO fee_proposals(titulo,quote_status) VALUES('__GANTT_ROLLBACK_RETAINER__','draft') RETURNING id INTO q;
INSERT INTO quote_stages(quote_id,name,start_date,end_date,stage_kind,billing_model,retainer_months,retainer_anchor_month,retainer_capacity_hours_per_month,retainer_monthly_amount) VALUES(q,'Retainer','2000-01-03','2000-01-28','retainer_monthly','retainer',3,'2000-01-01',160,2400) RETURNING id INTO s;
INSERT INTO quote_allocations(quote_id,stage_id,resource_id,start_date,end_date,hours_per_day,cost_rate_snapshot,sale_rate_snapshot) VALUES(q,s,resource,'2000-01-03','2000-01-28',4,20,30) RETURNING id INTO a;
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(q,pm_gantt_state('quote',q));
UPDATE fee_proposals SET quote_status='approved' WHERE id=q;
preview:=pm_quote_conversion_preview(q,'2026-10-19');
IF jsonb_array_length(preview->'allocations')<>3 THEN RAISE EXCEPTION 'Expected three retainer months'; END IF;
FOR month IN SELECT value FROM jsonb_array_elements(preview->'allocations') LOOP
SELECT count(*)*(month.value->>'hours_per_day')::numeric INTO actual FROM generate_series((month.value->>'start_date')::timestamp,(month.value->>'end_date')::timestamp,interval '1 day') d WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM holidays h WHERE h.data=d::date);
IF abs(actual-80)>0.000001 THEN RAISE EXCEPTION 'Monthly effort not 80: %',actual; END IF;
END LOOP;
result:=pm_convert_relative_quote(q,'2026-10-19',preview->>'revision');project:=(result->>'id')::uuid;
FOR month IN SELECT a.* FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id=project LOOP
SELECT count(*)*month.hours_per_day INTO actual FROM generate_series(month.start_date::timestamp,month.end_date::timestamp,interval '1 day') d WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM holidays h WHERE h.data=d::date);
IF abs(actual-80)>0.01 THEN RAISE EXCEPTION 'Copied monthly effort not 80: %',actual; END IF;
END LOOP;
IF (SELECT count(*) FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id=project)<>3 THEN RAISE EXCEPTION 'Monthly copies missing'; END IF;
RAISE NOTICE 'Retainer conversion: three months, 80 hours per month, preview and copied allocations passed';

INSERT INTO fee_proposals(titulo,quote_status,time_based_settings) VALUES('__GANTT_ROLLBACK_FALLBACK__','draft','{"kind":"construction_retainer","monthly_resources":[],"monthly_estimate":1500,"construction_duration_months":3}') RETURNING id INTO q;
IF (pm_quote_conversion_totals(q)->>'total_fee')::numeric<>4500 THEN RAISE EXCEPTION 'Monthly estimate fallback mismatch'; END IF;
RAISE NOTICE 'Saved monthly estimate fallback: 1500 x 3 = 4500 passed';
END $$;
ROLLBACK;