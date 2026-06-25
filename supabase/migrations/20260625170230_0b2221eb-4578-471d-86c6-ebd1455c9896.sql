-- Dedupe non_working time entries (same user, date, leave_type) and prevent future dups.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, entry_date, entry_type, COALESCE(leave_type, '')
           ORDER BY created_at, id
         ) AS rn
  FROM public.pm_time_entries
  WHERE entry_type = 'non_working'
)
DELETE FROM public.pm_time_entries t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pm_time_entries_nonworking_unique
  ON public.pm_time_entries (user_id, entry_date, leave_type)
  WHERE entry_type = 'non_working';