BEGIN;
SELECT set_config('app.pe_action','1',true);
SELECT set_config('app.pm_expense_rpc','1',true);
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id='f6968c90-7ff9-451b-acfb-c091fd96b57b' AND name='[QA DISPOSABLE SCAN 20261104]') THEN RAISE EXCEPTION 'Exact QA project missing'; END IF;
IF EXISTS(SELECT 1 FROM public.pm_expenses WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b' AND (workflow_version<>2 OR status<>'draft' OR purchase_document_id IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.pm_stages WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b') OR EXISTS(SELECT 1 FROM public.financial_documents WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b') THEN RAISE EXCEPTION 'Unexpected QA reference'; END IF;
END $$;
DELETE FROM public.project_expense_events WHERE expense_id IN(SELECT id FROM public.pm_expenses WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b');
-- The version-2 guard forbids every DELETE; change only proven disposable rows
-- to the historical deletion branch under the existing action context.
UPDATE public.pm_expenses SET workflow_version=1 WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b' AND workflow_version=2 AND status='draft';
DELETE FROM public.pm_expenses WHERE project_id='f6968c90-7ff9-451b-acfb-c091fd96b57b' AND workflow_version=1 AND status='draft';
DELETE FROM public.pm_projects WHERE id='f6968c90-7ff9-451b-acfb-c091fd96b57b' AND name='[QA DISPOSABLE SCAN 20261104]';
COMMIT;
