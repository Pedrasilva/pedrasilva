CREATE TABLE public.crm_work_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_number text NOT NULL UNIQUE,
 original_created_at timestamptz NOT NULL DEFAULT now(), name text NOT NULL,
 is_fixture boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_work_number_format CHECK (canonical_number ~ '^[0-9]{4,5}[A-Z]?$')
);
GRANT SELECT ON public.crm_work_identities TO authenticated;
GRANT ALL ON public.crm_work_identities TO service_role;
REVOKE TRUNCATE ON public.crm_work_identities FROM anon,authenticated;
ALTER TABLE public.crm_work_identities ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.crm_work_number_registry (
 number text PRIMARY KEY, work_id uuid REFERENCES public.crm_work_identities(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_work_number_registry TO authenticated;
GRANT ALL ON public.crm_work_number_registry TO service_role;
REVOKE TRUNCATE ON public.crm_work_number_registry FROM anon,authenticated;
ALTER TABLE public.crm_work_number_registry ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.crm_work_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_id uuid NOT NULL REFERENCES public.crm_work_identities(id),
 version_key text NOT NULL DEFAULT '', restart_year integer, restart_ordinal integer,
 reason text, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(work_id,version_key), UNIQUE(work_id,restart_year,restart_ordinal),
 CONSTRAINT crm_work_restart_shape CHECK ((version_key='' AND restart_year IS NULL AND restart_ordinal IS NULL) OR
 (restart_year BETWEEN 2000 AND 2099 AND restart_ordinal>=1 AND version_key=right(restart_year::text,2)||CASE WHEN restart_ordinal=1 THEN '' ELSE '-'||lpad(restart_ordinal::text,2,'0') END))
);
GRANT SELECT ON public.crm_work_versions TO authenticated;
GRANT ALL ON public.crm_work_versions TO service_role;
REVOKE TRUNCATE ON public.crm_work_versions FROM anon,authenticated;
ALTER TABLE public.crm_work_versions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.crm_work_number_counters (
 year integer PRIMARY KEY CHECK(year BETWEEN 2000 AND 2099), last_sequence integer NOT NULL DEFAULT 0 CHECK(last_sequence BETWEEN 0 AND 999)
);
GRANT SELECT ON public.crm_work_number_counters TO authenticated;
GRANT ALL ON public.crm_work_number_counters TO service_role;
REVOKE TRUNCATE ON public.crm_work_number_counters FROM anon,authenticated;
ALTER TABLE public.crm_work_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_work_counters_admin ON public.crm_work_number_counters FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.crm_work_numbering_gate (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), active boolean NOT NULL DEFAULT false,
 mapping_hash text NOT NULL, activated_by uuid NOT NULL, activated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_work_numbering_gate TO authenticated;
GRANT ALL ON public.crm_work_numbering_gate TO service_role;
REVOKE TRUNCATE ON public.crm_work_numbering_gate FROM anon,authenticated;
ALTER TABLE public.crm_work_numbering_gate ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_work_gate_admin ON public.crm_work_numbering_gate FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.crm_work_identity_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_id uuid NOT NULL REFERENCES public.crm_work_identities(id),
 action text NOT NULL, before_value jsonb, after_value jsonb NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_work_identity_audit TO authenticated;
GRANT ALL ON public.crm_work_identity_audit TO service_role;
REVOKE TRUNCATE ON public.crm_work_identity_audit FROM anon,authenticated;
ALTER TABLE public.crm_work_identity_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_work_audit_admin ON public.crm_work_identity_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
ALTER TABLE public.crm_opportunities ADD COLUMN work_version_id uuid REFERENCES public.crm_work_versions(id);
ALTER TABLE public.fee_proposals ADD COLUMN work_version_id uuid REFERENCES public.crm_work_versions(id), ADD COLUMN work_revision_ordinal integer;
ALTER TABLE public.pm_projects ADD COLUMN work_version_id uuid REFERENCES public.crm_work_versions(id);
CREATE UNIQUE INDEX fee_proposals_work_revision_unique ON public.fee_proposals(work_version_id,work_revision_ordinal) WHERE work_version_id IS NOT NULL;
CREATE INDEX crm_opportunities_work_version ON public.crm_opportunities(work_version_id);
CREATE INDEX pm_projects_work_version ON public.pm_projects(work_version_id);
CREATE FUNCTION public.crm_work_can_read(_work uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR
 EXISTS(SELECT 1 FROM public.crm_work_versions v JOIN public.crm_opportunities o ON o.work_version_id=v.id WHERE v.work_id=_work AND public.has_permission(auth.uid(),'crm.pipeline')) OR
 EXISTS(SELECT 1 FROM public.crm_work_versions v JOIN public.fee_proposals q ON q.work_version_id=v.id WHERE v.work_id=_work AND public.has_permission(auth.uid(),'crm.pipeline')) OR
 EXISTS(SELECT 1 FROM public.crm_work_versions v JOIN public.pm_projects p ON p.work_version_id=v.id WHERE v.work_id=_work AND NOT p.finance_only AND (public.pm_can_view_projects(auth.uid()) OR public.pm_has_assigned_access(auth.uid(),p.id))))
$$;
REVOKE ALL ON FUNCTION public.crm_work_can_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_can_read(uuid) TO authenticated,service_role;
CREATE POLICY crm_work_identity_read ON public.crm_work_identities FOR SELECT TO authenticated USING(public.crm_work_can_read(id));
CREATE POLICY crm_work_versions_read ON public.crm_work_versions FOR SELECT TO authenticated USING(public.crm_work_can_read(work_id));
CREATE POLICY crm_work_registry_admin ON public.crm_work_number_registry FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.crm_work_numbering_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT active FROM public.crm_work_numbering_gate WHERE singleton),false) $$;
REVOKE ALL ON FUNCTION public.crm_work_numbering_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_numbering_active() TO authenticated,service_role;
CREATE FUNCTION public.crm_work_letters(_ordinal integer) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
 DECLARE n integer:=_ordinal; label text:=''; BEGIN IF n<0 OR n IS NULL THEN RAISE EXCEPTION 'Invalid revision ordinal';END IF;
 WHILE n>0 LOOP n:=n-1;label:=chr(65+n%26)||label;n:=n/26;END LOOP;RETURN label;END $$;
GRANT EXECUTE ON FUNCTION public.crm_work_letters(integer) TO authenticated,service_role;
CREATE FUNCTION public.crm_work_reference(_version uuid,_ordinal integer DEFAULT 0) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT w.canonical_number||CASE WHEN v.version_key='' THEN '' ELSE '-'||v.version_key END||public.crm_work_letters(_ordinal)
 FROM public.crm_work_versions v JOIN public.crm_work_identities w ON w.id=v.work_id WHERE v.id=_version
$$;
REVOKE ALL ON FUNCTION public.crm_work_reference(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_reference(uuid,integer) TO authenticated,service_role;
CREATE FUNCTION public.crm_work_reserve_canonical() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 BEGIN
 IF TG_OP='UPDATE' AND NEW.canonical_number IS NOT DISTINCT FROM OLD.canonical_number THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM public.crm_work_number_registry WHERE number=NEW.canonical_number AND work_id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'Work number is already reserved';END IF;
 INSERT INTO public.crm_work_number_registry(number,work_id,reason) VALUES(NEW.canonical_number,NEW.id,'canonical') ON CONFLICT(number) DO NOTHING;
 RETURN NEW;END $$;
CREATE TRIGGER crm_work_reserve_canonical AFTER INSERT OR UPDATE OF canonical_number ON public.crm_work_identities FOR EACH ROW EXECUTE FUNCTION public.crm_work_reserve_canonical();
CREATE FUNCTION public.crm_work_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Work identity audit is immutable'; END $$;
CREATE TRIGGER crm_work_audit_immutable BEFORE UPDATE OR DELETE ON public.crm_work_identity_audit FOR EACH ROW EXECUTE FUNCTION public.crm_work_audit_immutable();
CREATE FUNCTION public.crm_work_new(_name text,_created timestamptz DEFAULT now()) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE y integer:=extract(year from _created AT TIME ZONE 'Europe/Lisbon'); seq integer; num text; wid uuid; vid uuid;
 BEGIN
 IF NOT public.crm_work_numbering_active() THEN RAISE EXCEPTION 'Work numbering awaits approved mapping';END IF;
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NOT(public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'crm.pipeline') OR public.pm_can_view_projects(auth.uid())) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF y NOT BETWEEN 2000 AND 2099 OR nullif(trim(_name),'') IS NULL THEN RAISE EXCEPTION 'Invalid work creation';END IF;
 INSERT INTO public.crm_work_number_counters(year,last_sequence) VALUES(y,CASE WHEN y=2026 THEN 18 ELSE 0 END) ON CONFLICT(year) DO NOTHING;
 PERFORM 1 FROM public.crm_work_number_counters WHERE year=y FOR UPDATE;
 LOOP
 UPDATE public.crm_work_number_counters SET last_sequence=last_sequence+1 WHERE year=y AND last_sequence<999 RETURNING last_sequence INTO seq;
 IF seq IS NULL THEN RAISE EXCEPTION 'Annual work numbering exhausted';END IF;
 num:=right(y::text,2)||lpad(seq::text,3,'0');
 EXIT WHEN NOT EXISTS(SELECT 1 FROM public.crm_work_number_registry WHERE number=num);
 END LOOP;
 INSERT INTO public.crm_work_identities(canonical_number,original_created_at,name) VALUES(num,_created,_name) RETURNING id INTO wid;
 INSERT INTO public.crm_work_versions(work_id) VALUES(wid) RETURNING id INTO vid; RETURN vid;
 END $$;
REVOKE ALL ON FUNCTION public.crm_work_new(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_new(text,timestamptz) TO service_role;
CREATE FUNCTION public.crm_work_assign_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE source_version uuid; source_revision integer; ord integer; ref text; wid uuid;
 BEGIN
 IF NOT public.crm_work_numbering_active() THEN
 IF NEW.work_version_id IS NOT NULL AND NOT(public.has_role(auth.uid(),'admin') AND EXISTS(SELECT 1 FROM public.crm_work_versions v JOIN public.crm_work_identities w ON w.id=v.work_id WHERE v.id=NEW.work_version_id AND w.is_fixture)) THEN RAISE EXCEPTION 'Work numbering awaits approved mapping';END IF;
 IF NEW.work_version_id IS NULL THEN RETURN NEW;END IF;
 END IF;
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NEW.work_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_work_versions v WHERE v.id=NEW.work_version_id AND public.crm_work_can_read(v.work_id)) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='fee_proposals' THEN
 IF NEW.parent_quote_id IS NOT NULL THEN SELECT work_version_id,work_revision_ordinal INTO source_version,source_revision FROM public.fee_proposals WHERE id=NEW.parent_quote_id;END IF;
 IF source_version IS NULL AND NEW.opportunity_id IS NOT NULL THEN SELECT work_version_id INTO source_version FROM public.crm_opportunities WHERE id=NEW.opportunity_id;END IF;
 IF source_version IS NULL AND NEW.pm_project_id IS NOT NULL THEN SELECT work_version_id INTO source_version FROM public.pm_projects WHERE id=NEW.pm_project_id;END IF;
 IF source_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_work_versions v WHERE v.id=source_version AND public.crm_work_can_read(v.work_id)) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NEW.work_version_id IS NULL THEN NEW.work_version_id:=source_version;ELSIF source_version IS NOT NULL AND source_version<>NEW.work_version_id THEN RAISE EXCEPTION 'Work identity conflicts with source';END IF;
 IF NEW.work_version_id IS NULL THEN
 IF NEW.parent_quote_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.pm_project_id IS NOT NULL THEN RAISE EXCEPTION 'Source work awaits approved mapping';END IF;
 NEW.work_version_id:=public.crm_work_new(NEW.titulo,now());
 END IF;
 SELECT work_id INTO wid FROM public.crm_work_versions WHERE id=NEW.work_version_id;
 PERFORM 1 FROM public.crm_work_identities WHERE id=wid FOR UPDATE;
 SELECT coalesce(max(work_revision_ordinal)+1,0) INTO ord FROM public.fee_proposals WHERE work_version_id=NEW.work_version_id;
 NEW.work_revision_ordinal:=ord; NEW.revision_number:=ord+1;
 SELECT w.canonical_number||CASE WHEN v.version_key='' THEN '' ELSE '-'||v.version_key END INTO ref FROM public.crm_work_versions v JOIN public.crm_work_identities w ON w.id=v.work_id WHERE v.id=NEW.work_version_id;
 NEW.proposal_number:=ref;
 ELSIF TG_TABLE_NAME='pm_projects' THEN
 IF NEW.quote_id IS NOT NULL THEN SELECT work_version_id INTO source_version FROM public.fee_proposals WHERE id=NEW.quote_id;END IF;
 IF source_version IS NULL AND NEW.opportunity_id IS NOT NULL THEN SELECT work_version_id INTO source_version FROM public.crm_opportunities WHERE id=NEW.opportunity_id;END IF;
 IF source_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_work_versions v WHERE v.id=source_version AND public.crm_work_can_read(v.work_id)) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NEW.work_version_id IS NULL THEN NEW.work_version_id:=source_version;ELSIF source_version IS NOT NULL AND source_version<>NEW.work_version_id THEN RAISE EXCEPTION 'Work identity conflicts with source';END IF;
 IF NEW.work_version_id IS NULL THEN
 IF NEW.quote_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL THEN RAISE EXCEPTION 'Source work awaits approved mapping';END IF;
 NEW.work_version_id:=public.crm_work_new(NEW.name,now());END IF;
 ELSE
 IF NEW.work_version_id IS NULL THEN NEW.work_version_id:=public.crm_work_new(NEW.name,now());END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER aaa_crm_work_assign BEFORE INSERT ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_work_assign_insert();
CREATE TRIGGER aaa_crm_work_assign BEFORE INSERT ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.crm_work_assign_insert();
CREATE TRIGGER aaa_crm_work_assign BEFORE INSERT ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.crm_work_assign_insert();
CREATE FUNCTION public.crm_work_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 BEGIN
 IF NEW.work_version_id IS DISTINCT FROM OLD.work_version_id THEN
 IF current_setting('psa.work_mapping',true) IS DISTINCT FROM 'approved' OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Work identity changes require approved admin action';END IF;
 END IF;
 IF TG_TABLE_NAME='fee_proposals' THEN
 IF (NEW.proposal_number IS DISTINCT FROM OLD.proposal_number OR NEW.revision_number IS DISTINCT FROM OLD.revision_number OR NEW.work_revision_ordinal IS DISTINCT FROM OLD.work_revision_ordinal) AND
 (current_setting('psa.work_mapping',true) IS DISTINCT FROM 'approved' OR NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Number changes require approved admin action';END IF;
 END IF;
 RETURN NEW;END $$;
CREATE TRIGGER crm_work_link_guard BEFORE UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_work_link_guard();
CREATE TRIGGER crm_work_link_guard BEFORE UPDATE ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.crm_work_link_guard();
CREATE TRIGGER crm_work_link_guard BEFORE UPDATE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.crm_work_link_guard();
CREATE FUNCTION public.crm_work_view(_kind text,_record uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
 DECLARE vid uuid; ord integer:=0; version_row public.crm_work_versions; work_row public.crm_work_identities; legacy text;
 BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF _kind='lead' THEN SELECT work_version_id INTO vid FROM public.crm_opportunities WHERE id=_record;
 ELSIF _kind='quote' THEN SELECT work_version_id,coalesce(work_revision_ordinal,0),proposal_number INTO vid,ord,legacy FROM public.fee_proposals WHERE id=_record;
 ELSIF _kind='project' THEN SELECT work_version_id INTO vid FROM public.pm_projects WHERE id=_record;
 ELSE RAISE EXCEPTION 'Invalid work record kind';END IF;
 IF vid IS NULL THEN RETURN jsonb_build_object('reference',legacy,'mapped',false,'canEdit',false);END IF;
 SELECT * INTO version_row FROM public.crm_work_versions WHERE id=vid;
 SELECT * INTO work_row FROM public.crm_work_identities WHERE id=version_row.work_id;
 IF work_row.id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('mapped',true,'workId',work_row.id,'versionId',vid,'reference',public.crm_work_reference(vid,ord),
 'canonicalNumber',work_row.canonical_number,'folder','P'||work_row.canonical_number||' '||work_row.name,'versionKey',version_row.version_key,
 'revision',work_row.revision,'canEdit',public.has_role(auth.uid(),'admin'));
 END $$;
REVOKE ALL ON FUNCTION public.crm_work_view(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_view(text,uuid) TO authenticated,service_role;
CREATE FUNCTION public.crm_work_edit_number(_work uuid,_number text,_expected_revision integer,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE w public.crm_work_identities; BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.crm_work_identities WHERE id=_work FOR UPDATE;
 IF w.id IS NULL OR w.revision<>_expected_revision THEN RAISE EXCEPTION 'Work identity changed; reload';END IF;
 IF NOT public.crm_work_numbering_active() AND NOT w.is_fixture THEN RAISE EXCEPTION 'Work numbering awaits approved mapping';END IF;
 IF length(trim(_reason))<3 OR _number !~ '^[0-9]{4,5}[A-Z]?$' THEN RAISE EXCEPTION 'Invalid number or reason';END IF;
 UPDATE public.crm_work_identities SET canonical_number=_number,revision=revision+1 WHERE id=w.id;
 INSERT INTO public.crm_work_identity_audit(work_id,action,before_value,after_value,reason,actor_id) VALUES(w.id,'number',to_jsonb(w),jsonb_build_object('canonical_number',_number),_reason,auth.uid());
 RETURN jsonb_build_object('number',_number);END $$;
REVOKE ALL ON FUNCTION public.crm_work_edit_number(uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_edit_number(uuid,text,integer,text) TO authenticated,service_role;
CREATE FUNCTION public.crm_work_restart(_work uuid,_year integer,_expected_revision integer,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE w public.crm_work_identities; n integer; key text; vid uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT public.crm_work_can_read(_work) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Restart requires scoped editing approval' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.crm_work_identities WHERE id=_work FOR UPDATE;
 IF w.id IS NULL OR w.revision<>_expected_revision THEN RAISE EXCEPTION 'Work identity changed; reload';END IF;
 IF NOT public.crm_work_numbering_active() AND NOT w.is_fixture THEN RAISE EXCEPTION 'Work numbering awaits approved mapping';END IF;
 IF _year<>extract(year from now() AT TIME ZONE 'Europe/Lisbon')::integer OR length(trim(_reason))<3 THEN RAISE EXCEPTION 'Invalid restart year or reason';END IF;
 SELECT coalesce(max(restart_ordinal),0)+1 INTO n FROM public.crm_work_versions WHERE work_id=_work AND restart_year=_year;
 key:=right(_year::text,2)||CASE WHEN n=1 THEN '' ELSE '-'||lpad(n::text,2,'0') END;
 INSERT INTO public.crm_work_versions(work_id,version_key,restart_year,restart_ordinal,reason) VALUES(_work,key,_year,n,_reason) RETURNING id INTO vid;
 UPDATE public.crm_work_identities SET revision=revision+1 WHERE id=_work;
 INSERT INTO public.crm_work_identity_audit(work_id,action,before_value,after_value,reason,actor_id) VALUES(_work,'restart',jsonb_build_object('folder','P'||w.canonical_number),jsonb_build_object('versionId',vid,'versionKey',key),_reason,auth.uid()); RETURN vid;
 END $$;
REVOKE ALL ON FUNCTION public.crm_work_restart(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_restart(uuid,integer,integer,text) TO authenticated,service_role;
COMMENT ON TABLE public.crm_work_numbering_gate IS 'D53: empty means OFF. No activation until final per-record mapping approval; separate from B1.';
COMMENT ON TABLE public.crm_work_number_registry IS 'Global canonical and reserved alias ownership, including protected external-folder reservations. Never recycle an alias.';