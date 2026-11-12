-- Luis authorized these exact Oleiro changes on 2026-11-12 at 12:42 UTC.
-- Guarded data correction; no schema, role, policy or proposal-content changes.
BEGIN;
SELECT id FROM public.fee_proposals WHERE id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' FOR UPDATE;
SELECT id FROM public.quote_stages WHERE quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' FOR UPDATE;
SELECT id FROM public.quote_payment_schedule_items WHERE quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' FOR UPDATE;
DO $$ BEGIN
IF public.pm_project_b1_active() THEN RAISE EXCEPTION 'B1 must remain OFF'; END IF;
IF EXISTS(SELECT 1 FROM public.quote_stages WHERE quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' AND updated_at>'2026-11-12 12:45:00+00') OR EXISTS(SELECT 1 FROM public.quote_payment_schedule_items WHERE quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' AND (updated_at>'2026-11-12 12:45:00+00' OR manual_override OR billing_status<>'planned')) THEN RAISE EXCEPTION 'New or protected edits require review'; END IF;
END $$;
UPDATE public.quote_stages SET children_bill_independently=true WHERE id='c61d3fca-43c2-4d38-8a8c-f4c124681266' AND quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
UPDATE public.quote_stages SET stage_role='architecture' WHERE id='5d7acd6f-70f2-4596-82b3-4370dde188dd' AND quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
UPDATE public.quote_stage_dependencies SET predecessor_stage_id='73cdc641-7600-4f38-a798-dd43fd91d8aa',type='FS',lag_days=0 WHERE id='851fdf14-d052-45a1-a020-d08199a593a8' AND quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
UPDATE public.quote_stages SET parent_stage_id='5e38322d-e360-46c3-b84b-75e5aac35efd',sort_order=20,start_date='2000-09-01',retainer_months=12 WHERE id='7f2fcf5d-fda9-42cd-a8e0-de531187effe' AND quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
DELETE FROM public.quote_payment_schedule_items WHERE quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' AND NOT coalesce(manual_override,false) AND billing_status='planned';
INSERT INTO public.quote_payment_schedule_items(quote_id,label,trigger_type,amount_type,amount_value,stage_id,expected_invoice_date,sort_order,generator_source,direction,vat_rate,payment_terms,payment_offset_days)
SELECT 'd73deb33-a0f9-41bb-ad4d-637cd5d159b6','Adjudicação','project_start','fixed',33460,NULL,'2000-01-03',0,'by_stage_billing','inflow',23,'Pronto pagamento',0;
INSERT INTO public.quote_payment_schedule_items(quote_id,label,trigger_type,amount_type,amount_value,stage_id,expected_invoice_date,sort_order,generator_source,direction,vat_rate,payment_terms,payment_offset_days)
SELECT s.quote_id,CASE WHEN n=0 THEN '50% — Início da fase de ' ELSE '50% — Conclusão da fase de ' END||s.name,CASE WHEN n=0 THEN 'stage_start'::quote_payment_trigger ELSE 'stage_end'::quote_payment_trigger END,'fixed',s.budget*0.4,s.id,CASE WHEN n=0 THEN s.start_date ELSE s.end_date END,(row_number() OVER(ORDER BY CASE WHEN s.id='64089114-5b8e-4aee-a002-05904b1f53d6' THEN 60 ELSE s.sort_order END,n))::integer,'by_stage_billing','inflow',23,'30 (trinta) dias de calendário',0 FROM public.quote_stages s CROSS JOIN generate_series(0,1) n WHERE s.quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6' AND s.id IN ('5d7acd6f-70f2-4596-82b3-4370dde188dd','550b8856-3345-48d6-b628-cc61359c82b8','272ac679-1e76-4408-ba9a-b39633298419','22a57892-200b-4c0c-b838-31222cae3981','73cdc641-7600-4f38-a798-dd43fd91d8aa','64089114-5b8e-4aee-a002-05904b1f53d6');
INSERT INTO public.quote_payment_schedule_items(quote_id,label,trigger_type,amount_type,amount_value,stage_id,expected_invoice_date,sort_order,generator_source,direction,vat_rate,payment_terms,payment_offset_days)
SELECT s.quote_id,s.name||' — Mês '||(n+1)||' de obra','monthly','fixed',3000,s.id,public.pm_retainer_month_date(s.start_date,n,true),13+n,'by_stage_billing','inflow',23,'30 (trinta) dias de calendário',0 FROM public.quote_stages s CROSS JOIN generate_series(0,11) n WHERE s.id='7f2fcf5d-fda9-42cd-a8e0-de531187effe' AND s.quote_id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
COMMIT;
