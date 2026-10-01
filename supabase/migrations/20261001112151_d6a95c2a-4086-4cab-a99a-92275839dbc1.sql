ALTER TABLE public.marketing_project_story_suggestions ADD COLUMN IF NOT EXISTS accepted_text text NULL;

CREATE OR REPLACE FUNCTION public.marketing_story_suggestions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.capture_id IS DISTINCT FROM OLD.capture_id OR NEW.field IS DISTINCT FROM OLD.field
     OR NEW.suggested_text IS DISTINCT FROM OLD.suggested_text OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only status can change on a story suggestion';
  END IF;
  IF NEW.accepted_text IS DISTINCT FROM OLD.accepted_text
     AND NOT (OLD.status = 'pending' AND NEW.status = 'accepted') THEN
    RAISE EXCEPTION 'accepted_text can only be set when accepting';
  END IF;
  NEW.reviewed_by := auth.uid();
  NEW.reviewed_at := now();
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.marketing_accept_story_suggestion(uuid);
CREATE OR REPLACE FUNCTION public.marketing_accept_story_suggestion(_id uuid, _text text DEFAULT NULL, _mode text DEFAULT 'append')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s record; v text;
BEGIN
  IF _mode NOT IN ('append','replace') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  SELECT * INTO s FROM public.marketing_project_story_suggestions WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found or already reviewed'; END IF;
  v := coalesce(nullif(trim(_text),''), s.suggested_text);
  IF _mode = 'replace' THEN
    EXECUTE format('UPDATE public.marketing_project_profiles SET %1$I = $1 WHERE id = $2', s.field) USING v, s.profile_id;
  ELSE
    EXECUTE format(
      'UPDATE public.marketing_project_profiles SET %1$I = CASE WHEN coalesce(trim(%1$I),'''') = '''' THEN $1 ELSE %1$I || E''\n\n'' || $1 END WHERE id = $2',
      s.field) USING v, s.profile_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed to edit this profile'; END IF;
  UPDATE public.marketing_project_story_suggestions SET status = 'accepted', accepted_text = v WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_accept_story_suggestion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_accept_story_suggestion(uuid, text, text) TO authenticated;