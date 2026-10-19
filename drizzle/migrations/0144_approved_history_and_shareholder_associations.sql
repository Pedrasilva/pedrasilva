-- Authorized by Luis 2026-10-19; original document/payment evidence is preserved.
BEGIN;
DO $$
DECLARE docs_before jsonb; payments_before jsonb; counters_before jsonb;
BEGIN
 SELECT jsonb_agg(to_jsonb(d)-ARRAY['project_id','not_project_related','updated_at','original_document_id','sales_excluded','sales_exclusion_reason','shareholder_debt_id','classification_id'] ORDER BY id) INTO docs_before FROM public.financial_documents d;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO payments_before FROM public.financial_document_payments p;
 SELECT jsonb_agg(to_jsonb(c)) INTO counters_before FROM public.fee_proposal_number_counters c;
 IF EXISTS(SELECT 1 FROM public.pm_projects WHERE id='59f3a882-a593-42b1-a658-56bd9741f373' AND company_id IS NOT NULL AND company_id<>'4b1f8307-6a51-4851-8836-93f96c45746b') THEN RAISE EXCEPTION 'Quelhas client conflict'; END IF;
 INSERT INTO public.pm_projects(id,name,client,company_id,start_date,status,origin,finance_only,notes) VALUES
 ('a7190001-0000-4000-a000-000000000001','Consultoria Greg Freeman','Serenity Legend Lda','bbb20141-7ac2-43ca-80d0-8171c55fc938','2026-05-20','archived','direct',true,'Historical document container authorized by Luis; date is receipt date, not actual project start. Separate from current Greg Freemon new-project CRM lead.'),
 ('a7190001-0000-4000-a000-000000000002','Projeto histórico N10GLED','N10GLED LDA','55c058fa-83ee-40a1-af38-282c5666b0e1','2026-05-20','archived','direct',true,'Historical closed work; receipt date is administrative only.'),
 ('a7190001-0000-4000-a000-000000000003','Escritório Sakur Dubai','ZORION TRADING (L.L.C)','b4182356-76b3-431b-8612-bdd2408b8e4e','2026-06-05','archived','direct',true,'Completed early 2026; receipt date is administrative only.'),
 ('a7190001-0000-4000-a000-000000000004','Projeto histórico Museu Zer0 / ILC','Museu Zer0: // centro de arte digital - ILC','af7c8b05-cb70-4124-8a29-f43fccd6972a','2026-09-30','archived','direct',true,'Old project overdue payment; invoice date is administrative only.');
 UPDATE public.pm_projects SET company_id=coalesce(company_id,'4b1f8307-6a51-4851-8836-93f96c45746b'::uuid),client=CASE WHEN nullif(btrim(client),'') IS NULL THEN 'Associação Nossa Senhora Consoladora dos Aflitos' ELSE client END WHERE id='59f3a882-a593-42b1-a658-56bd9741f373';
 UPDATE public.financial_documents d SET project_id=v.pid,not_project_related=false FROM (VALUES
 ('1e4d5c7e-4ff0-4f50-b2ce-cf252e4e6973'::uuid,'a7190001-0000-4000-a000-000000000001'::uuid),
 ('25febd3a-b9c9-439a-bbc9-93afec30a1e4'::uuid,'a7190001-0000-4000-a000-000000000002'::uuid),
 ('6ac7c13d-2074-4d89-8f65-a916f96cd8a5'::uuid,'a7190001-0000-4000-a000-000000000003'::uuid),
 ('7eaf05d3-a7bd-4cb2-9c0d-7b9f734ee2f7'::uuid,'59f3a882-a593-42b1-a658-56bd9741f373'::uuid),
 ('dc5b418d-dc5c-49c9-8cb8-df5e0a8147bd'::uuid,'59f3a882-a593-42b1-a658-56bd9741f373'::uuid),
 ('60abbb81-8197-4545-8cd7-4bb5f35b3943'::uuid,'a7190001-0000-4000-a000-000000000004'::uuid)
 ) v(id,pid) WHERE d.id=v.id AND d.project_id IS NULL AND d.direction='issued' AND d.status NOT IN ('draft','cancelled');
 UPDATE public.financial_documents SET original_document_id='7eaf05d3-a7bd-4cb2-9c0d-7b9f734ee2f7' WHERE id='dc5b418d-dc5c-49c9-8cb8-df5e0a8147bd' AND original_document_id IS NULL;
 INSERT INTO public.financial_debts(id,creditor_name,description,original_amount,outstanding_amount,status,start_date,notes,entity_id) VALUES ('a7190002-0000-4000-a000-000000000001','Luis Pedra Silva','Suprimentos do sócio — transferências 30/07 e 18/08/2026',30000,30000,'open','2026-07-30','Authorized by Luis. Two EUR15000 inflows; bank references remain on original document payments. No reimbursement assumed.','00000000-0000-4000-a000-000000000001');
 UPDATE public.financial_documents SET sales_excluded=true,sales_exclusion_reason='Suprimentos do sócio confirmados por Luis em 19/10/2026; não são vendas.',shareholder_debt_id='a7190002-0000-4000-a000-000000000001',classification_id='f45549a9-9c7d-4c49-b8ee-7f5c26ff7856' WHERE id IN ('232a6769-cdf2-4c7f-848f-2a22203c9bfb','1412460c-9900-4cbb-83c5-1b83855d4d23') AND doc_type='receipt' AND total_inc_vat=15000 AND paid_amount=15000 AND entity_id='00000000-0000-4000-a000-000000000001';
 INSERT INTO public.bank_transaction_classifications(bank_transaction_id,classification_id,amount,notes) VALUES
 ('3690e425-117f-40f0-961a-d79edc74f087','f45549a9-9c7d-4c49-b8ee-7f5c26ff7856',15000,'Suprimentos Luis Pedra Silva — confirmed 19/10/2026; debt a7190002-0000-4000-a000-000000000001'),
 ('05ae3a4b-9a2c-49d7-bee2-309507279576','f45549a9-9c7d-4c49-b8ee-7f5c26ff7856',15000,'Suprimentos Luis Pedra Silva — confirmed 19/10/2026; debt a7190002-0000-4000-a000-000000000001');
 IF docs_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d)-ARRAY['project_id','not_project_related','updated_at','original_document_id','sales_excluded','sales_exclusion_reason','shareholder_debt_id','classification_id'] ORDER BY id) FROM public.financial_documents d) THEN RAISE EXCEPTION 'Original document values changed'; END IF;
 IF payments_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.financial_document_payments p) THEN RAISE EXCEPTION 'Payments changed'; END IF;
 IF counters_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c)) FROM public.fee_proposal_number_counters c) THEN RAISE EXCEPTION 'Proposal counter changed'; END IF;
 IF (SELECT count(*) FROM public.financial_documents WHERE shareholder_debt_id='a7190002-0000-4000-a000-000000000001')<>2 THEN RAISE EXCEPTION 'Shareholder loan evidence incomplete'; END IF;
END $$;
COMMIT;
