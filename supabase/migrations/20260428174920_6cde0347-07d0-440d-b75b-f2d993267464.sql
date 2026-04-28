-- 1. Add new columns to salary_snapshots
ALTER TABLE public.salary_snapshots
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_log_id uuid;

-- 2. Backfill effective_from from existing reference_date
UPDATE public.salary_snapshots
SET effective_from = reference_date
WHERE effective_from IS NULL;

-- 3. Make effective_from required
ALTER TABLE public.salary_snapshots
  ALTER COLUMN effective_from SET NOT NULL;

-- 4. Constrain source values
ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_source_check;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_source_check
    CHECK (source IN ('manual', 'excel_import', 'api'));

-- 5. Foreign key to financial_import_logs (nullable; only set for imported rows)
ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_import_log_id_fkey;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_import_log_id_fkey
    FOREIGN KEY (import_log_id)
    REFERENCES public.financial_import_logs(id)
    ON DELETE SET NULL;

-- 6. Index for effective-date lookups
CREATE INDEX IF NOT EXISTS idx_salary_snapshots_effective
  ON public.salary_snapshots (collaborator_id, effective_from DESC);

-- 7. Effective-date sanity: end >= start when set
ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_effective_range_check;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_effective_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- 8. Immutability guard: never overwrite financial fields on existing salary rows.
-- Editable fields: label, notas, effective_to, is_effective, updated_at, source, import_log_id.
-- All other financial/contextual fields are frozen once written.
CREATE OR REPLACE FUNCTION public.salary_snapshots_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.collaborator_id IS DISTINCT FROM OLD.collaborator_id THEN
    RAISE EXCEPTION 'salary_snapshots.collaborator_id is immutable';
  END IF;
  IF NEW.reference_date IS DISTINCT FROM OLD.reference_date THEN
    RAISE EXCEPTION 'salary_snapshots.reference_date is immutable';
  END IF;
  IF NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'salary_snapshots.effective_from is immutable — create a new record instead';
  END IF;
  IF NEW.valor_base IS DISTINCT FROM OLD.valor_base
     OR NEW.ss_atelier_pct IS DISTINCT FROM OLD.ss_atelier_pct
     OR NEW.ss_colaborador_pct IS DISTINCT FROM OLD.ss_colaborador_pct
     OR NEW.irs_pct IS DISTINCT FROM OLD.irs_pct
     OR NEW.meses_pagos IS DISTINCT FROM OLD.meses_pagos
     OR NEW.subsidios_modo IS DISTINCT FROM OLD.subsidios_modo
     OR NEW.subsidio_alimentacao_diario IS DISTINCT FROM OLD.subsidio_alimentacao_diario
     OR NEW.subsidio_alimentacao_manual IS DISTINCT FROM OLD.subsidio_alimentacao_manual
     OR NEW.subsidio_alimentacao_diario_manual IS DISTINCT FROM OLD.subsidio_alimentacao_diario_manual
     OR NEW.dias_uteis IS DISTINCT FROM OLD.dias_uteis
     OR NEW.ajudas_custo_anual IS DISTINCT FROM OLD.ajudas_custo_anual
     OR NEW.beneficio_carro IS DISTINCT FROM OLD.beneficio_carro
     OR NEW.beneficio_ticket IS DISTINCT FROM OLD.beneficio_ticket
     OR NEW.premio_associado IS DISTINCT FROM OLD.premio_associado
     OR NEW.outros_beneficios IS DISTINCT FROM OLD.outros_beneficios
     OR NEW.beneficio_variavel IS DISTINCT FROM OLD.beneficio_variavel
     OR NEW.localizacao IS DISTINCT FROM OLD.localizacao
     OR NEW.estado_civil IS DISTINCT FROM OLD.estado_civil
     OR NEW.numero_titulares IS DISTINCT FROM OLD.numero_titulares
     OR NEW.numero_dependentes IS DISTINCT FROM OLD.numero_dependentes
     OR NEW.dependentes_com_deficiencia IS DISTINCT FROM OLD.dependentes_com_deficiencia
     OR NEW.ano_fiscal IS DISTINCT FROM OLD.ano_fiscal
     OR NEW.irs_calculado_auto IS DISTINCT FROM OLD.irs_calculado_auto
  THEN
    RAISE EXCEPTION
      'salary_snapshots financial fields are immutable. Create a new effective-dated record instead of editing % .', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_snapshots_guard_immutable ON public.salary_snapshots;
CREATE TRIGGER trg_salary_snapshots_guard_immutable
  BEFORE UPDATE ON public.salary_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.salary_snapshots_guard_immutable();

-- 9. Salary counter on import logs
ALTER TABLE public.financial_import_logs
  ADD COLUMN IF NOT EXISTS rows_salary_snapshots integer NOT NULL DEFAULT 0;