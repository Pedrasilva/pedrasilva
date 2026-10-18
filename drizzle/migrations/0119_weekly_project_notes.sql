CREATE TABLE public.pm_week_project_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL,
 kind text NOT NULL, project_id uuid REFERENCES public.pm_projects(id), opportunity_id uuid REFERENCES public.crm_opportunities(id),
 status text, notes text NOT NULL DEFAULT '', target_text text NOT NULL DEFAULT '', flag text NOT NULL DEFAULT '',
 week_topics jsonb NOT NULL DEFAULT '{}', added_manually boolean NOT NULL DEFAULT false, carried_from_week date,
 revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL DEFAULT auth.uid(), updated_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT week_note_monday CHECK(extract(isodow from week_start)=1),
 CONSTRAINT week_note_kind CHECK((kind='project' AND project_id IS NOT NULL AND opportunity_id IS NULL) OR (kind='opportunity' AND opportunity_id IS NOT NULL AND project_id IS NULL) OR (kind='week' AND project_id IS NULL AND opportunity_id IS NULL)),
 CONSTRAINT week_note_status CHECK(status IS NULL OR status IN ('a_decorrer','obra','stand_by','a_arrancar')),
 CONSTRAINT week_note_topics CHECK(jsonb_typeof(week_topics)='object' AND (kind='week' OR week_topics='{}'::jsonb))
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pm_week_project_notes TO authenticated;
GRANT ALL ON public.pm_week_project_notes TO service_role;
REVOKE TRUNCATE ON public.pm_week_project_notes FROM anon,authenticated;
ALTER TABLE public.pm_week_project_notes ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.pm_can_edit_week_notes() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_week_notes','all')) $$;
REVOKE ALL ON FUNCTION public.pm_can_edit_week_notes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_can_edit_week_notes() TO authenticated,service_role;
CREATE POLICY week_notes_read ON public.pm_week_project_notes FOR SELECT TO authenticated USING(public.is_psa_staff() AND (kind<>'week' OR public.pm_can_edit_week_notes()));
CREATE POLICY week_notes_insert ON public.pm_week_project_notes FOR INSERT TO authenticated WITH CHECK(public.pm_can_edit_week_notes());
CREATE POLICY week_notes_update ON public.pm_week_project_notes FOR UPDATE TO authenticated USING(public.pm_can_edit_week_notes()) WITH CHECK(public.pm_can_edit_week_notes());
CREATE POLICY week_notes_delete ON public.pm_week_project_notes FOR DELETE TO authenticated USING(public.pm_can_edit_week_notes());
CREATE UNIQUE INDEX week_notes_project ON public.pm_week_project_notes(week_start,project_id) WHERE kind='project';
CREATE UNIQUE INDEX week_notes_opportunity ON public.pm_week_project_notes(week_start,opportunity_id) WHERE kind='opportunity';
CREATE UNIQUE INDEX week_notes_general ON public.pm_week_project_notes(week_start) WHERE kind='week';
CREATE FUNCTION public.pm_week_note_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at; NEW.revision:=OLD.revision+1; ELSE NEW.revision:=1; NEW.created_by:=auth.uid(); NEW.created_at:=now(); END IF;
 NEW.updated_by:=auth.uid(); NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER pm_week_note_stamp BEFORE INSERT OR UPDATE ON public.pm_week_project_notes FOR EACH ROW EXECUTE FUNCTION public.pm_week_note_stamp();
CREATE FUNCTION public.pm_week_note_save(_week date,_kind text,_project uuid,_opportunity uuid,_value jsonb,_revision integer DEFAULT 0) RETURNS public.pm_week_project_notes LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.pm_week_project_notes;
BEGIN
 IF NOT public.pm_can_edit_week_notes() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('week-note:'||_week::text||':'||_kind||':'||coalesce(_project::text,_opportunity::text,''),0));
 SELECT * INTO r FROM public.pm_week_project_notes WHERE week_start=_week AND kind=_kind AND project_id IS NOT DISTINCT FROM _project AND opportunity_id IS NOT DISTINCT FROM _opportunity FOR UPDATE;
 IF coalesce(r.revision,0)<>_revision THEN RAISE EXCEPTION 'weekNotes.conflict' USING ERRCODE='40001'; END IF;
 IF r.id IS NULL THEN
 INSERT INTO public.pm_week_project_notes(week_start,kind,project_id,opportunity_id,status,notes,target_text,flag,week_topics,added_manually,carried_from_week) VALUES(_week,_kind,_project,_opportunity,_value->>'status',coalesce(_value->>'notes',''),coalesce(_value->>'target_text',''),coalesce(_value->>'flag',''),coalesce(_value->'week_topics','{}'::jsonb),coalesce((_value->>'added_manually')::boolean,false),(_value->>'carried_from_week')::date) RETURNING * INTO r;
 ELSE
 UPDATE public.pm_week_project_notes SET status=_value->>'status',notes=coalesce(_value->>'notes',''),target_text=coalesce(_value->>'target_text',''),flag=coalesce(_value->>'flag',''),week_topics=coalesce(_value->'week_topics','{}'::jsonb) WHERE id=r.id RETURNING * INTO r;
 END IF; RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.pm_week_note_save(date,text,uuid,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_week_note_save(date,text,uuid,uuid,jsonb,integer) TO authenticated;
CREATE FUNCTION public.pm_week_notes_read(_week date) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM (SELECT DISTINCT ON(kind,project_id,opportunity_id) * FROM public.pm_week_project_notes WHERE week_start<=_week ORDER BY kind,project_id,opportunity_id,week_start DESC) n $$;
REVOKE ALL ON FUNCTION public.pm_week_notes_read(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_week_notes_read(date) TO authenticated;
CREATE FUNCTION public.pm_week_note_choices() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.pm_can_edit_week_notes() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('projects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',external_id) ORDER BY name),'[]') FROM public.pm_projects),'opportunities',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) ORDER BY o.name),'[]') FROM public.crm_opportunities o WHERE NOT EXISTS(SELECT 1 FROM public.pm_projects p WHERE p.opportunity_id=o.id)));
END $$;
REVOKE ALL ON FUNCTION public.pm_week_note_choices() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_week_note_choices() TO authenticated;
CREATE FUNCTION public.pm_week_note_editor_names() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_object_agg(u.id,coalesce(c.nome,u.raw_user_meta_data->>'full_name','—')),'{}') FROM auth.users u LEFT JOIN public.collaborators c ON lower(c.email)=lower(u.email) WHERE u.id IN (SELECT updated_by FROM public.pm_week_project_notes WHERE kind<>'week' OR public.pm_can_edit_week_notes()));
END $$;
REVOKE ALL ON FUNCTION public.pm_week_note_editor_names() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_week_note_editor_names() TO authenticated;
DO $$ DECLARE definition text; anchor text:='RETURNING id INTO project_id_new;'; BEGIN
 definition:=pg_get_functiondef('public.pm_convert_relative_quote(uuid,date,text)'::regprocedure);
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Conversion anchor missing'; END IF;
 definition:=replace(definition,anchor,anchor||E'\nIF q.opportunity_id IS NOT NULL THEN UPDATE public.pm_week_project_notes SET kind=''project'',project_id=project_id_new,opportunity_id=NULL WHERE kind=''opportunity'' AND opportunity_id=q.opportunity_id; END IF;');
 EXECUTE definition;
END $$;
COMMENT ON TABLE public.pm_week_project_notes IS 'Independent weekly notes; PSA board company boundary, private week topics limited to admins and projects.edit_week_notes; never changes planning.';