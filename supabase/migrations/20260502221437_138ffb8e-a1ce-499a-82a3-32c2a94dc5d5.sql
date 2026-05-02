
-- Admin-only project test data reset RPC
CREATE OR REPLACE FUNCTION public.reset_project_test_data(_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_counts jsonb;
  v_del_hist int;
  v_del_jobs int;
  v_del_projects int;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _confirm IS DISTINCT FROM 'DELETE TEST PROJECT DATA' THEN
    RAISE EXCEPTION 'confirmation_required' USING DETAIL = 'Pass the exact string DELETE TEST PROJECT DATA to confirm.';
  END IF;

  SELECT jsonb_build_object(
    'pm_time_entries', (SELECT count(*) FROM public.pm_time_entries WHERE entry_type = 'project'),
    'historical_time_entries', (SELECT count(*) FROM public.historical_time_entries),
    'pm_expenses', (SELECT count(*) FROM public.pm_expenses),
    'pm_materials', (SELECT count(*) FROM public.pm_materials),
    'pm_invoices', (SELECT count(*) FROM public.pm_invoices),
    'pm_tasks', (SELECT count(*) FROM public.pm_tasks),
    'pm_stages', (SELECT count(*) FROM public.pm_stages),
    'pm_projects', (SELECT count(*) FROM public.pm_projects),
    'import_jobs', (SELECT count(*) FROM public.import_jobs WHERE import_type = 'accelo_activity_timesheet')
  ) INTO v_counts;

  -- Wipe historical time (FK is SET NULL on project, won't cascade)
  DELETE FROM public.historical_time_entries;
  GET DIAGNOSTICS v_del_hist = ROW_COUNT;

  -- Wipe Accelo activity import jobs (cascades to import_job_rows)
  DELETE FROM public.import_jobs WHERE import_type = 'accelo_activity_timesheet';
  GET DIAGNOSTICS v_del_jobs = ROW_COUNT;

  -- Delete projects — CASCADE clears pm_stages, pm_allocations, pm_tasks,
  -- pm_time_entries (project-typed via task), pm_expenses, pm_materials,
  -- pm_invoices, pm_invoice_settings, pm_project_rate_overrides, pm_activities.
  -- financial_documents.project_id, financial_document_lines.project_id,
  -- bank_transaction_classifications.project_id, fee_proposals.pm_project_id
  -- and historical_time_entries.project_id are SET NULL (preserving finance data).
  DELETE FROM public.pm_projects;
  GET DIAGNOSTICS v_del_projects = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'ok',
    'counts_before', v_counts,
    'deleted', jsonb_build_object(
      'historical_time_entries', v_del_hist,
      'import_jobs', v_del_jobs,
      'pm_projects', v_del_projects
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_project_test_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_project_test_data(text) TO authenticated;

-- Admin-only hard delete a single project, blocked if linked records exist
CREATE OR REPLACE FUNCTION public.delete_project_hard(_project_id uuid, _confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_counts jsonb;
  v_total int;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _confirm IS DISTINCT FROM 'DELETE PROJECT' THEN
    RAISE EXCEPTION 'confirmation_required' USING DETAIL = 'Pass the exact string DELETE PROJECT to confirm.';
  END IF;

  SELECT jsonb_build_object(
    'pm_stages', (SELECT count(*) FROM public.pm_stages WHERE project_id = _project_id),
    'pm_tasks', (SELECT count(*) FROM public.pm_tasks t
                 JOIN public.pm_allocations a ON a.id = t.allocation_id
                 JOIN public.pm_stages s ON s.id = a.stage_id
                 WHERE s.project_id = _project_id),
    'pm_time_entries', (SELECT count(*) FROM public.pm_time_entries te
                        JOIN public.pm_tasks t ON t.id = te.task_id
                        JOIN public.pm_allocations a ON a.id = t.allocation_id
                        JOIN public.pm_stages s ON s.id = a.stage_id
                        WHERE s.project_id = _project_id),
    'historical_time_entries', (SELECT count(*) FROM public.historical_time_entries WHERE project_id = _project_id),
    'pm_expenses', (SELECT count(*) FROM public.pm_expenses WHERE project_id = _project_id),
    'pm_materials', (SELECT count(*) FROM public.pm_materials WHERE project_id = _project_id),
    'pm_invoices', (SELECT count(*) FROM public.pm_invoices WHERE project_id = _project_id),
    'financial_documents', (SELECT count(*) FROM public.financial_documents WHERE project_id = _project_id),
    'financial_document_lines', (SELECT count(*) FROM public.financial_document_lines WHERE project_id = _project_id),
    'import_job_rows', 0
  ) INTO v_counts;

  SELECT (v_counts->>'pm_stages')::int + (v_counts->>'pm_tasks')::int
       + (v_counts->>'pm_time_entries')::int + (v_counts->>'historical_time_entries')::int
       + (v_counts->>'pm_expenses')::int + (v_counts->>'pm_materials')::int
       + (v_counts->>'pm_invoices')::int + (v_counts->>'financial_documents')::int
       + (v_counts->>'financial_document_lines')::int
  INTO v_total;

  IF v_total > 0 THEN
    RETURN jsonb_build_object('status', 'blocked', 'dependencies', v_counts);
  END IF;

  DELETE FROM public.pm_projects WHERE id = _project_id;
  RETURN jsonb_build_object('status', 'deleted');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_hard(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_hard(uuid, text) TO authenticated;

-- Project dependency counts (any authenticated user with project visibility)
CREATE OR REPLACE FUNCTION public.project_dependency_counts(_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pm_stages', (SELECT count(*) FROM public.pm_stages WHERE project_id = _project_id),
    'pm_tasks', (SELECT count(*) FROM public.pm_tasks t
                 JOIN public.pm_allocations a ON a.id = t.allocation_id
                 JOIN public.pm_stages s ON s.id = a.stage_id
                 WHERE s.project_id = _project_id),
    'pm_time_entries', (SELECT count(*) FROM public.pm_time_entries te
                        JOIN public.pm_tasks t ON t.id = te.task_id
                        JOIN public.pm_allocations a ON a.id = t.allocation_id
                        JOIN public.pm_stages s ON s.id = a.stage_id
                        WHERE s.project_id = _project_id),
    'historical_time_entries', (SELECT count(*) FROM public.historical_time_entries WHERE project_id = _project_id),
    'pm_expenses', (SELECT count(*) FROM public.pm_expenses WHERE project_id = _project_id),
    'pm_materials', (SELECT count(*) FROM public.pm_materials WHERE project_id = _project_id),
    'pm_invoices', (SELECT count(*) FROM public.pm_invoices WHERE project_id = _project_id),
    'financial_documents', (SELECT count(*) FROM public.financial_documents WHERE project_id = _project_id),
    'financial_document_lines', (SELECT count(*) FROM public.financial_document_lines WHERE project_id = _project_id)
  );
$$;

REVOKE ALL ON FUNCTION public.project_dependency_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_dependency_counts(uuid) TO authenticated;
