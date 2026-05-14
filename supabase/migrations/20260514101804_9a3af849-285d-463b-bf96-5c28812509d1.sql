ALTER TABLE public.salary_snapshots
ADD COLUMN IF NOT EXISTS plano_reforma numeric NOT NULL DEFAULT 0;