CREATE TABLE public.marketing_bible_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  content_md text NOT NULL,
  pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  personas jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.marketing_bible_versions TO authenticated;
GRANT ALL ON public.marketing_bible_versions TO service_role;
ALTER TABLE public.marketing_bible_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_bible_select ON public.marketing_bible_versions FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(),'marketing.view','own') OR public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE POLICY marketing_bible_insert ON public.marketing_bible_versions FOR INSERT TO authenticated
WITH CHECK (public.has_module_permission(auth.uid(),'marketing.edit_bible','all'));

CREATE OR REPLACE FUNCTION public.marketing_bible_validate_items(_arr jsonb, _label text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE it jsonb; keys text[] := '{}'; k text;
BEGIN
  IF jsonb_typeof(_arr) <> 'array' THEN RAISE EXCEPTION '% must be a JSON array', _label; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_arr) LOOP
    IF jsonb_typeof(it) <> 'object' THEN RAISE EXCEPTION '% items must be objects', _label; END IF;
    k := btrim(coalesce(it->>'key',''));
    IF k = '' OR btrim(coalesce(it->>'name','')) = '' THEN RAISE EXCEPTION '% items need a non-empty key and name', _label; END IF;
    IF k = ANY(keys) THEN RAISE EXCEPTION 'Duplicate % key: %', _label, k; END IF;
    keys := keys || k;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_bible_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('marketing_bible_versions'));
  IF btrim(coalesce(NEW.change_summary,'')) = '' THEN RAISE EXCEPTION 'change_summary is required'; END IF;
  PERFORM public.marketing_bible_validate_items(NEW.pillars, 'pillar');
  PERFORM public.marketing_bible_validate_items(NEW.personas, 'persona');
  SELECT coalesce(max(version),0) + 1 INTO NEW.version FROM public.marketing_bible_versions;
  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_bible_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Marketing Bible versions are immutable'; END $$;

CREATE TRIGGER marketing_bible_before_insert BEFORE INSERT ON public.marketing_bible_versions
FOR EACH ROW EXECUTE FUNCTION public.marketing_bible_before_insert();
CREATE TRIGGER marketing_bible_immutable BEFORE UPDATE OR DELETE ON public.marketing_bible_versions
FOR EACH ROW EXECUTE FUNCTION public.marketing_bible_immutable();

REVOKE EXECUTE ON FUNCTION public.marketing_bible_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marketing_bible_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marketing_bible_validate_items(jsonb,text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.marketing_active_bible()
RETURNS SETOF public.marketing_bible_versions LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.marketing_bible_versions ORDER BY version DESC LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_active_bible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_active_bible() TO authenticated, service_role;

ALTER TABLE public.marketing_captures ADD COLUMN persona text NULL;