
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pm_project_note_category') THEN
    CREATE TYPE public.pm_project_note_category AS ENUM (
      'client_request','todo','issue_risk','decision_fact','project','engineering','status','other'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pm_project_note_source') THEN
    CREATE TYPE public.pm_project_note_source AS ENUM ('voice','typed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.pm_project_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  raw_transcript TEXT,
  title TEXT,
  category public.pm_project_note_category NOT NULL DEFAULT 'other',
  confidential BOOLEAN NOT NULL DEFAULT false,
  event_date DATE,
  entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  source public.pm_project_note_source NOT NULL DEFAULT 'typed',
  audio_path TEXT,
  ai_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_project_notes_project_idx ON public.pm_project_notes(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pm_project_notes_category_idx ON public.pm_project_notes(project_id, category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_project_notes TO authenticated;
GRANT ALL ON public.pm_project_notes TO service_role;

ALTER TABLE public.pm_project_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes select non-confidential" ON public.pm_project_notes;
CREATE POLICY "notes select non-confidential"
  ON public.pm_project_notes FOR SELECT
  TO authenticated
  USING (
    confidential = false
    OR author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "notes insert self" ON public.pm_project_notes;
CREATE POLICY "notes insert self"
  ON public.pm_project_notes FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "notes update author or admin" ON public.pm_project_notes;
CREATE POLICY "notes update author or admin"
  ON public.pm_project_notes FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "notes delete author or admin" ON public.pm_project_notes;
CREATE POLICY "notes delete author or admin"
  ON public.pm_project_notes FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS pm_project_notes_updated_at ON public.pm_project_notes;
CREATE TRIGGER pm_project_notes_updated_at
  BEFORE UPDATE ON public.pm_project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for project-note-audio bucket (already created)
DROP POLICY IF EXISTS "note audio read own or admin" ON storage.objects;
CREATE POLICY "note audio read own or admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-note-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "note audio insert own" ON storage.objects;
CREATE POLICY "note audio insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-note-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "note audio delete own or admin" ON storage.objects;
CREATE POLICY "note audio delete own or admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-note-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );
