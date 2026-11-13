-- Read-only D53 activation scope regressions; no fixture or real-record writes.
SELECT
 public.crm_work_d53_hashes_match(
  '{"email_events":"a","email_sync_state":"a","intake_source_runs":"a","financial_documents":"same"}'::jsonb,
  '{"email_events":"b","email_sync_state":"b","intake_source_runs":"b","financial_documents":"same"}'::jsonb
 ) AS sync_only_passes,
 NOT public.crm_work_d53_hashes_match('{"financial_documents":"a"}'::jsonb,'{"financial_documents":"b"}'::jsonb) AS changed_financial_documents_blocked,
 NOT public.crm_work_d53_hashes_match('{"financial_document_payments":"a"}'::jsonb,'{"financial_document_payments":"b"}'::jsonb) AS changed_payments_blocked,
 NOT public.crm_work_d53_hashes_match('{"marketing_settings":"a"}'::jsonb,'{"marketing_settings":"b"}'::jsonb) AS changed_marketing_settings_blocked,
 NOT public.crm_work_d53_hashes_match('{"marketing_ig_comments":"a"}'::jsonb,'{"marketing_ig_comments":"b"}'::jsonb) AS changed_comments_blocked,
 NOT public.crm_work_d53_hashes_match('{"quote_stages":"a"}'::jsonb,'{}'::jsonb) AS missing_protected_table_blocked;