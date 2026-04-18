ALTER TABLE public.collaborators
  ADD COLUMN localizacao text NOT NULL DEFAULT 'continente',
  ADD COLUMN estado_civil text NOT NULL DEFAULT 'solteiro',
  ADD COLUMN numero_titulares integer NOT NULL DEFAULT 1,
  ADD COLUMN numero_dependentes integer NOT NULL DEFAULT 0,
  ADD COLUMN dependentes_com_deficiencia integer NOT NULL DEFAULT 0,
  ADD COLUMN ano_fiscal integer NOT NULL DEFAULT 2026;

-- Backfill from latest effective snapshot per collaborator (if exists)
UPDATE public.collaborators c
SET localizacao = s.localizacao,
    estado_civil = s.estado_civil,
    numero_titulares = s.numero_titulares,
    numero_dependentes = s.numero_dependentes,
    dependentes_com_deficiencia = s.dependentes_com_deficiencia,
    ano_fiscal = s.ano_fiscal
FROM (
  SELECT DISTINCT ON (collaborator_id)
    collaborator_id, localizacao, estado_civil, numero_titulares,
    numero_dependentes, dependentes_com_deficiencia, ano_fiscal
  FROM public.salary_snapshots
  ORDER BY collaborator_id, is_effective DESC, reference_date DESC
) s
WHERE c.id = s.collaborator_id;