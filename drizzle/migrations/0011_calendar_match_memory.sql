CREATE TABLE public.calendar_match_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  key_type text NOT NULL CHECK (key_type IN ('series','word')),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 300),
  project_id uuid REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  opportunity_id uuid,
  internal_category text,
  uses integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key_type, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_match_memory TO authenticated;
GRANT ALL ON public.calendar_match_memory TO service_role;
ALTER TABLE public.calendar_match_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own calendar match memory" ON public.calendar_match_memory
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
COMMENT ON TABLE public.calendar_match_memory IS 'Per-person calendar→timesheet choices. Keys are a recurring series id or one distinctive word; never titles or other event content.';