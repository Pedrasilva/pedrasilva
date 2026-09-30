ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS data_admissao date;

CREATE OR REPLACE VIEW public.collaborators_directory AS
SELECT id, nome, email, foto_path, departamento, language_preference, daily_hours,
  days_per_week, target_chargeability_pct, numero_colaborador, archived_at, archived_by,
  ano_fiscal, dias_ferias_anuais, dias_ferias_extra, data_nascimento, inicio_carreira,
  created_at, updated_at, data_admissao
FROM public.collaborators;