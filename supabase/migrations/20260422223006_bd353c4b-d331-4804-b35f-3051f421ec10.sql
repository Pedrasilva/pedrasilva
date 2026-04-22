ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS language_preference text NOT NULL DEFAULT 'pt-PT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collaborators_language_preference_check'
  ) THEN
    ALTER TABLE public.collaborators
      ADD CONSTRAINT collaborators_language_preference_check
      CHECK (language_preference IN ('en', 'pt-PT'));
  END IF;
END $$;