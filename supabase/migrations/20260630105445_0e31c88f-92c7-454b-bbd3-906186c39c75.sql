
ALTER TABLE public.vacation_requests
  ALTER COLUMN dias_uteis TYPE numeric(5,2) USING dias_uteis::numeric,
  ADD COLUMN IF NOT EXISTS periodo text NOT NULL DEFAULT 'dia_inteiro'
    CHECK (periodo IN ('dia_inteiro','manha','tarde','horas')),
  ADD COLUMN IF NOT EXISTS horas numeric(5,2);
