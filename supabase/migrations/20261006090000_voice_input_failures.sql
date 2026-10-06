CREATE TABLE public.voice_input_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text,
  browser text,
  os text,
  user_agent text,
  error_name text NOT NULL,
  recording_seconds numeric,
  silent boolean,
  context_state text
);
GRANT SELECT, INSERT ON public.voice_input_failures TO authenticated;
GRANT ALL ON public.voice_input_failures TO service_role;
ALTER TABLE public.voice_input_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insert" ON public.voice_input_failures FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin read" ON public.voice_input_failures FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));