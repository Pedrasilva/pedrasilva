-- Luis approved 2026-10-19: portal start dates are not exclusion criteria.
-- Only explicit unique client/project evidence; no fiscal, payment or status edits.
BEGIN;
DO $$
DECLARE before_docs jsonb; before_payments jsonb; before_lines jsonb; before_projects jsonb;
BEGIN
 SELECT jsonb_agg(to_jsonb(d)-ARRAY['project_id','not_project_related','updated_at'] ORDER BY id) INTO before_docs FROM public.financial_documents d;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO before_payments FROM public.financial_document_payments p;
 SELECT jsonb_agg(to_jsonb(l)-ARRAY['project_id','payment_schedule_item_id','updated_at'] ORDER BY id) INTO before_lines FROM public.financial_document_lines l;
 SELECT jsonb_agg(to_jsonb(p)-ARRAY['company_id','client','updated_at'] ORDER BY id) INTO before_projects FROM public.pm_projects p;
 IF NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id='ff0dcfe7-b4df-4d42-a680-00878952b16d' AND company_id='c9bea0a2-3851-4074-bf02-918aeb739300') THEN RAISE EXCEPTION 'Clinica client changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE id='569e4396-cf17-4b1c-920f-23214ef216af' AND counterparty_client_id='873e9db5-2f41-41ad-ab14-03c9e36a5d81' AND subtotal_ex_vat=2305 AND total_inc_vat=2835.15 AND status='paid') THEN RAISE EXCEPTION 'Alcanena evidence changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE project_id='d1cb9b14-2361-4a1b-82c2-1d3097dec8ce' AND counterparty_client_id='873e9db5-2f41-41ad-ab14-03c9e36a5d81' AND direction='issued' AND status<>'cancelled') THEN RAISE EXCEPTION 'Alcanena project evidence changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e' AND counterparty_client_id='ab6fd154-ca2e-4212-b39c-c718d756dd58' AND direction='issued' AND status<>'cancelled') THEN RAISE EXCEPTION 'Telheiras evidence changed'; END IF;
 UPDATE public.financial_documents d SET project_id=v.project_id,not_project_related=false FROM (VALUES
 ('f7ab3288-a521-43a4-b256-3b905d7b339e'::uuid,'ff0dcfe7-b4df-4d42-a680-00878952b16d'::uuid),
 ('5f494825-7299-44b6-b7fe-f0bfdc510f0b'::uuid,'3775332d-48e7-4042-8ec2-8bde1d475d8e'::uuid),
 ('569e4396-cf17-4b1c-920f-23214ef216af'::uuid,'d1cb9b14-2361-4a1b-82c2-1d3097dec8ce'::uuid)
 ) v(id,project_id) WHERE d.id=v.id AND d.project_id IS NULL AND d.direction='issued' AND d.status NOT IN ('cancelled','draft') AND d.entity_id='00000000-0000-4000-a000-000000000001';
 UPDATE public.pm_projects p SET company_id=v.company_id FROM (VALUES
 ('3775332d-48e7-4042-8ec2-8bde1d475d8e'::uuid,'ab6fd154-ca2e-4212-b39c-c718d756dd58'::uuid),
 ('d1cb9b14-2361-4a1b-82c2-1d3097dec8ce'::uuid,'873e9db5-2f41-41ad-ab14-03c9e36a5d81'::uuid)
 ) v(id,company_id) WHERE p.id=v.id AND p.company_id IS NULL;
 UPDATE public.financial_document_lines l SET project_id='d1cb9b14-2361-4a1b-82c2-1d3097dec8ce',payment_schedule_item_id='1dd24560-1d5b-4f04-8536-8544ca47f3b9'
 WHERE l.id='5f2d6aeb-5254-4362-990b-722118ba99d2' AND l.document_id='569e4396-cf17-4b1c-920f-23214ef216af' AND l.amount_ex_vat=2305 AND l.project_id IS NULL AND l.payment_schedule_item_id IS NULL
 AND (SELECT count(*) FROM public.pm_payment_schedule_items WHERE project_id='d1cb9b14-2361-4a1b-82c2-1d3097dec8ce' AND direction='inflow' AND amount_type='fixed' AND amount_value=2305)=1;
 IF before_docs IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d)-ARRAY['project_id','not_project_related','updated_at'] ORDER BY id) FROM public.financial_documents d) THEN RAISE EXCEPTION 'Immutable document fields changed'; END IF;
 IF before_payments IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.financial_document_payments p) THEN RAISE EXCEPTION 'Payments changed'; END IF;
 IF before_lines IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(l)-ARRAY['project_id','payment_schedule_item_id','updated_at'] ORDER BY id) FROM public.financial_document_lines l) THEN RAISE EXCEPTION 'Line amounts changed'; END IF;
 IF before_projects IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p)-ARRAY['company_id','client','updated_at'] ORDER BY id) FROM public.pm_projects p) THEN RAISE EXCEPTION 'Other project fields changed'; END IF;
 IF (SELECT count(*) FROM public.financial_documents WHERE id IN ('f7ab3288-a521-43a4-b256-3b905d7b339e','5f494825-7299-44b6-b7fe-f0bfdc510f0b','569e4396-cf17-4b1c-920f-23214ef216af') AND project_id IS NOT NULL)<>3 THEN RAISE EXCEPTION 'Associations not applied'; END IF;
END $$;
COMMIT;
