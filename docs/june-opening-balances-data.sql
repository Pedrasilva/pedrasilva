BEGIN;
-- Explicitly approved by Luis on 23 October 2026. No reconciliation changes.
INSERT INTO public.bank_balance_correction_audit(entity_id,record_table,record_id,before_row,after_changes,source_document,source_url,reason,actor_id,actor_email)
SELECT a.entity_id,'bank_accounts',a.id,to_jsonb(a),jsonb_build_object('opening_balance',v.balance,'opening_balance_date','2026-05-31'),v.document,v.url,
'Luis confirmed opening at 01 June; cut-off 31 May counts 01 June once. Existing archive/type/payment links preserved.',
'ab5a48c0-939b-4502-bd3b-db7801f0f8b8','luis@pedrasilva.com'
FROM public.bank_accounts a JOIN (VALUES
('90980ef2-4a34-4809-9c39-f63505d7552b'::uuid,48548.51,'EXTRATO COMBINADO 2026006; MBCP 06/2026','https://pedrasilva.lovable.app/finance/banking/reconciliation'),
('15b76587-7bfe-41b9-8c0c-197d734d011e',276.36,'EXTR_006_2026.pdf; CGD 007/2026 page 1','https://drive.google.com/file/d/1IbpdV16RbUC5L3hlq6BL-HrnPSANn76e/view'),
('6dc3eb08-9028-4587-9f0c-d9e44da3c429',1928.62,'EXTR.pdf; Associados 2026/006 page 1','https://drive.google.com/file/d/1rgLujxdOu-VBjKYy34pPEbe-rxXewVXv/view'),
('09a1e9ae-957a-4aa7-b7b9-0a9d8b780457',335643.39,'EXTR_006_2026.pdf; PR MBCP 2026/007 page 1','https://drive.google.com/file/d/1qsmK8Ky89N5dvOjScpmDPVQVHtMUaLKU/view'),
('eb03ff40-2d0d-4202-93ff-1ddc6c1278d9',76477.28,'EXTR_006.pdf; PR CGD 007/2026 page 1','https://drive.google.com/file/d/1vxphF0pMmp4cOX8QJAQE9ERQtRQvRhpV/view'),
('7fb26a84-c532-41c9-a159-58777df1bce6',0.00,'EXTR_CC.pdf; Bernardo 3964 page 5','https://drive.google.com/file/d/1FqL6DkTo0rVm5t4S7MPAWR2peBKG5eYb/view'),
('90302b61-5f4d-42c9-a274-cae3694cc02e',0.00,'EXTR_CC.pdf; Joana 0778 page 7; archive preserved','https://drive.google.com/file/d/1FqL6DkTo0rVm5t4S7MPAWR2peBKG5eYb/view'),
('78a484e0-7f38-4748-a770-ead4b2306f27',0.00,'EXTR_CC.pdf; Irene 9267 page 9','https://drive.google.com/file/d/1FqL6DkTo0rVm5t4S7MPAWR2peBKG5eYb/view'),
('502cdadc-0918-4b56-b34c-78b51f3a5ed1',0.00,'EXTR_CC.pdf; Ricardo 9919 page 11','https://drive.google.com/file/d/1FqL6DkTo0rVm5t4S7MPAWR2peBKG5eYb/view'),
('a56398ea-e0f9-4435-8031-88637dd6d4d9',0.00,'BCP_VISA.pdf; Luis 4988002215317000 page 3','https://drive.google.com/file/d/1wNUGlkEbqG2aBsKDAuALHb7CMz7xo4pO/view'),
('9a63a8ee-eccd-4347-bea9-532ab0dfbde3',1870.75,'Coverflex June 01–30/06/2026 statement page 1; ES2767071000640145181691','https://drive.google.com/file/d/16Rdlo7_yEUxgNwtfKV_ydouE9hWF7bnX/view')
) v(id,balance,document,url) ON a.id=v.id
WHERE (a.opening_balance,a.opening_balance_date) IS DISTINCT FROM (v.balance,'2026-05-31'::date);
UPDATE public.bank_accounts a SET opening_balance=(l.after_changes->>'opening_balance')::numeric,opening_balance_date='2026-05-31'
FROM public.bank_balance_correction_audit l WHERE l.record_table='bank_accounts' AND l.record_id=a.id AND l.created_at=transaction_timestamp()
AND l.actor_id='ab5a48c0-939b-4502-bd3b-db7801f0f8b8';
INSERT INTO public.bank_balance_correction_audit(entity_id,record_table,record_id,before_row,after_changes,source_document,source_url,reason,actor_id,actor_email)
SELECT t.entity_id,'bank_transactions',t.id,to_jsonb(t),jsonb_build_object('transaction_date','2026-06-01'),
'EXTR_006_2026.pdf; CGD 007/2026 page 1','https://drive.google.com/file/d/1IbpdV16RbUC5L3hlq6BL-HrnPSANn76e/view',
'Luis confirmed PDF movement date 01/06; raw import timestamp 31/05 23:00 UTC was Lisbon 01/06. Amount/classification/reconciliation unchanged.',
'ab5a48c0-939b-4502-bd3b-db7801f0f8b8','luis@pedrasilva.com'
FROM public.bank_transactions t WHERE id='6bfa8c0a-e52b-4433-88c2-01f2c6cd3e2c' AND transaction_date='2026-05-31' AND amount=-6.70;
UPDATE public.bank_transactions SET transaction_date='2026-06-01' WHERE id='6bfa8c0a-e52b-4433-88c2-01f2c6cd3e2c' AND transaction_date='2026-05-31' AND amount=-6.70;
-- Bernardo's misplaced +29.99/+10.00 cannot move: both exact checksums already
-- exist in Bernardo as ignored copies; negative purchases exist there too.
-- Preserve all copies, amounts/statuses/imports pending duplicate decision.
INSERT INTO public.bank_balance_correction_audit(entity_id,record_table,record_id,before_row,after_changes,source_document,source_url,reason,actor_id,actor_email)
SELECT t.entity_id,'bank_transactions',t.id,to_jsonb(t),'{}'::jsonb,'EXTR_CC.pdf; Bernardo 3964 page 5','https://drive.google.com/file/d/1FqL6DkTo0rVm5t4S7MPAWR2peBKG5eYb/view',
'Verified misplaced card purchase; move withheld: exact account/checksum copy already exists in Bernardo (ignored) plus negative purchase. No deletion, new checksum, status change or reconciliation authorized.',
'ab5a48c0-939b-4502-bd3b-db7801f0f8b8','luis@pedrasilva.com'
FROM public.bank_transactions t WHERE id IN ('75bc825e-b504-4bbd-ba05-8e5606be8728','7914932e-e0ba-490b-9cb2-6a657822a5ab')
AND NOT EXISTS(SELECT 1 FROM public.bank_balance_correction_audit l WHERE l.record_id=t.id);
COMMIT;