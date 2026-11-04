BEGIN;
SELECT set_config('app.pe_action','1',true),set_config('app.pm_expense_rpc','1',true);
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda' AND name='[QA DISPOSABLE] Expense lists 2026-11-04') THEN RAISE EXCEPTION 'Exact fixture missing'; END IF;
IF EXISTS(SELECT 1 FROM public.pm_expenses WHERE project_id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda' AND id NOT IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327')) OR EXISTS(SELECT 1 FROM public.pm_stages WHERE project_id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda') OR EXISTS(SELECT 1 FROM public.financial_documents WHERE project_id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda') THEN RAISE EXCEPTION 'Unexpected fixture references'; END IF;
IF EXISTS(SELECT 1 FROM public.project_reimbursement_allocations WHERE batch_id='de387ea7-b9ba-46e4-aa57-7b4c8891f0cc' AND (bank_transaction_id IS NOT NULL OR obligation_id NOT IN (SELECT id FROM public.finance_holder_reimbursements WHERE project_expense_id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327')))) THEN RAISE EXCEPTION 'Unexpected reimbursement evidence'; END IF;
END $$;
DELETE FROM public.project_reimbursement_allocations WHERE batch_id='de387ea7-b9ba-46e4-aa57-7b4c8891f0cc' AND bank_transaction_id IS NULL;
DELETE FROM public.project_reimbursement_batches WHERE id='de387ea7-b9ba-46e4-aa57-7b4c8891f0cc';
DELETE FROM public.finance_holder_reimbursements WHERE project_expense_id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327');
DELETE FROM public.notifications WHERE entity_id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327');
DELETE FROM public.project_expense_events WHERE expense_id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327');
UPDATE public.pm_expenses SET workflow_version=1 WHERE project_id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda' AND id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327') AND workflow_version=2;
DELETE FROM public.pm_expenses WHERE project_id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda' AND id IN ('1bca3ca5-aeca-4365-88fb-aa1b69039fb8','131c16a6-30dc-4779-8e49-b251b9f796d5','ce633415-67aa-4b73-96dc-cf891ba1f327') AND workflow_version=1;
DELETE FROM public.pm_projects WHERE id='b8151c99-a62e-4e4a-b1f5-a53dc2ecbfda' AND name='[QA DISPOSABLE] Expense lists 2026-11-04';
COMMIT;
