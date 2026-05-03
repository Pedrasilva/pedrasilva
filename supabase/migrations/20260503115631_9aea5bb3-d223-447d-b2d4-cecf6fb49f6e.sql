CREATE OR REPLACE FUNCTION public.delete_project_hard(_project_id uuid, _confirm text, _cascade boolean DEFAULT false)
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

  IF v_total > 0 AND NOT _cascade THEN
    RETURN jsonb_build_object('status', 'blocked', 'dependencies', v_counts);
  END IF;

  IF _cascade THEN
    DELETE FROM public.pm_time_entries te
      USING public.pm_tasks t, public.pm_allocations a, public.pm_stages s
      WHERE te.task_id = t.id AND t.allocation_id = a.id AND a.stage_id = s.id AND s.project_id = _project_id;
    DELETE FROM public.pm_tasks t
      USING public.pm_allocations a, public.pm_stages s
      WHERE t.allocation_id = a.id AND a.stage_id = s.id AND s.project_id = _project_id;
    DELETE FROM public.pm_allocations a
      USING public.pm_stages s
      WHERE a.stage_id = s.id AND s.project_id = _project_id;
    DELETE FROM public.pm_stages WHERE project_id = _project_id;
    DELETE FROM public.historical_time_entries WHERE project_id = _project_id;
    DELETE FROM public.pm_expenses WHERE project_id = _project_id;
    DELETE FROM public.pm_materials WHERE project_id = _project_id;
    DELETE FROM public.pm_invoices WHERE project_id = _project_id;
    DELETE FROM public.financial_document_lines WHERE project_id = _project_id;
    UPDATE public.financial_documents SET project_id = NULL WHERE project_id = _project_id;
  END IF;

  DELETE FROM public.pm_projects WHERE id = _project_id;
  RETURN jsonb_build_object('status', 'deleted', 'cascaded', _cascade, 'removed', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_hard(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_hard(uuid, text, boolean) TO authenticated;