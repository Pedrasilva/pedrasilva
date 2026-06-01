-- 1) Backfill: for each collaborator with multiple is_effective=true rows,
-- keep the most recent (by effective_from desc, then reference_date desc,
-- then created_at desc) and demote the rest.
WITH ranked AS (
  SELECT
    id,
    collaborator_id,
    effective_from,
    ROW_NUMBER() OVER (
      PARTITION BY collaborator_id
      ORDER BY effective_from DESC NULLS LAST,
               reference_date DESC,
               created_at DESC
    ) AS rn
  FROM public.salary_snapshots
  WHERE is_effective = true
    AND archived_at IS NULL
),
keepers AS (
  SELECT collaborator_id, effective_from AS keeper_from
  FROM ranked
  WHERE rn = 1
)
UPDATE public.salary_snapshots s
SET is_effective = false,
    effective_to = COALESCE(
      s.effective_to,
      (k.keeper_from - INTERVAL '1 day')::date
    ),
    updated_at = now()
FROM ranked r
JOIN keepers k ON k.collaborator_id = r.collaborator_id
WHERE s.id = r.id
  AND r.rn > 1;

-- 2) Enforce at most one in-force snapshot per collaborator going forward.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_salary_snapshot_in_force_per_collab
  ON public.salary_snapshots (collaborator_id)
  WHERE is_effective = true AND archived_at IS NULL;
