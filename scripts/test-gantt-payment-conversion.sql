-- Privileged rollback-only regression fixtures; never retain test projects.
BEGIN;
DO $$
DECLARE u uuid; q uuid; s uuid; p uuid; monthly uuid; preview jsonb; result jsonb; project uuid;
BEGIN
SELECT user_id INTO u FROM user_roles WHERE role='admin' LIMIT 1;
PERFORM set_config('request.jwt.claim.sub',u::text,true);
INSERT INTO fee_proposals(titulo,quote_status) VALUES('__GANTT_PAYMENT_ROLLBACK__','draft') RETURNING id INTO q;
INSERT INTO quote_stages(quote_id,name,start_date,end_date,stage_kind,billing_model,retainer_months,retainer_anchor_month,retainer_capacity_hours_per_month,retainer_monthly_amount)
VALUES(q,'Retainer','2000-01-03','2000-01-28','retainer_monthly','retainer',3,'2000-01-01',160,2400) RETURNING id INTO s;
INSERT INTO quote_payment_schedule_items(quote_id,stage_id,label,trigger_type,amount_type,amount_value,payment_offset_days)
VALUES(q,s,'30 percent retainer','stage_start','percent',30,30) RETURNING id INTO p;
INSERT INTO quote_payment_schedule_items(quote_id,label,trigger_type,amount_type,amount_value,expected_invoice_date,expected_payment_date,payment_offset_days)
VALUES(q,'Monthly','monthly','fixed',2400,'2000-01-03','2000-02-02',30) RETURNING id INTO monthly;
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(q,pm_gantt_state('quote',q));
UPDATE fee_proposals SET quote_status='approved' WHERE id=q;
preview:=pm_quote_conversion_preview(q,'2026-10-19');
IF (SELECT (value->>'amount')::numeric FROM jsonb_array_elements(preview->'payments') WHERE value->>'id'=p::text) IS DISTINCT FROM 2160::numeric THEN RAISE EXCEPTION '30 percent of 2400 x 3 must equal 2160'; END IF;
IF (SELECT (value->>'expected_payment_date')::date FROM jsonb_array_elements(preview->'payments') WHERE value->>'id'=monthly::text) IS DISTINCT FROM '2026-10-31'::date THEN RAISE EXCEPTION 'Monthly collection must be mapped invoice plus 30 days exactly once'; END IF;
result:=pm_convert_relative_quote(q,'2026-10-19',preview->>'revision'); project:=(result->>'id')::uuid;
IF (SELECT amount FROM pm_project_contract_baseline_payments WHERE baseline_id IN(SELECT id FROM pm_project_contract_baseline WHERE project_id=project) AND label='30 percent retainer') IS DISTINCT FROM 2160::numeric THEN RAISE EXCEPTION 'Copied retainer payment differs from preview'; END IF;
IF (SELECT expected_payment_date FROM pm_payment_schedule_items WHERE project_id=project AND label='Monthly') IS DISTINCT FROM '2026-10-31'::date THEN RAISE EXCEPTION 'Copied monthly payment differs from preview'; END IF;
END $$;
ROLLBACK;