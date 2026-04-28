-- Step 1: Add new enum values for the 3-workflow split.
-- We DO NOT use these values in the same statement; backfill happens in a
-- separate migration the user runs immediately after this one.
ALTER TYPE public.crm_quote_category ADD VALUE IF NOT EXISTS 'time_based';
ALTER TYPE public.crm_quote_category ADD VALUE IF NOT EXISTS 'retainer';