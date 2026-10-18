-- Authorized scoped correction: apply through the data tool, not DDL.
-- Preserve invoice dates, stage fees, hours, and every other proposal.
WITH expected(id, old_amount, new_amount) AS (VALUES
 ('c5890a02-480b-4aa7-9b71-fa2f0b62db30'::uuid,10900,10900),
 ('8dff8819-df74-445c-84ea-79c77d506a84'::uuid,6000,5400),
 ('88b8a73b-1583-45e6-9592-a378b112f19f'::uuid,23000,20700),
 ('01f98877-7d84-4218-85fe-e3350a369a2e'::uuid,23000,20700),
 ('fe1ac55d-aa31-407c-818c-ea60194902b8'::uuid,13000,11700),
 ('c263105c-84cb-40c5-994a-8d5017dfe9d7'::uuid,13000,11700),
 ('1605534f-f63d-4d6d-8777-45c99ca0c45c'::uuid,14000,12600),
 ('af3999a2-039a-4ba7-ba0e-1134f29fd149'::uuid,14000,12600),
 ('6ffb5807-536a-44f1-bef3-e486cf1f4316'::uuid,3000,2700)
), eligible AS (
 SELECT q.id FROM public.fee_proposals q
 WHERE q.id='4f78157a-334e-4756-83ea-a2613b19f3ae'
 AND q.quote_status='draft' AND q.locked_at IS NULL AND q.pm_project_id IS NULL
 AND q.quote_build_settings->>'vatEnabled'='false'
 AND (SELECT count(*) FROM public.quote_payment_schedule_items p WHERE p.quote_id=q.id)=9
 AND (SELECT count(*) FROM public.quote_payment_schedule_items p JOIN expected e ON e.id=p.id
 WHERE p.quote_id=q.id AND p.amount_value=e.old_amount AND p.amount_type='fixed'
 AND p.billing_status='planned' AND NOT coalesce(p.manual_override,false))=9
), corrected AS (
 UPDATE public.quote_payment_schedule_items p SET amount_value=e.new_amount,vat_rate=0
 FROM expected e,eligible q WHERE p.id=e.id AND p.quote_id=q.id RETURNING p.id
)
UPDATE public.fee_proposals q
SET quote_build_settings=jsonb_set(q.quote_build_settings,'{deductDownPaymentFromStages}','true'::jsonb)
FROM eligible e WHERE q.id=e.id AND (SELECT count(*) FROM corrected)=9
RETURNING q.proposal_number,(SELECT count(*) FROM corrected) AS corrected_invoices;