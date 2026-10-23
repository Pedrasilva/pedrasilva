BEGIN;
-- Disposable accounts only; all rows roll back.
INSERT INTO public.bank_accounts(id,entity_id,account_name,account_kind,opening_balance,opening_balance_date)
VALUES('ffffffff-ffff-4000-a000-000000000101','00000000-0000-4000-a000-000000000001','TEST June opening','bank',48548.51,'2026-05-31');
INSERT INTO public.bank_transactions(id,entity_id,bank_account_id,transaction_date,description,amount,row_checksum,reconciled_at)
VALUES('ffffffff-ffff-4000-a000-000000000102','00000000-0000-4000-a000-000000000001','ffffffff-ffff-4000-a000-000000000101','2026-06-01','TEST first debit',-70.04,'test-june-first',now()),
('ffffffff-ffff-4000-a000-000000000103','00000000-0000-4000-a000-000000000001','ffffffff-ffff-4000-a000-000000000101','2026-06-30','TEST remainder',-19494.09,'test-june-remainder',now());
DO $$ BEGIN
 IF public.bank_account_calculated_balance('ffffffff-ffff-4000-a000-000000000101','2026-06-30')<>28984.38 THEN RAISE EXCEPTION 'June cut-off must include 01 June exactly once'; END IF;
 IF (SELECT count(*) FROM bank_transactions WHERE bank_account_id='ffffffff-ffff-4000-a000-000000000101' AND transaction_date>'2026-05-31')<>2 THEN RAISE EXCEPTION 'cut-off count'; END IF;
 BEGIN
  UPDATE bank_transactions SET transaction_date='2026-06-02' WHERE id='ffffffff-ffff-4000-a000-000000000102';
  RAISE EXCEPTION 'unexpected raw-date edit allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='unexpected raw-date edit allowed' THEN RAISE; END IF; END;
END $$;
ROLLBACK;