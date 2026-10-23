BEGIN;
INSERT INTO public.finance_known_bank_identities(bank_name,holder,account_number,iban,ownership,created_by)
SELECT v.bank,v.holder,v.account,v.iban,v.ownership,'ab5a48c0-939b-4502-bd3b-db7801f0f8b8'::uuid FROM (VALUES
('CGD','Luis Pedra Silva','0758005996730','PT50003507580000599673020','personal'),
('Millennium BCP','Luis Pedra Silva','40657746','PT50003300000004065774602','personal'),
('CGD','Luis Silva e Teresa Martin','0758006094930','PT50003507580000609493009','personal'),
('Novo Banco','Condomínio administrado por Luis','0000 6760 8322','PT50000700000006760832223','external'),
('BPI','ADM PREDIO TRAV CORPO SANTO 10-LISBOA','4-4231310.000.001',NULL,'external')
) v(bank,holder,account,iban,ownership) WHERE NOT EXISTS (SELECT 1 FROM public.finance_known_bank_identities k WHERE k.account_number=v.account);
UPDATE public.bank_accounts SET account_number='0758002219230' WHERE id='15b76587-7bfe-41b9-8c0c-197d734d011e' AND account_number='758002219230' AND iban='PT50003507580000221923010' AND entity_id='00000000-0000-4000-a000-000000000001';
WITH changed AS (
UPDATE public.financial_document_review_queue q SET
 intake_type=CASE WHEN q.id='bf6323eb-1fb4-4251-81ab-f1102b8e6e4f' THEN 'extrato_bancario' ELSE q.intake_type END,
 reviewed_by='ab5a48c0-939b-4502-bd3b-db7801f0f8b8',reviewed_at=now()
WHERE public.fin_known_bank_identity(q.extracted_iban,q.extracted_account_number) IS NOT NULL
AND (q.intake_type='extrato_bancario' OR q.bank_doc_kind IN ('account_statement','card_statement','bank_export') OR q.id='bf6323eb-1fb4-4251-81ab-f1102b8e6e4f')
RETURNING id,entity_id,removed_reason)
INSERT INTO public.finance_intake_corrections(entity_id,queue_item_id,field,ai_value,corrected_value,corrected_by)
SELECT entity_id,id,'removal','Previous extraction retained',removed_reason||'; exact identity confirmed by Luis; permanent preservation; no periods, movements or matches changed','ab5a48c0-939b-4502-bd3b-db7801f0f8b8' FROM changed;
COMMIT;
-- Personal card account identity inferred from the existing personal 7305 card
-- and the identical printed account number in both Platinum statements.
BEGIN;
INSERT INTO finance_known_bank_identities(bank_name,holder,account_number,ownership,created_by)
SELECT 'Millennium BCP','Luis Pedra Silva — cartão pessoal 7305','434736-0106408-00-0','personal','ab5a48c0-939b-4502-bd3b-db7801f0f8b8'
WHERE EXISTS(SELECT 1 FROM payment_cards WHERE id='002d0a6a-b216-4d63-ab68-9561c6b1af07' AND is_personal AND last4='7305') AND NOT EXISTS(SELECT 1 FROM finance_known_bank_identities WHERE account_number='434736-0106408-00-0');
WITH changed AS (UPDATE financial_document_review_queue SET reviewed_by='ab5a48c0-939b-4502-bd3b-db7801f0f8b8',reviewed_at=now() WHERE id IN ('080e1efe-55df-4632-a669-0941a6a998b4','44d2be80-e073-4bee-88bf-e2938b8646c8') RETURNING id,entity_id,removed_reason)
INSERT INTO finance_intake_corrections(entity_id,queue_item_id,field,ai_value,corrected_value,corrected_by) SELECT entity_id,id,'removal','Personal card 7305 already registered; same printed account 434736-0106408-00-0',removed_reason,'ab5a48c0-939b-4502-bd3b-db7801f0f8b8' FROM changed;
UPDATE financial_document_review_queue SET raw_extraction=coalesce(raw_extraction,'{}'::jsonb)||jsonb_build_object('_known_paying_account',CASE WHEN extracted_account_number='45344866160' THEN '03 MBCP Associados' ELSE '01 MBCP' END),reviewed_by='ab5a48c0-939b-4502-bd3b-db7801f0f8b8',reviewed_at=now() WHERE id IN ('aca28de3-0fa7-4379-8179-7087f1c95f4c','36f451e4-44cf-4f6c-a429-0724d6a5b5e4');
COMMIT;
