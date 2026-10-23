-- Authorized June PDF recovery: both readers agree exactly; preserve movements/matches.
BEGIN;
WITH recovered AS (
 UPDATE public.financial_document_review_queue q SET
 status='filed', intake_type='extrato_bancario', intake_type_source='manual', intake_route='bank', doc_type='bank_statement',
 bank_doc_kind='account_statement', matched_bank_account_id='90980ef2-4a34-4809-9c39-f63505d7552b', bank_identity_flag=NULL,
 extracted_statement_number='2026/006', extracted_period_start='2026-06-01', extracted_period_end='2026-06-30',
 extracted_opening_balance=48548.51, extracted_closing_balance=28984.38, extracted_bank_name='Millennium BCP', bank_period='2026-06',
 bank_ai_values='{"bank_doc_kind": "account_statement", "matched_bank_account_id": "90980ef2-4a34-4809-9c39-f63505d7552b", "extracted_statement_number": "2026/006", "extracted_opening_balance": 48548.51, "extracted_closing_balance": 28984.38, "extracted_period_start": "2026-06-01", "extracted_period_end": "2026-06-30", "extracted_bank_name": "Millennium BCP"}'::jsonb, field_checks=coalesce(q.field_checks,'{}'::jsonb)||'{"opening_balance": {"status": "ok", "value": 48548.51, "claude": 48548.51, "gemini": 48548.51, "reasons": []}, "closing_balance": {"status": "ok", "value": 28984.38, "claude": 28984.38, "gemini": 28984.38, "reasons": []}, "iban": {"status": "ok", "value": "PT50 0033 0000 4523 8716 7320 5", "claude": "PT50 0033 0000 4523 8716 7320 5", "gemini": "PT50003300004523871673205", "reasons": []}, "account_number": {"status": "ok", "value": "45238716732", "claude": "45238716732", "gemini": "45238716732", "reasons": []}}'::jsonb,
 raw_extraction=coalesce(q.raw_extraction,'{}'::jsonb)||jsonb_build_object('_june_reread','{"bank_name": "Millennium BCP", "iban": "PT50 0033 0000 4523 8716 7320 5", "account_number": "45238716732", "recipient_name": "Pedra Silva Arquitecto Lda", "statement_number": "2026/006", "period_start": "2026-06-01", "period_end": "2026-06-30", "opening_balance": 48548.51, "closing_balance": 28984.38, "_models": {"claude": {"bank_name": "Millennium BCP", "iban": "PT50 0033 0000 4523 8716 7320 5", "account_number": "45238716732", "recipient_name": "Pedra Silva Arquitecto Lda", "statement_number": "2026/006", "period_start": "2026-06-01", "period_end": "2026-06-30", "opening_balance": 48548.51, "closing_balance": 28984.38}, "gemini": {"bank_name": "Millennium BCP", "iban": "PT50003300004523871673205", "account_number": "45238716732", "recipient_name": "PEDRA SILVA ARQUITECTO LDA", "statement_number": "2026/006", "period_start": "2026-06-01", "period_end": "2026-06-30", "opening_balance": 48548.51, "closing_balance": 28984.38}}}'::jsonb),
 reviewed_by='ab5a48c0-939b-4502-bd3b-db7801f0f8b8', reviewed_at=now()
 WHERE q.id='8741872f-ef8d-42a6-a352-4e9ebc2a0c8f' AND q.status='rejected'
 AND q.entity_id='00000000-0000-4000-a000-000000000001'
 AND EXISTS(SELECT 1 FROM public.bank_statement_periods p JOIN public.bank_accounts a ON a.id=p.bank_account_id
 WHERE p.id='a76c5639-9d31-46c1-a7a0-5c5f5621638d' AND p.statement_number='MBCP 06/2026'
 AND p.opening_balance=48548.51 AND p.closing_balance=28984.38
 AND p.period_start_date='2026-06-01' AND p.period_end_date='2026-06-30' AND p.locked_at IS NULL
 AND p.source_queue_item_id IS NULL AND a.iban='PT50003300004523871673205')
 RETURNING q.id,q.entity_id
)
INSERT INTO public.finance_intake_corrections(entity_id,queue_item_id,field,ai_value,corrected_value,corrected_by)
SELECT entity_id,id,'june_statement_recovery','rejected; previous rejection retained in row',
'Luis authorized re-read: Claude and Gemini 48548.51 -> 28984.38; IBAN verified; PDF linked to existing MBCP 06/2026; no movements or matches changed.',
'ab5a48c0-939b-4502-bd3b-db7801f0f8b8' FROM recovered;
COMMIT;
