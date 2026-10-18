CREATE TABLE public.pm_planning_cutoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cutoff_date date NOT NULL,
 trim_end date NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','applied','undone')),
 preview jsonb NOT NULL, before_rows jsonb NOT NULL, after_rows jsonb,
 revision text NOT NULL, applied_at timestamptz, undone_at timestamptz, publication_revision text
);
GRANT SELECT ON public.pm_planning_cutoffs TO authenticated;
GRANT ALL ON public.pm_planning_cutoffs TO service_role;
REVOKE TRUNCATE ON public.pm_planning_cutoffs FROM anon,authenticated;
ALTER TABLE public.pm_planning_cutoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read planning cutoff snapshots" ON public.pm_planning_cutoffs FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.pm_planning_cutoff_preview(_cutoff date DEFAULT '2026-10-19',_trim_end date DEFAULT '2026-10-16',_project_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _cutoff<>'2026-10-19'::date OR _trim_end<>'2026-10-16'::date THEN RAISE EXCEPTION 'Unapproved cutoff dates' USING ERRCODE='22023'; END IF;
 WITH RECURSIVE tree AS (
  SELECT s.id,s.project_id,coalesce(s.is_locked,false) AS locked FROM pm_stages s WHERE s.parent_stage_id IS NULL
  UNION ALL SELECT s.id,s.project_id,t.locked OR coalesce(s.is_locked,false) FROM pm_stages s JOIN tree t ON t.id=s.parent_stage_id
 ), classified AS (
 SELECT a.*,p.name AS project_name,r.name AS resource_name,s.name AS stage_name,
 (SELECT count(*) FROM pm_time_entries e JOIN pm_tasks t ON t.id=e.task_id WHERE t.allocation_id=a.id) AS entry_count,
 (SELECT coalesce(sum(e.hours),0) FROM pm_time_entries e JOIN pm_tasks t ON t.id=e.task_id WHERE t.allocation_id=a.id) AS logged_hours,
 CASE WHEN a.planning_removed_at IS NOT NULL THEN 'already_retired'
 WHEN a.is_locked OR tree.locked OR a.external_id IS NOT NULL OR coalesce(a.source,'') ILIKE '%import%' THEN 'protected'
 WHEN p.status<>'active' THEN 'inactive_project'
 WHEN a.end_date<_cutoff THEN 'past'
 WHEN a.start_date>_trim_end AND a.start_date<_cutoff THEN 'weekend_review'
 WHEN a.start_date>=_cutoff AND EXISTS(SELECT 1 FROM pm_time_entries e JOIN pm_tasks t ON t.id=e.task_id WHERE t.allocation_id=a.id) THEN 'future_logged'
 WHEN a.start_date>=_cutoff THEN 'retire' ELSE 'trim' END AS action
 FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id JOIN tree ON tree.id=s.id JOIN pm_projects p ON p.id=s.project_id JOIN pm_resources r ON r.id=a.resource_id
 WHERE _project_ids IS NULL OR p.id=ANY(_project_ids)
 ), measured AS (
 SELECT c.*,(SELECT count(*) FROM generate_series(greatest(c.start_date,_cutoff),c.end_date,'1 day') d WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM holidays h WHERE h.data=d::date))*c.hours_per_day AS removed_hours FROM classified c
 ) SELECT jsonb_build_object('cutoff',_cutoff,'trim_end',_trim_end,
 'rows',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY project_name,stage_id,resource_name,id) FROM measured m),'[]'),
 'projects',coalesce((SELECT jsonb_agg(x ORDER BY project_name) FROM (SELECT project_name,count(*) total,count(*) FILTER(WHERE action='trim') trim,count(*) FILTER(WHERE action='retire') retire,count(*) FILTER(WHERE action NOT IN('trim','retire')) untouched,coalesce(sum(removed_hours) FILTER(WHERE action IN('trim','retire')),0) removed_hours FROM measured GROUP BY project_name)x),'[]'),
 'people',coalesce((SELECT jsonb_agg(x ORDER BY resource_name) FROM (SELECT resource_id,resource_name,count(*) FILTER(WHERE action='trim') trim,count(*) FILTER(WHERE action='retire') retire,coalesce(sum(removed_hours) FILTER(WHERE action IN('trim','retire')),0) removed_hours FROM measured GROUP BY resource_id,resource_name)x),'[]'),
 'revision',md5(jsonb_build_object('allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE _project_ids IS NULL OR s.project_id=ANY(_project_ids)),
 'stages',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM pm_stages s WHERE _project_ids IS NULL OR s.project_id=ANY(_project_ids)),
 'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE _project_ids IS NULL OR s.project_id=ANY(_project_ids)),
 'entries',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM pm_time_entries e JOIN pm_tasks t ON t.id=e.task_id JOIN pm_allocations a ON a.id=t.allocation_id JOIN pm_stages s ON s.id=a.stage_id WHERE _project_ids IS NULL OR s.project_id=ANY(_project_ids)),
 'holidays',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]') FROM holidays h),
 'publications',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id),'[]') FROM pm_week_publications w))::text)) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.pm_prepare_planning_cutoff(_revision text,_project_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; snapshot_id uuid; originals jsonb;
BEGIN
 -- Preview verifies the caller; preparing never changes allocations.
 PERFORM pg_advisory_xact_lock(hashtextextended('planning-cutoff',0));
 p:=public.pm_planning_cutoff_preview('2026-10-19','2026-10-16',_project_ids);
 IF p->>'revision' IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'Cutoff preview is stale' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO originals FROM pm_allocations a WHERE a.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(p->'rows') x WHERE x->>'action' IN('trim','retire'));
 INSERT INTO pm_planning_cutoffs(cutoff_date,trim_end,created_by,preview,before_rows,revision)
 VALUES('2026-10-19','2026-10-16',auth.uid(),p||jsonb_build_object('project_ids',to_jsonb(_project_ids)),originals,_revision) RETURNING id INTO snapshot_id;
 RETURN snapshot_id;
END $$;

CREATE OR REPLACE FUNCTION public.pm_apply_planning_cutoff(_snapshot_id uuid,_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap pm_planning_cutoffs; p jsonb; ids uuid[]; projects uuid[]; row jsonb; afters jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.has_role(auth.uid(),'admin') OR NOT _confirm THEN RAISE EXCEPTION 'Explicit admin confirmation required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('planning-cutoff',0));
 -- Serialize against publication/scheduling/logging while checking the preview and applying only planning fields.
 LOCK TABLE pm_allocations,pm_stages,pm_tasks,pm_time_entries,pm_projects,pm_week_publications,holidays IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO snap FROM pm_planning_cutoffs WHERE id=_snapshot_id FOR UPDATE;
 IF snap.id IS NULL OR snap.status<>'prepared' THEN RAISE EXCEPTION 'Prepared snapshot required' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(snap.preview->'project_ids')='array' THEN SELECT array_agg(value::uuid) INTO projects FROM jsonb_array_elements_text(snap.preview->'project_ids'); END IF;
 p:=public.pm_planning_cutoff_preview(snap.cutoff_date,snap.trim_end,projects);
 IF p->>'revision' IS DISTINCT FROM snap.revision THEN RAISE EXCEPTION 'Cutoff preview is stale; refresh before confirming' USING ERRCODE='40001'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p->'rows') WHERE value->>'action' IN('trim','retire') LOOP
  IF row->>'action'='trim' THEN UPDATE pm_allocations SET end_date=snap.trim_end WHERE id=(row->>'id')::uuid;
  ELSE UPDATE pm_allocations SET planning_removed_at=clock_timestamp() WHERE id=(row->>'id')::uuid; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO afters FROM pm_allocations a WHERE a.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(snap.before_rows)x);
 UPDATE pm_planning_cutoffs SET status='applied',after_rows=afters,applied_at=clock_timestamp(),publication_revision=(SELECT md5(coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id),'[]')::text) FROM pm_week_publications w) WHERE id=snap.id;
 RETURN jsonb_build_object('snapshot_id',snap.id,'changed',jsonb_array_length(afters),'projects',p->'projects','people',p->'people');
END $$;

CREATE OR REPLACE FUNCTION public.pm_undo_planning_cutoff(_snapshot_id uuid,_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap pm_planning_cutoffs; row jsonb; current_rows jsonb; publication_hash text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.has_role(auth.uid(),'admin') OR NOT _confirm THEN RAISE EXCEPTION 'Explicit admin confirmation required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('planning-cutoff',0));
 LOCK TABLE pm_allocations,pm_week_publications IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO snap FROM pm_planning_cutoffs WHERE id=_snapshot_id FOR UPDATE;
 IF snap.id IS NULL OR snap.status<>'applied' THEN RAISE EXCEPTION 'Applied snapshot required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') INTO current_rows FROM pm_allocations a WHERE a.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(snap.after_rows)x);
 IF current_rows IS DISTINCT FROM snap.after_rows THEN RAISE EXCEPTION 'Planning changed since cutoff; review before undo' USING ERRCODE='40001'; END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id),'[]')::text) INTO publication_hash FROM pm_week_publications w;
 IF publication_hash IS DISTINCT FROM snap.publication_revision THEN RAISE EXCEPTION 'A week was published since cutoff; review before undo' USING ERRCODE='40001'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(snap.before_rows) LOOP
  UPDATE pm_allocations SET end_date=(row->>'end_date')::date,planning_removed_at=(row->>'planning_removed_at')::timestamptz WHERE id=(row->>'id')::uuid;
 END LOOP;
 UPDATE pm_planning_cutoffs SET status='undone',undone_at=clock_timestamp() WHERE id=snap.id;
 RETURN jsonb_build_object('snapshot_id',snap.id,'restored',jsonb_array_length(snap.before_rows));
END $$;
REVOKE ALL ON FUNCTION public.pm_planning_cutoff_preview(date,date,uuid[]),public.pm_prepare_planning_cutoff(text,uuid[]),public.pm_apply_planning_cutoff(uuid,boolean),public.pm_undo_planning_cutoff(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_planning_cutoff_preview(date,date,uuid[]),public.pm_prepare_planning_cutoff(text,uuid[]),public.pm_apply_planning_cutoff(uuid,boolean),public.pm_undo_planning_cutoff(uuid,boolean) TO authenticated;
