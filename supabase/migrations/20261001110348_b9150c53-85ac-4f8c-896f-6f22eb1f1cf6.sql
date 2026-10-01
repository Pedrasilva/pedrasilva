CREATE TABLE public.marketing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('client_interview','podcast','photo_session','clearance_request','other')),
  title text NOT NULL,
  brief text,
  owner_user_id uuid NOT NULL,
  helper_user_ids uuid[] NOT NULL DEFAULT '{}',
  due_date date,
  profile_id uuid REFERENCES public.marketing_project_profiles(id) ON DELETE SET NULL,
  crm_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'hub' CHECK (channel IN ('hub','email')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  outcome_notes text,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_actions_owner_idx ON public.marketing_actions (owner_user_id, status);
CREATE INDEX marketing_actions_helpers_idx ON public.marketing_actions USING gin (helper_user_ids);

GRANT SELECT, INSERT, UPDATE ON public.marketing_actions TO authenticated;
GRANT ALL ON public.marketing_actions TO service_role;
ALTER TABLE public.marketing_actions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marketing_is_action_participant(_user_id uuid, _action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketing_actions a
    WHERE a.id = _action_id AND (a.owner_user_id = _user_id OR _user_id = ANY (a.helper_user_ids)))
$$;
CREATE OR REPLACE FUNCTION public.marketing_can_see_action(_user_id uuid, _action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_module_permission(_user_id, 'marketing.curate', 'all')
      OR public.marketing_is_action_participant(_user_id, _action_id)
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_is_action_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketing_can_see_action(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_is_action_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_can_see_action(uuid, uuid) TO authenticated, service_role;

CREATE POLICY ma_select ON public.marketing_actions FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
         OR owner_user_id = auth.uid() OR auth.uid() = ANY (helper_user_ids));
CREATE POLICY ma_insert ON public.marketing_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_module_permission(auth.uid(), 'marketing.curate', 'all') AND created_by = auth.uid() AND status = 'open');
CREATE POLICY ma_update ON public.marketing_actions FOR UPDATE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
         OR owner_user_id = auth.uid() OR auth.uid() = ANY (helper_user_ids));

-- Participants (non-curators) may only add outcome notes and mark done, while open.
CREATE OR REPLACE FUNCTION public.marketing_actions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at := now();
    NEW.completed_by := COALESCE(auth.uid(), NEW.completed_by);
  END IF;
  IF auth.role() = 'service_role' OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all') THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'action_not_open'; END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.brief IS DISTINCT FROM OLD.brief OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.helper_user_ids IS DISTINCT FROM OLD.helper_user_ids OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.crm_company_id IS DISTINCT FROM OLD.crm_company_id
     OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.status NOT IN ('open','done') THEN
    RAISE EXCEPTION 'only_outcome_fields_allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_actions_guard_trg BEFORE UPDATE ON public.marketing_actions
  FOR EACH ROW EXECUTE FUNCTION public.marketing_actions_guard();

-- Keep one reminder per person in sync and ring the bell.
CREATE OR REPLACE FUNCTION public.marketing_action_support_key(_action_id uuid, _user_id uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(_action_id::text || ':' || _user_id::text)::uuid
$$;

CREATE OR REPLACE FUNCTION public.marketing_actions_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _st text := NEW.status;
  _h uuid;
  _old_people uuid[] := '{}';
  _link text := '/marketing/actions/' || NEW.id;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _old_people := array_append(OLD.helper_user_ids, OLD.owner_user_id);
    -- helpers removed (or promoted to owner): drop their support reminder
    FOREACH _h IN ARRAY OLD.helper_user_ids LOOP
      IF NOT (_h = ANY (NEW.helper_user_ids)) OR _h = NEW.owner_user_id THEN
        DELETE FROM public.reminders WHERE entity_type = 'marketing_action_support'
          AND entity_id = public.marketing_action_support_key(NEW.id, _h);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.reminders (owner_user_id, created_by, title, due_date, module, entity_type, entity_id, status, completed_at)
  VALUES (NEW.owner_user_id, NEW.created_by, NEW.title, NEW.due_date, 'marketing', 'marketing_action', NEW.id, _st,
          CASE WHEN _st = 'open' THEN NULL ELSE now() END)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, title = EXCLUDED.title,
    due_date = EXCLUDED.due_date, status = EXCLUDED.status, completed_at = EXCLUDED.completed_at;

  FOREACH _h IN ARRAY NEW.helper_user_ids LOOP
    CONTINUE WHEN _h = NEW.owner_user_id;
    INSERT INTO public.reminders (owner_user_id, created_by, title, due_date, module, entity_type, entity_id, status, completed_at)
    VALUES (_h, NEW.created_by, 'Apoio: ' || NEW.title || ' · Support: ' || NEW.title, NEW.due_date, 'marketing',
            'marketing_action_support', public.marketing_action_support_key(NEW.id, _h), _st,
            CASE WHEN _st = 'open' THEN NULL ELSE now() END)
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, title = EXCLUDED.title,
      due_date = EXCLUDED.due_date, status = EXCLUDED.status, completed_at = EXCLUDED.completed_at;
  END LOOP;

  IF NEW.status = 'open' THEN
    IF NOT (NEW.owner_user_id = ANY (_old_people)) THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
      VALUES (NEW.owner_user_id, 'marketing_action', 'Nova ação: ' || NEW.title || ' · New action: ' || NEW.title,
              NEW.brief, _link, 'marketing', 'marketing_action', NEW.id, 'marketing_action:' || NEW.id || ':' || NEW.owner_user_id)
      ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END IF;
    FOREACH _h IN ARRAY NEW.helper_user_ids LOOP
      CONTINUE WHEN _h = NEW.owner_user_id OR _h = ANY (_old_people);
      INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
      VALUES (_h, 'marketing_action', 'Apoio: ' || NEW.title || ' · Support: ' || NEW.title,
              NEW.brief, _link, 'marketing', 'marketing_action', NEW.id, 'marketing_action:' || NEW.id || ':' || _h)
      ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'done' AND OLD.status <> 'done' AND NEW.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
    VALUES (NEW.created_by, 'marketing_action', 'Ação concluída: ' || NEW.title || ' · Action completed: ' || NEW.title,
            NEW.outcome_notes, _link, 'marketing', 'marketing_action', NEW.id, 'marketing_action_done:' || NEW.id)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_actions_sync() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_actions_sync_trg AFTER INSERT OR UPDATE ON public.marketing_actions
  FOR EACH ROW EXECUTE FUNCTION public.marketing_actions_sync();

-- Resolve an action id from either the action id or a helper's reminder key (visible actions only).
CREATE OR REPLACE FUNCTION public.marketing_resolve_action(_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id FROM public.marketing_actions a
  WHERE (a.id = _id OR EXISTS (SELECT 1 FROM unnest(a.helper_user_ids) h WHERE public.marketing_action_support_key(a.id, h) = _id))
    AND public.marketing_can_see_action(auth.uid(), a.id)
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_resolve_action(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_resolve_action(uuid) TO authenticated;

CREATE TABLE public.marketing_action_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.marketing_actions(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('brief','outcome')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  routed_to text CHECK (routed_to IN ('briefing','capture','file')),
  routed_id uuid,
  routed_note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_action_files_action_idx ON public.marketing_action_files (action_id);
GRANT SELECT, INSERT, DELETE ON public.marketing_action_files TO authenticated;
GRANT ALL ON public.marketing_action_files TO service_role;
ALTER TABLE public.marketing_action_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY maf_select ON public.marketing_action_files FOR SELECT TO authenticated
  USING (public.marketing_can_see_action(auth.uid(), action_id));
CREATE POLICY maf_insert ON public.marketing_action_files FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND routed_to IS NULL AND (
    (purpose = 'brief' AND public.has_module_permission(auth.uid(), 'marketing.curate', 'all'))
    OR (purpose = 'outcome' AND public.marketing_can_see_action(auth.uid(), action_id)
        AND EXISTS (SELECT 1 FROM public.marketing_actions a WHERE a.id = action_id AND a.status = 'open'))));
CREATE POLICY maf_delete ON public.marketing_action_files FOR DELETE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));

-- Files under marketing-assets/actions/<action_id>/
CREATE POLICY marketing_actions_obj_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'actions'
         AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
         AND public.marketing_can_see_action(auth.uid(), ((storage.foldername(name))[2])::uuid));
CREATE POLICY marketing_actions_obj_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'actions'
         AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
         AND public.marketing_can_see_action(auth.uid(), ((storage.foldername(name))[2])::uuid));
CREATE POLICY marketing_actions_obj_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'actions'
         AND public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));