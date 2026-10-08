CREATE OR REPLACE FUNCTION public.current_finance_entity()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.entity_id FROM public.finance_entity_preferences p
      WHERE p.user_id = auth.uid() AND public.has_entity_access(p.entity_id)),
    (SELECT e.id FROM public.finance_entities e
      WHERE e.active AND public.has_entity_access(e.id)
      ORDER BY (e.id = '00000000-0000-4000-a000-000000000001') DESC, e.created_at LIMIT 1)
  )
$$;

-- A row is visible only for an entity the user can access AND that is their current entity:
-- no query can ever mix two entities.
CREATE OR REPLACE FUNCTION public.fin_row_visible(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_entity_access(_entity_id) AND _entity_id = public.current_finance_entity()
$$;

DO $$
DECLARE r record; sql text;
BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND (coalesce(qual,'') LIKE '%has_entity_access(%' OR coalesce(with_check,'') LIKE '%has_entity_access(%') LOOP
    sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN sql := sql || format(' USING (%s)', replace(r.qual,'has_entity_access(','fin_row_visible(')); END IF;
    IF r.with_check IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', replace(r.with_check,'has_entity_access(','fin_row_visible(')); END IF;
    EXECUTE sql;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_finance_entity(_entity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_entity_access(_entity_id) THEN RAISE EXCEPTION 'No access to this entity'; END IF;
  INSERT INTO public.finance_entity_preferences (user_id, entity_id) VALUES (auth.uid(), _entity_id)
  ON CONFLICT (user_id) DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = now();
  RETURN _entity_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_finance_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_entity() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_finance_entities()
RETURNS TABLE(id uuid, name text, nif text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, e.nif FROM public.finance_entities e
  WHERE e.active AND public.has_entity_access(e.id) ORDER BY e.created_at
$$;
GRANT EXECUTE ON FUNCTION public.my_finance_entities() TO authenticated;

INSERT INTO public.finance_entities (name, nif) VALUES ('Pedra Rioja', '513789898') ON CONFLICT (nif) DO NOTHING;