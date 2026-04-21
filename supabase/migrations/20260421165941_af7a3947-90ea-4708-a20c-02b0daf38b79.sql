ALTER TABLE public.salary_snapshots
ADD COLUMN IF NOT EXISTS beneficio_variavel numeric NOT NULL DEFAULT 0;