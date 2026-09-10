ALTER TABLE public.pm_tasks ADD COLUMN IF NOT EXISTS notes text;
COMMENT ON COLUMN public.pm_tasks.notes IS 'Free-text planning note for the task. UX only — never used in costing or pricing.';