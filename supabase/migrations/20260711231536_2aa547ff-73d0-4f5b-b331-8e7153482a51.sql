CREATE OR REPLACE FUNCTION public._restore_project_0410b(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  result jsonb;
  cols text;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO pm_stages SELECT * FROM jsonb_populate_recordset(NULL::pm_stages, payload->'pm_stages') ON CONFLICT (id) DO NOTHING;
  INSERT INTO pm_allocations SELECT * FROM jsonb_populate_recordset(NULL::pm_allocations, payload->'pm_allocations') ON CONFLICT (id) DO NOTHING;
  UPDATE pm_tasks p SET id = (m->>'orig')::uuid
    FROM jsonb_array_elements(payload->'task_map') m
    WHERE p.allocation_id = (m->>'alloc')::uuid AND p.id <> (m->>'orig')::uuid;
  INSERT INTO pm_time_entries SELECT * FROM jsonb_populate_recordset(NULL::pm_time_entries, payload->'pm_time_entries') ON CONFLICT (id) DO NOTHING;

  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_documents' AND is_generated='NEVER';
  EXECUTE format(
    'INSERT INTO financial_documents (%s) SELECT %s FROM jsonb_populate_recordset(NULL::financial_documents, $1) ON CONFLICT (id) DO NOTHING',
    cols, cols
  ) USING payload->'financial_documents';

  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_document_lines' AND is_generated='NEVER';
  EXECUTE format(
    'INSERT INTO financial_document_lines (%s) SELECT %s FROM jsonb_populate_recordset(NULL::financial_document_lines, $1) ON CONFLICT (id) DO NOTHING',
    cols, cols
  ) USING payload->'financial_document_lines';

  SELECT jsonb_build_object(
    'stages', (SELECT count(*) FROM pm_stages WHERE project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e'),
    'allocations', (SELECT count(*) FROM pm_allocations WHERE stage_id IN (SELECT id FROM pm_stages WHERE project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e')),
    'time_entries', (SELECT count(*) FROM pm_time_entries WHERE task_id IN (SELECT t.id FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e')),
    'hours', (SELECT COALESCE(SUM(hours),0) FROM pm_time_entries WHERE task_id IN (SELECT t.id FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e'))
  ) INTO result;
  RETURN result;
END $$;