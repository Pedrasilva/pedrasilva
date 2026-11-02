\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','ab5a48c0-939b-4502-bd3b-db7801f0f8b8',true);
CREATE TEMP TABLE pe_fixture(k text PRIMARY KEY,id uuid);
INSERT INTO pe_fixture VALUES ('project',gen_random_uuid()),('project2',gen_random_uuid()),('payer',gen_random_uuid()),('bank',gen_random_uuid()),('client',gen_random_uuid());
INSERT INTO companies(id,nome,is_client) SELECT id,'[DISPOSABLE EXPENSE FIXTURE] client',true FROM pe_fixture WHERE k='client';
INSERT INTO pm_projects(id,name,status,company_id) SELECT id,'[DISPOSABLE EXPENSE FIXTURE] '||k,'active',(SELECT id FROM pe_fixture WHERE k='client') FROM pe_fixture WHERE k IN ('project','project2');
INSERT INTO collaborators(id,nome,email) SELECT id,'[DISPOSABLE EXPENSE FIXTURE] payer','pe-fixture@example.invalid' FROM pe_fixture WHERE k='payer';
INSERT INTO bank_accounts(id,account_name,entity_id) SELECT id,'[DISPOSABLE EXPENSE FIXTURE] bank','00000000-0000-4000-a000-000000000001' FROM pe_fixture WHERE k='bank';
-- Full validation is implemented in mirrored migration 0207, always raises
-- PE_FIXTURE_ROLLBACK_SUCCESS after assertions; disabled by migration 0212.
-- Re-enabling requires an explicit temporary migration and immediate revocation.
ROLLBACK;
