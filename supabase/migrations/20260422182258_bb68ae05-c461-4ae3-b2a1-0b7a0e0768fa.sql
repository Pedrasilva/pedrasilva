-- Add entry_type enum and supporting columns to pm_time_entries
DO $$ BEGIN
  CREATE TYPE public.pm_time_entry_type AS ENUM ('project', 'internal', 'non_working');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pm_time_entries
  ADD COLUMN IF NOT EXISTS entry_type public.pm_time_entry_type NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS internal_category text,
  ADD COLUMN IF NOT EXISTS leave_type text;

-- Make task_id nullable (internal/non-working don't have a task)
ALTER TABLE public.pm_time_entries ALTER COLUMN task_id DROP NOT NULL;

-- Validation: ensure consistency between entry_type and supporting columns
CREATE OR REPLACE FUNCTION public.pm_time_entry_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_type = 'project' THEN
    IF NEW.task_id IS NULL THEN
      RAISE EXCEPTION 'project time entries require task_id';
    END IF;
    NEW.internal_category := NULL;
    NEW.leave_type := NULL;
  ELSIF NEW.entry_type = 'internal' THEN
    IF NEW.internal_category IS NULL OR length(trim(NEW.internal_category)) = 0 THEN
      RAISE EXCEPTION 'internal time entries require internal_category';
    END IF;
    NEW.task_id := NULL;
    NEW.leave_type := NULL;
    -- Internal time is always non-billable
    NEW.billable := false;
  ELSIF NEW.entry_type = 'non_working' THEN
    IF NEW.leave_type IS NULL OR length(trim(NEW.leave_type)) = 0 THEN
      RAISE EXCEPTION 'non_working time entries require leave_type';
    END IF;
    NEW.task_id := NULL;
    NEW.internal_category := NULL;
    NEW.billable := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_time_entries_validate ON public.pm_time_entries;
CREATE TRIGGER pm_time_entries_validate
  BEFORE INSERT OR UPDATE ON public.pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.pm_time_entry_validate();

CREATE INDEX IF NOT EXISTS pm_time_entries_user_date_type_idx
  ON public.pm_time_entries (user_id, entry_date, entry_type);