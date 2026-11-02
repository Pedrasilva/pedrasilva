BEGIN;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-a000-000000000001',true);
DO $$ DECLARE p uuid:=gen_random_uuid(); card uuid:=gen_random_uuid(); ex uuid; data jsonb; BEGIN
INSERT INTO pm_projects(id,name,status) VALUES(p,'[DISPOSABLE BUG FIXTURE] card project','active');
INSERT INTO payment_cards(id,entity_id,holder_name,last4) VALUES(card,'00000000-0000-4000-a000-000000000001','[DISPOSABLE BUG FIXTURE] company card','0223');
data:=jsonb_build_object('projectId',p,'description','[DISPOSABLE BUG FIXTURE] GBP card receipt','currency','GBP','originalAmount',53.80,'eurAmount',63.70,'exchangeSource','fixture receipt evidence','exchangeDate','2026-11-02','exchangeEvidence',jsonb_build_object('reference','fixture'),'paidBy','company_card','cardId',card,'receiptPath','fixture/card.jpg','rebillMode','cost');
ex:=(pe_action('save',data)->>'id')::uuid;
PERFORM pe_action('save',data||jsonb_build_object('expenseId',ex,'description','[DISPOSABLE BUG FIXTURE] edited receipt'));
IF (SELECT receipt_path FROM pm_expenses WHERE id=ex)<>'fixture/card.jpg' OR (SELECT eur_amount FROM pm_expenses WHERE id=ex)<>63.70 THEN RAISE EXCEPTION 'Company receipt edit changed amount or receipt'; END IF;
PERFORM pe_action('submit',jsonb_build_object('expenseId',ex));
IF NOT EXISTS(SELECT 1 FROM pm_expenses WHERE id=ex AND status='submitted' AND approval_state='not_required') THEN RAISE EXCEPTION 'Company submit failed'; END IF;
PERFORM pe_action('save',data||jsonb_build_object('expenseId',ex));
PERFORM pe_action('submit',jsonb_build_object('expenseId',ex));
RAISE NOTICE 'PASS: existing company-card receipt save/edit/submit GBP 53.80 EUR 63.70';
END $$;
ROLLBACK;
