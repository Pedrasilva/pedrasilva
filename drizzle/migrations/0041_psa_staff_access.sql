-- Part B: close access that assumed every signed-in user is PSA staff.
CREATE OR REPLACE FUNCTION public.is_psa_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce(auth.role(),'') NOT IN ('authenticated','anon') THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.user_role_assignments r WHERE r.user_id = auth.uid() AND r.role::text = 'admin')
      OR EXISTS (SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email) WHERE u.id = auth.uid())
  END
$$;
GRANT EXECUTE ON FUNCTION public.is_psa_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_company_visible(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.financial_documents d WHERE (d.counterparty_supplier_id = _company_id OR d.counterparty_client_id = _company_id) AND d.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(d.entity_id))
      OR EXISTS (SELECT 1 FROM public.financial_document_review_queue q WHERE (q.matched_supplier_id = _company_id OR q.matched_client_id = _company_id) AND q.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(q.entity_id))
      OR EXISTS (SELECT 1 FROM public.financial_expense_items i WHERE i.supplier_id = _company_id AND i.entity_id <> '00000000-0000-4000-a000-000000000001' AND public.has_entity_access(i.entity_id))
$$;
GRANT EXECUTE ON FUNCTION public.fin_company_visible(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fin_storage_visible(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.financial_document_review_queue q WHERE (q.source_file_url = _name OR q.split_of_file_url = _name) AND public.has_entity_access(q.entity_id))
      OR EXISTS (SELECT 1 FROM public.financial_documents d WHERE d.file_path = _name AND public.has_entity_access(d.entity_id))
$$;
GRANT EXECUTE ON FUNCTION public.fin_storage_visible(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_finance_entity()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.entity_id FROM public.finance_entity_preferences p
      WHERE p.user_id = auth.uid() AND public.has_entity_access(p.entity_id)),
    (SELECT e.id FROM public.finance_entities e
      WHERE e.active AND public.has_entity_access(e.id)
      ORDER BY e.created_at, e.id LIMIT 1)
  )
$$;

-- 1. Policies that let any signed-in user in (USING true)
ALTER POLICY "Authenticated can read categories" ON public.benefit_categories USING (public.is_psa_staff());
ALTER POLICY "Authenticated read legacy aliases" ON public.benefit_category_legacy_aliases USING (public.is_psa_staff());
ALTER POLICY "Auth can read counters" ON public.fee_proposal_number_counters USING (public.is_psa_staff());
ALTER POLICY "Authenticated can read finance entities" ON public.finance_entities USING (public.is_psa_staff() OR public.has_entity_access(id));
ALTER POLICY "Authenticated read holidays" ON public.holidays USING (public.is_psa_staff());
ALTER POLICY "Authenticated read irs_tax_brackets" ON public.irs_tax_brackets USING (public.is_psa_staff());
ALTER POLICY "Authenticated read meal_allowance_rates" ON public.meal_allowance_rates USING (public.is_psa_staff());
ALTER POLICY "Authenticated read pm_internal_categories" ON public.pm_internal_categories USING (public.is_psa_staff());
ALTER POLICY "registry_read_addons" ON public.proposal_addon_modules USING (public.is_psa_staff());
ALTER POLICY "Authenticated read proposal_block_categories" ON public.proposal_block_categories USING (public.is_psa_staff());
ALTER POLICY "Authenticated read proposal_blocks" ON public.proposal_blocks USING (public.is_psa_staff());
ALTER POLICY "registry_read_commercial" ON public.proposal_commercial_components USING (public.is_psa_staff());
ALTER POLICY "registry_read_delivery_modes" ON public.proposal_delivery_modes USING (public.is_psa_staff());
ALTER POLICY "registry_read_families" ON public.proposal_families USING (public.is_psa_staff());
ALTER POLICY "registry_read_flags" ON public.proposal_flags USING (public.is_psa_staff());
ALTER POLICY "registry_read_aliases" ON public.proposal_phase_aliases USING (public.is_psa_staff());
ALTER POLICY "registry_read_phases" ON public.proposal_phases USING (public.is_psa_staff());
ALTER POLICY "registry_read_presets" ON public.proposal_presets USING (public.is_psa_staff());
ALTER POLICY "proposal_roles_read_authenticated" ON public.proposal_roles USING (public.is_psa_staff());
ALTER POLICY "psa_lib_read" ON public.psa_block_library USING (public.is_psa_staff());
ALTER POLICY "psa_image_library_read_authenticated" ON public.psa_image_library USING (public.is_psa_staff());
ALTER POLICY "Everyone reads WFH approvers" ON public.remote_work_approvers USING (public.is_psa_staff());
ALTER POLICY "Everyone reads WFH settings" ON public.remote_work_settings USING (public.is_psa_staff());

-- 2. Restrictive PSA-staff layer on every non-finance table (on top of existing rules)
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['backup_runs','benefit_balances','benefit_categories','benefit_category_legacy_aliases','benefit_drive_folders','benefit_expense_drive_sync','benefit_notification_queue','benefit_yearly_credits','bo_settings','calendar_dismissed_events','calendar_match_memory','collaborators','company_ibans','contacts','contract_clauses','contract_events','contract_exhibits','contracts','crm_accounts','crm_activities','crm_email_intake_gate','crm_email_lead_drafts','crm_email_threads','crm_opportunities','email_events','email_rules','email_sender_rules','email_sync_state','fee_proposal_audit_log','fee_proposal_number_counters','fee_proposals','finance_intake_deletion_log','finance_other_entities','historical_time_entries','holidays','import_identity_mappings','import_job_rows','import_jobs','inventory_asset_documents','inventory_asset_events','inventory_assets','inventory_assignments','inventory_categories','inventory_code_counters','inventory_kits','inventory_line_skips','inventory_managers','irs_tax_brackets','library_products','marketing_action_files','marketing_actions','marketing_bible_versions','marketing_capture_assets','marketing_capture_notes','marketing_captures','marketing_composition_comments','marketing_composition_slides','marketing_compositions','marketing_email_ignored','marketing_nudges','marketing_post_drafts','marketing_post_requests','marketing_project_briefings','marketing_project_media','marketing_project_press_kits','marketing_project_profiles','marketing_project_story_suggestions','meal_allowance_rates','opportunity_activities','pending_user_permissions','pm_activities','pm_activity_replies','pm_allocations','pm_cost_rate_periods','pm_cost_rate_rebuild_queue','pm_cost_rate_recalc_log','pm_expenses','pm_hours_bank_audit','pm_hours_bank_entries','pm_internal_categories','pm_invoice_items','pm_materials','pm_project_commercial_baselines','pm_project_contract_baseline','pm_project_contract_baseline_payments','pm_project_contract_baseline_stages','pm_project_forecast_metrics','pm_project_notes','pm_project_rate_overrides','pm_project_team','pm_projects','pm_resource_allocations_forecast','pm_resource_rates','pm_resources','pm_stage_allocation_placeholders','pm_stage_capacity_snapshots','pm_stage_commercial_baselines','pm_stage_dependencies','pm_stage_supplier_costs','pm_stages','pm_tasks','pm_time_entries','pm_time_entry_deletion_log','pm_timesheet_weeks','product_categories','product_files','project_bootstrap_runs','project_items','proposal_addon_modules','proposal_block_categories','proposal_blocks','proposal_commercial_components','proposal_delivery_modes','proposal_families','proposal_flags','proposal_phase_aliases','proposal_phases','proposal_presets','proposal_roles','psa_block_library','psa_image_library','psa_proposal_audit','psa_proposal_blocks','psa_proposal_signatures','psa_proposal_snapshots','psa_proposals','quote_allocations','quote_billable_hourly_rates','quote_external_services','quote_payment_schedule_items','quote_proposal_document_blocks','quote_proposal_documents','quote_site_trips','quote_stage_dependencies','quote_stage_supplier_costs','quote_stages','quote_supplier_markups','quote_supplier_phase_splits','quote_template_allocations','quote_template_blocks','quote_template_dependencies','quote_template_external_services','quote_template_payment_rules','quote_template_stages','quote_templates','reminders','remote_work_approvers','remote_work_requests','remote_work_settings','salary_snapshots','user_access','user_calendar_connections','vacation_change_requests','vacation_request_history','vacation_requests','voice_input_failures']
  LOOP
    EXECUTE format('CREATE POLICY psa_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_psa_staff()) WITH CHECK (public.is_psa_staff())', t);
  END LOOP;
END
$do$;

-- Shared companies: staff, or a non-PSA entity member reading companies its own documents reference
CREATE POLICY psa_staff_or_own_suppliers ON public.companies AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_psa_staff() OR public.fin_company_visible(id));
CREATE POLICY psa_staff_only_insert ON public.companies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_psa_staff());
CREATE POLICY psa_staff_only_update ON public.companies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_psa_staff());
CREATE POLICY psa_staff_only_delete ON public.companies AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_psa_staff());

-- 3. Storage: non-staff only reach finance files of their own entity
CREATE POLICY psa_staff_or_own_finance_files ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_psa_staff() OR (bucket_id = 'financial-documents' AND public.fin_storage_visible(name)))
  WITH CHECK (public.is_psa_staff() OR bucket_id = 'financial-documents');

-- 4. SECURITY DEFINER helpers that had no permission check
CREATE OR REPLACE FUNCTION public.allocate_inventory_code(_category_code text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _n integer;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF _category_code IS NULL OR length(trim(_category_code)) = 0 THEN
    RAISE EXCEPTION 'Category code is required';
  END IF;
  INSERT INTO public.inventory_code_counters (category_code, last_number)
  VALUES (upper(_category_code), 1)
  ON CONFLICT (category_code) DO UPDATE SET last_number = public.inventory_code_counters.last_number + 1
  RETURNING last_number INTO _n;
  RETURN 'PSA-' || upper(_category_code) || '-' || lpad(_n::text, 3, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.allocate_proposal_number(p_date date DEFAULT CURRENT_DATE)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year text;
  v_seq integer;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  v_year := to_char(p_date, 'YY');
  INSERT INTO public.fee_proposal_number_counters (year_prefix, last_seq, updated_at)
  VALUES (v_year, 1, now())
  ON CONFLICT (year_prefix)
  DO UPDATE SET last_seq = public.fee_proposal_number_counters.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO v_seq;
  RETURN v_year || lpad(v_seq::text, 2, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_fee_proposal_snapshot(_proposal_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  snap JSONB;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'proposal', (SELECT to_jsonb(p) FROM public.fee_proposals p WHERE p.id = _proposal_id),
    'quote_stages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stages t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_allocations', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_allocations t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_external_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_external_services t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_payment_schedule_items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_payment_schedule_items t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_dependencies', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_dependencies t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_supplier_phase_splits', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_supplier_phase_splits t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_supplier_costs', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_supplier_costs t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_documents', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_documents t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_document_blocks', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_document_blocks t
       WHERE t.document_id IN (SELECT id FROM public.quote_proposal_documents WHERE quote_id = _proposal_id)), '[]'::jsonb)
  )
  INTO snap;
  RETURN snap;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_apply_change(_req uuid, _kind text, _start date, _end date, _periodo text, _horas numeric, _tipo absence_type, _dias numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF _kind = 'cancel' THEN
    UPDATE public.vacation_requests SET estado = 'cancelada' WHERE id = _req;
  ELSIF _kind = 'dates' THEN
    UPDATE public.vacation_requests SET data_inicio = _start, data_fim = _end,
      periodo = COALESCE(_periodo, periodo), horas = _horas, dias_uteis = COALESCE(_dias, dias_uteis) WHERE id = _req;
  ELSIF _kind = 'type' THEN
    UPDATE public.vacation_requests SET tipo = _tipo WHERE id = _req;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.marketing_reorder_capture_assets(_capture_id uuid, _asset_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT public.marketing_can_arrange_capture(_capture_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT count(*) INTO _n FROM public.marketing_capture_assets WHERE capture_id = _capture_id;
  IF _n <> coalesce(array_length(_asset_ids, 1), 0)
     OR EXISTS (SELECT 1 FROM unnest(_asset_ids) x(id) WHERE NOT EXISTS (
       SELECT 1 FROM public.marketing_capture_assets a WHERE a.id = x.id AND a.capture_id = _capture_id)) THEN
    RAISE EXCEPTION 'The list must contain every file of this capture exactly once';
  END IF;
  UPDATE public.marketing_capture_assets a SET position = x.ord - 1
    FROM unnest(_asset_ids) WITH ORDINALITY x(id, ord) WHERE a.id = x.id;
END $function$;

CREATE OR REPLACE FUNCTION public.marketing_set_capture_format(_capture_id uuid, _format_hint text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT public.marketing_can_arrange_capture(_capture_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _format_hint NOT IN ('auto','single','carousel','story') THEN RAISE EXCEPTION 'Invalid format'; END IF;
  UPDATE public.marketing_captures SET format_hint = _format_hint WHERE id = _capture_id;
END $function$;

CREATE OR REPLACE FUNCTION public.psa_next_rev_number(_proposal_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _next integer;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.psa_proposals WHERE id = _proposal_id FOR UPDATE;
  SELECT COALESCE(MAX(rev_number), -1) + 1
    INTO _next
    FROM public.psa_proposal_snapshots
   WHERE proposal_id = _proposal_id
     AND kind = 'sent';
  RETURN COALESCE(_next, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.psa_restore_revision(_snapshot_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  snap record;
  prop record;
  p jsonb;
  raw jsonb;
  qid uuid;
  proj uuid;
  tbl text;
  tables text[] := ARRAY[
    'quote_stages','quote_external_services','quote_allocations','quote_stage_dependencies',
    'quote_supplier_markups','quote_stage_supplier_costs','quote_payment_schedule_items',
    'quote_site_trips','quote_billable_hourly_rates'
  ];
  payload jsonb;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO snap FROM public.psa_proposal_snapshots WHERE id = _snapshot_id;
  IF snap IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  SELECT * INTO prop FROM public.psa_proposals WHERE id = snap.proposal_id;
  IF prop IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  p := snap.snapshot -> 'proposal';
  raw := snap.snapshot -> 'quote_data' -> 'raw';
  qid := prop.quote_id;

  IF qid IS NOT NULL THEN
    SELECT pm_project_id INTO proj FROM public.fee_proposals WHERE id = qid;
    IF proj IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.fee_proposals
      SET is_locked = false, locked_at = NULL, quote_status = 'draft'
    WHERE id = qid;
  END IF;

  IF prop.locked_at IS NOT NULL THEN
    UPDATE public.psa_proposals SET locked_at = NULL, status = 'draft' WHERE id = prop.id;
  END IF;

  IF p IS NOT NULL THEN
    UPDATE public.psa_proposals SET
      title = COALESCE(p ->> 'title', title),
      client_snapshot = COALESCE(p -> 'client_snapshot', client_snapshot),
      project_snapshot = COALESCE(p -> 'project_snapshot', project_snapshot),
      vat_mode = COALESCE(p ->> 'vat_mode', vat_mode),
      language = COALESCE(p ->> 'language', language),
      style_settings = COALESCE(p -> 'style_settings', style_settings),
      restored_from_snapshot_id = _snapshot_id,
      updated_at = now()
    WHERE id = prop.id;
  ELSE
    UPDATE public.psa_proposals
      SET restored_from_snapshot_id = _snapshot_id, updated_at = now()
    WHERE id = prop.id;
  END IF;

  DELETE FROM public.psa_proposal_blocks WHERE proposal_id = prop.id;
  INSERT INTO public.psa_proposal_blocks
  SELECT (jsonb_populate_record(
            null::public.psa_proposal_blocks,
            b || jsonb_build_object('proposal_id', prop.id)
          )).*
  FROM jsonb_array_elements(COALESCE(snap.snapshot -> 'blocks', '[]'::jsonb)) AS b;

  IF raw IS NOT NULL AND qid IS NOT NULL THEN
    FOREACH tbl IN ARRAY ARRAY[
      'quote_payment_schedule_items','quote_stage_supplier_costs','quote_supplier_markups',
      'quote_stage_dependencies','quote_allocations','quote_external_services',
      'quote_site_trips','quote_billable_hourly_rates','quote_stages'
    ] LOOP
      EXECUTE format('DELETE FROM public.%I WHERE quote_id = $1', tbl) USING qid;
    END LOOP;

    FOREACH tbl IN ARRAY tables LOOP
      payload := COALESCE(raw -> tbl, '[]'::jsonb);
      IF jsonb_typeof(payload) = 'array' AND jsonb_array_length(payload) > 0 THEN
        EXECUTE format(
          'INSERT INTO public.%I SELECT (jsonb_populate_record(null::public.%I, r || jsonb_build_object(''quote_id'', $1::text))).* '
          || 'FROM jsonb_array_elements($2) AS r', tbl, tbl)
        USING qid, payload;
      END IF;
    END LOOP;
  END IF;

  RETURN prop.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.quote_unlock_for_revision(_quote_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE proj uuid;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT pm_project_id INTO proj FROM public.fee_proposals WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF proj IS NOT NULL THEN
    RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.fee_proposals
    SET is_locked = false, locked_at = NULL, quote_status = 'draft'
  WHERE id = _quote_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.benefit_category_from_legacy(_legacy benefit_category)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT category_id FROM public.benefit_category_legacy_aliases WHERE legacy_enum = _legacy) END
$function$;

CREATE OR REPLACE FUNCTION public.crm_leads_directory()
 RETURNS TABLE(id uuid, name text, company_name text, stage text, is_open boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT * FROM (SELECT o.id, o.name, c.nome, o.stage::text, o.stage NOT IN ('won','lost')
  FROM public.crm_opportunities o
  LEFT JOIN public.companies c ON c.id = o.company_id
  WHERE auth.uid() IS NOT NULL
    AND (o.stage NOT IN ('won','lost')
         OR EXISTS (SELECT 1 FROM public.pm_time_entries e
                    WHERE e.opportunity_id = o.id AND e.user_id = auth.uid()))
  ORDER BY o.name) _g WHERE public.is_psa_staff()
$function$;

CREATE OR REPLACE FUNCTION public.ensure_project_has_quote(_project_id uuid)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT public.backfill_quote_from_project(_project_id)) END
$function$;

CREATE OR REPLACE FUNCTION public.get_reimbursement_supplier_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT id
    FROM public.companies
   WHERE is_reimbursement_supplier = true
   LIMIT 1) END
$function$;

CREATE OR REPLACE FUNCTION public.leave_notify(_user uuid, _kind text, _title text, _body text, _req uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  INSERT INTO public.notifications(user_id, kind, title, body, link_path, module, entity_type, entity_id)
  SELECT _user, _kind, _title, _body, '/hr/ferias?req=' || _req::text, 'hr', 'vacation_request', _req
  WHERE _user IS NOT NULL AND public.is_psa_staff()
$function$;

CREATE OR REPLACE FUNCTION public.leave_overlaps(_collab uuid, _exclude uuid, _start date, _end date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT EXISTS (SELECT 1 FROM public.vacation_requests v
    WHERE v.collaborator_id = _collab AND v.id <> _exclude AND v.estado IN ('pendente','aprovada')
      AND v.data_inicio <= _end AND v.data_fim >= _start)) END
$function$;

CREATE OR REPLACE FUNCTION public.leave_request_owner_user(_collab uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT u.id FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email)
  WHERE c.id = _collab LIMIT 1) END
$function$;

CREATE OR REPLACE FUNCTION public.marketing_capture_delete_block(_capture_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT CASE
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids) AND status = 'published') THEN 'published'
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids)) THEN
      'drafts:' || (SELECT count(*) FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids))::text
    ELSE NULL END) END
$function$;

CREATE OR REPLACE FUNCTION public.marketing_composition_is_draft(_composition_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT EXISTS (SELECT 1 FROM public.marketing_compositions WHERE id = _composition_id AND status = 'draft')) END
$function$;

CREATE OR REPLACE FUNCTION public.marketing_draft_library_project(_asset_ids uuid[], _capture_ids uuid[], _project_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT COALESCE(
    (SELECT pr.project_id FROM public.marketing_project_media m
       JOIN public.marketing_project_profiles pr ON pr.id = m.profile_id
      WHERE m.id = ANY(coalesce(_asset_ids,'{}')) LIMIT 1),
    CASE WHEN coalesce(array_length(_capture_ids,1),0) = 0 THEN _project_id END)) END
$function$;

CREATE OR REPLACE FUNCTION public.marketing_media_delete_block(_media_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT CASE
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids) AND status = 'published') THEN 'published'
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids)) THEN
      'drafts:' || (SELECT count(*) FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids))::text
    WHEN EXISTS (SELECT 1 FROM marketing_composition_slides WHERE media_id = _media_id OR design_media_id = _media_id) THEN
      'compositions:' || (SELECT count(DISTINCT composition_id) FROM marketing_composition_slides WHERE media_id = _media_id OR design_media_id = _media_id)::text
    ELSE NULL END) END
$function$;

CREATE OR REPLACE FUNCTION public.pm_is_retainer_stage(_stage_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT EXISTS (
    SELECT 1
    FROM public.pm_stages s
    LEFT JOIN public.pm_stages p ON p.id = s.parent_stage_id
    WHERE s.id = _stage_id
      AND (
        s.stage_kind IN ('retainer_monthly', 'retainer_month', 'retainer')
        OR p.stage_kind IN ('retainer_monthly', 'retainer')
      )
  )) END
$function$;

CREATE OR REPLACE FUNCTION public.pm_list_user_resource_map()
 RETURNS TABLE(user_id uuid, resource_id uuid, name text, collaborator_id uuid, foto_path text, color text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT * FROM (SELECT
    u.id AS user_id,
    r.id AS resource_id,
    COALESCE(c.nome, r.name, u.email::text) AS name,
    c.id AS collaborator_id,
    c.foto_path,
    r.color
  FROM auth.users u
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  LEFT JOIN public.pm_resources r ON r.collaborator_id = c.id OR lower(r.email) = lower(u.email)) _g WHERE public.is_psa_staff()
$function$;

CREATE OR REPLACE FUNCTION public.pm_project_has_retainer(_project_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.project_id = _project_id
      AND s.stage_kind IN ('retainer_monthly','retainer_month','retainer')
  )) END
$function$;

CREATE OR REPLACE FUNCTION public.project_dependency_counts(_project_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_psa_staff() THEN (SELECT jsonb_build_object(
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
  )) END
$function$;

-- 5. Views that run with owner rights (bypass row rules): staff only
CREATE OR REPLACE VIEW public.collaborators_directory AS
SELECT id, nome, email, foto_path, departamento, language_preference, daily_hours, days_per_week,
    target_chargeability_pct, numero_colaborador, archived_at, archived_by, ano_fiscal,
    dias_ferias_anuais, dias_ferias_extra, data_nascimento, inicio_carreira, created_at, updated_at, data_admissao
   FROM collaborators
  WHERE public.is_psa_staff();

CREATE OR REPLACE VIEW public.inventory_line_processing AS
SELECT l.id AS line_id,
    l.document_id,
    COALESCE(l.quantity, 1::numeric) AS quantity_total,
    count(a.id)::integer AS quantity_processed,
    GREATEST(COALESCE(l.quantity, 1::numeric) - count(a.id)::numeric, 0::numeric) AS quantity_remaining,
    COALESCE(max(a.source_unit_index), 0) AS max_unit_index
   FROM financial_document_lines l
     LEFT JOIN inventory_assets a ON a.source_document_line_id = l.id
  WHERE public.is_psa_staff()
  GROUP BY l.id, l.document_id, l.quantity;

CREATE OR REPLACE VIEW public.benefit_expenses_v AS
SELECT e.id, e.collaborator_id, e.ano_fiscal, e.categoria, e.descricao, e.valor, e.data_despesa, e.foto_path,
    e.estado, e.notas_colaborador, e.notas_aprovacao, e.aprovado_por, e.aprovado_em, e.pago_em, e.created_at,
    e.updated_at, e.category_id, e.pago_por,
    COALESCE(c.code, lc.code) AS category_code,
    COALESCE(c.label_pt, lc.label_pt) AS category_label_pt,
    COALESCE(c.label_en, lc.label_en) AS category_label_en,
    fei.id AS finance_item_id, fei.status AS finance_status, fei.due_date AS finance_due_date,
    fei.paid_date AS finance_paid_date, fei.period_id AS finance_period_id
   FROM benefit_expenses e
     LEFT JOIN benefit_categories c ON c.id = e.category_id
     LEFT JOIN benefit_category_legacy_aliases la ON la.legacy_enum = e.categoria
     LEFT JOIN benefit_categories lc ON lc.id = la.category_id
     LEFT JOIN financial_expense_items fei ON fei.source_ref_table = 'benefit_expenses'::text AND fei.source_ref_id = e.id
  WHERE public.is_psa_staff();

CREATE OR REPLACE VIEW public.pm_suppliers_directory AS
SELECT id, name, active FROM pm_suppliers WHERE public.is_psa_staff();