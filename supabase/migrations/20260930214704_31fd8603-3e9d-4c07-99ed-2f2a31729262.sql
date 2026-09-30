CREATE TABLE public.user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('none','own','view','edit','team','all')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  UNIQUE (user_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_access TO authenticated;
GRANT ALL ON public.user_access TO service_role;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage target access" ON public.user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.user_access_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); NEW.updated_by = auth.uid(); RETURN NEW; END; $$;
CREATE TRIGGER user_access_touch BEFORE UPDATE ON public.user_access FOR EACH ROW EXECUTE FUNCTION public.user_access_touch();