
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS phase_group text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS retainer_monthly_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_phase_group_chk;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_phase_group_chk
  CHECK (phase_group IN ('project', 'construction'));

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_billing_model_chk;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_billing_model_chk
  CHECK (billing_model IN ('stage', 'monthly', 'retainer'));

UPDATE public.quote_stages
SET phase_group = 'construction', billing_model = 'retainer'
WHERE lower(name) ~ '^(concurso|tender|assist[êe]ncia|rece[pç][çc]?[ãa]o|obra)';

CREATE INDEX IF NOT EXISTS idx_quote_stages_phase_group
  ON public.quote_stages(quote_id, phase_group);
