BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pm_projects WHERE quote_id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd') OR EXISTS(SELECT 1 FROM contracts WHERE source_quote_id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd') OR NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd' AND titulo='[QA DISPOSABLE] isolated composer') THEN RAISE EXCEPTION 'Unsafe fixture cleanup'; END IF; END $$;
UPDATE fee_proposals SET main_proposal_id=NULL WHERE id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd';
DELETE FROM psa_proposals WHERE id='6fc175b4-3a96-41c2-a24e-1330160a5435' AND quote_id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd';
DELETE FROM fee_proposals WHERE id='102948d5-d0ea-46e7-88cb-7a8aa2a488bd' AND titulo='[QA DISPOSABLE] isolated composer';
COMMIT;
