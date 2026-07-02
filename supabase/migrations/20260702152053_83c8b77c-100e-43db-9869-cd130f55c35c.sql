ALTER TABLE public.quote_site_trips ADD COLUMN IF NOT EXISTS resource_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill: promote legacy single resource_id into the new array
UPDATE public.quote_site_trips
SET resource_ids = ARRAY[resource_id]::uuid[]
WHERE resource_id IS NOT NULL
  AND (resource_ids IS NULL OR array_length(resource_ids, 1) IS NULL);