CREATE OR REPLACE FUNCTION public._restore_project_0410b(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO pm_stages SELECT * FROM jsonb_populate_recordset(NULL::pm_stages, payload->'pm_stages');
  INSERT INTO pm_allocations SELECT * FROM jsonb_populate_recordset(NULL::pm_allocations, payload->'pm_allocations');
  UPDATE pm_tasks p SET id = (m->>'orig')::uuid
    FROM jsonb_array_elements(payload->'task_map') m
    WHERE p.allocation_id = (m->>'alloc')::uuid AND p.id <> (m->>'orig')::uuid;
  INSERT INTO pm_time_entries SELECT * FROM jsonb_populate_recordset(NULL::pm_time_entries, payload->'pm_time_entries');

  -- financial_documents: skip generated columns vat_period, outstanding_amount
  INSERT INTO financial_documents (id, org_id, project_id, doc_type, doc_number, series, issue_date, due_date, currency, exchange_rate, subtotal, vat_amount, total_amount, paid_amount, status, party_type, party_id, party_name, party_tax_id, party_address, notes, external_id, source, source_url, storage_path, storage_bucket, created_at, updated_at, created_by, updated_by, cancelled_at, cancelled_reason, vat_country, is_reverse_charge, imported_at, imported_from, invoice_meta, service_period_start, service_period_end)
    SELECT id, org_id, project_id, doc_type, doc_number, series, issue_date, due_date, currency, exchange_rate, subtotal, vat_amount, total_amount, paid_amount, status, party_type, party_id, party_name, party_tax_id, party_address, notes, external_id, source, source_url, storage_path, storage_bucket, created_at, updated_at, created_by, updated_by, cancelled_at, cancelled_reason, vat_country, is_reverse_charge, imported_at, imported_from, invoice_meta, service_period_start, service_period_end
    FROM jsonb_populate_recordset(NULL::financial_documents, payload->'financial_documents');

  INSERT INTO financial_document_lines (id, document_id, line_no, description, quantity, unit_price, vat_rate, discount_pct, project_id, category_id, resource_id, external_id, created_at, updated_at)
    SELECT id, document_id, line_no, description, quantity, unit_price, vat_rate, discount_pct, project_id, category_id, resource_id, external_id, created_at, updated_at
    FROM jsonb_populate_recordset(NULL::financial_document_lines, payload->'financial_document_lines');

  SELECT jsonb_build_object(
    'stages', (SELECT count(*) FROM pm_stages WHERE project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e'),
    'allocations', (SELECT count(*) FROM pm_allocations WHERE stage_id IN (SELECT id FROM pm_stages WHERE project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e')),
    'time_entries', (SELECT count(*) FROM pm_time_entries WHERE task_id IN (SELECT t.id FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e')),
    'hours', (SELECT COALESCE(SUM(hours),0) FROM pm_time_entries WHERE task_id IN (SELECT t.id FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id='3775332d-48e7-4042-8ec2-8bde1d475d8e'))
  ) INTO result;
  RETURN result;
END $$;