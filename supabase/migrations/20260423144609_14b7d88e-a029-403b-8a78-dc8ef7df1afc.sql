ALTER TABLE public.collaborators
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid,
  ADD COLUMN archive_reason text;

CREATE INDEX idx_collaborators_archived_at
  ON public.collaborators (archived_at)
  WHERE archived_at IS NULL;