\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE fixture_ids(k text primary key,id uuid);
INSERT INTO fixture_ids VALUES('project',gen_random_uuid()),('collaborator',gen_random_uuid()),('account',gen_random_uuid());
INSERT INTO pm_projects(id,name,status) SELECT id,'[DISPOSABLE FIXTURE] expense flow','active' FROM fixture_ids WHERE k='project';
INSERT INTO collaborators(id,nome,email) SELECT id,'[DISPOSABLE FIXTURE] payer','expense-fixture@example.invalid' FROM fixture_ids WHERE k='collaborator';
INSERT INTO bank_accounts(id,account_name,entity_id) SELECT id,'[DISPOSABLE FIXTURE] bank','00000000-0000-4000-a000-000000000001' FROM fixture_ids WHERE k='account';
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM user_roles WHERE role='admin' LIMIT 1),true);
SELECT pe_directory(null) IS NOT NULL AS directory_ok;
DO $$ DECLARE p uuid:=(SELECT id FROM fixture_ids WHERE k='project'); c uuid:=(SELECT id FROM fixture_ids WHERE k='collaborator'); r jsonb; eid uuid; bid uuid; tx uuid; act text; BEGIN
 r:=pe_action('save',jsonb_build_object('projectId',p,'description','[DISPOSABLE FIXTURE] train','currency','EUR','originalAmount',100,'paidBy','personal','collaboratorId',c,'rebillMode','markup','markupPct',20)); eid:=(r->>'id')::uuid;
 IF (SELECT tax_treatment FROM pm_expenses WHERE id=eid)<>'pending' THEN RAISE EXCEPTION 'Tax default wrong'; END IF;
 IF EXISTS(SELECT 1 FROM finance_holder_reimbursements WHERE project_expense_id=eid) THEN RAISE EXCEPTION 'Premature obligation'; END IF;
 PERFORM pe_action('submit',jsonb_build_object('expenseId',eid));
 IF EXISTS(SELECT 1 FROM finance_holder_reimbursements WHERE project_expense_id=eid) THEN RAISE EXCEPTION 'Unapproved reimbursable'; END IF;
 PERFORM pe_action('decide',jsonb_build_object('expenseId',eid,'approve',true));
 SELECT pe_action('batch',jsonb_build_object('collaboratorId',c,'obligationIds',jsonb_build_array(id)))->>'id' INTO act FROM finance_holder_reimbursements WHERE project_expense_id=eid; bid:=act::uuid;
 INSERT INTO bank_transactions(bank_account_id,entity_id,transaction_date,description,amount,row_checksum) VALUES((SELECT id FROM fixture_ids WHERE k='account'),'00000000-0000-4000-a000-000000000001','2026-11-02','[DISPOSABLE FIXTURE] reimbursement',-100,gen_random_uuid()::text) RETURNING id INTO tx;
 IF (SELECT count(*) FROM fin_reconcile_candidates(tx,null) WHERE kind='reimbursement_batch' AND ref_id=bid)<>1 THEN RAISE EXCEPTION 'Duplicate/missing candidate'; END IF;
 PERFORM pe_action('settleBatch',jsonb_build_object('batchId',bid,'transactionId',tx,'amount',100));
 IF fin_tx_open_balance(tx)<>0 OR (SELECT status FROM pm_expenses WHERE id=eid)<>'paid' THEN RAISE EXCEPTION 'Settlement wrong'; END IF;
 BEGIN PERFORM pe_action('settleBatch',jsonb_build_object('batchId',bid,'transactionId',tx,'amount',100)); RAISE EXCEPTION 'Double settlement admitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Double settlement admitted' THEN RAISE; END IF; END;
 RAISE NOTICE 'Passed: tax default, preapproval exclusion, approval, single-person batch, unique candidate, settlement, no double payment'; END $$;
ROLLBACK;
