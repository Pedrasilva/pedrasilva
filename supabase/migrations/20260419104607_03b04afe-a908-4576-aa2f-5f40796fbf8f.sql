-- Add subsidios_modo column to salary_snapshots
DO $$ BEGIN
  CREATE TYPE public.subsidios_modo AS ENUM ('tradicional', 'duodecimos_50', 'duodecimos_100');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.salary_snapshots
  ADD COLUMN IF NOT EXISTS subsidios_modo public.subsidios_modo NOT NULL DEFAULT 'tradicional';

COMMENT ON COLUMN public.salary_snapshots.subsidios_modo IS
  'Modo de pagamento dos subsidios de ferias e Natal: tradicional (14 meses), duodecimos_50 (metade diluida), duodecimos_100 (totalmente diluida)';