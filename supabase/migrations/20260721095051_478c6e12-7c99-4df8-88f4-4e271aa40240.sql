
CREATE TABLE public.pm_project_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  raw_transcript TEXT,
  title TEXT,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('client_request','todo','issue_risk','decision_fact','project','engineering','status','other')),
  confidential BOOLEAN NOT NULL DEFAULT false,
  entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_id UUID REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  event_date DATE,
  source TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('voice','typed')),
  audio_path TEXT,
  ai_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pm_project_notes_project_idx ON public.pm_project_notes(project_id, created_at DESC);
CREATE INDEX pm_project_notes_author_idx ON public.pm_project_notes(author_id);
CREATE INDEX pm_project_notes_stage_idx ON public.pm_project_notes(stage_id);
CREATE INDEX pm_project_notes_category_idx ON public.pm_project_notes(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_project_notes TO authenticated;
GRANT ALL ON public.pm_project_notes TO service_role;

ALTER TABLE public.pm_project_notes ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read notes that are NOT confidential.
CREATE POLICY "Read non-confidential project notes"
  ON public.pm_project_notes FOR SELECT
  TO authenticated
  USING (confidential = false);

-- Confidential notes: admins and the note's author.
CREATE POLICY "Read confidential notes (admin or author)"
  ON public.pm_project_notes FOR SELECT
  TO authenticated
  USING (
    confidential = true
    AND (public.has_role(auth.uid(), 'admin') OR author_id = auth.uid())
  );

-- Any authenticated user can add a note as themselves.
CREATE POLICY "Insert own project notes"
  ON public.pm_project_notes FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Author or admin may update.
CREATE POLICY "Update own project notes"
  ON public.pm_project_notes FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Author or admin may delete.
CREATE POLICY "Delete own project notes"
  ON public.pm_project_notes FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pm_project_notes_updated_at
  BEFORE UPDATE ON public.pm_project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
