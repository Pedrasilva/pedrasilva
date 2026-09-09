ALTER TABLE public.pm_internal_categories
  ADD COLUMN IF NOT EXISTS visible_to_profiles text[] NOT NULL DEFAULT ARRAY['project','mixed','support']::text[];

ALTER TABLE public.pm_internal_categories
  ADD CONSTRAINT pm_internal_categories_visible_profiles_chk
  CHECK (
    array_length(visible_to_profiles, 1) >= 1
    AND visible_to_profiles <@ ARRAY['project','mixed','support']::text[]
  );

COMMENT ON COLUMN public.pm_internal_categories.visible_to_profiles IS
  'Timesheet UX only: which collaborators.work_profile values may pick this category for NEW entries. Never used in costing/pricing. Historical entries are unaffected.';

UPDATE public.pm_internal_categories SET visible_to_profiles = ARRAY['project','mixed','support']::text[]
  WHERE name IN ('Meetings','Training','Other Internal','Admin','General Administration');
UPDATE public.pm_internal_categories SET visible_to_profiles = ARRAY['project','mixed']::text[]
  WHERE name IN ('Fee proposals','Fee Proposals','Business Development');
UPDATE public.pm_internal_categories SET visible_to_profiles = ARRAY['mixed']::text[]
  WHERE name IN ('Marketing','Communication','Photography / Video','Website / Digital','Awards / Publications');
UPDATE public.pm_internal_categories SET visible_to_profiles = ARRAY['support']::text[]
  WHERE name IN ('Bookkeeping','Bank Reconciliation','Supplier / Purchasing Administration','HR Administration','Office Management','Finance / Reporting');
UPDATE public.pm_internal_categories SET visible_to_profiles = ARRAY['mixed','support']::text[]
  WHERE name = 'General Administration';