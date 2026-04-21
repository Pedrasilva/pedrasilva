ALTER TABLE public.salary_snapshots
ADD COLUMN IF NOT EXISTS subsidio_alimentacao_manual boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS subsidio_alimentacao_diario_manual numeric NOT NULL DEFAULT 0;