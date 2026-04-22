-- Internal cost centres are now admin-managed instead of a closed hardcoded list.
-- Each row represents one selectable category for the "internal" timesheet bucket.
-- Archived categories stay in the DB so historical entries (which store the
-- category by NAME on pm_time_entries.internal_category) keep rendering with
-- their original label in reports — they just disappear from the picker.
CREATE TABLE IF NOT EXISTS public.pm_internal_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Names must be unique among ACTIVE categories so the picker has no duplicates.
-- Archived rows are excluded from the constraint so admins can re-create a name
-- after archiving the old one without manual cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS pm_internal_categories_active_name_uniq
  ON public.pm_internal_categories (lower(name))
  WHERE archived_at IS NULL;

ALTER TABLE public.pm_internal_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can READ (the timesheet picker needs the list).
CREATE POLICY "Authenticated read pm_internal_categories"
  ON public.pm_internal_categories
  FOR SELECT TO authenticated USING (true);

-- Only admins can manage the catalog.
CREATE POLICY "Admins insert pm_internal_categories"
  ON public.pm_internal_categories
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_internal_categories"
  ON public.pm_internal_categories
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_internal_categories"
  ON public.pm_internal_categories
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Touch updated_at on every UPDATE.
DROP TRIGGER IF EXISTS trg_pm_internal_categories_touch
  ON public.pm_internal_categories;
CREATE TRIGGER trg_pm_internal_categories_touch
  BEFORE UPDATE ON public.pm_internal_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the existing fixed five so nothing changes for users on day 1. The
-- "Fee proposals" entry is critical because the Business Development report on
-- the financials page filters time entries by that exact category name.
INSERT INTO public.pm_internal_categories (name, sort_order)
VALUES
  ('Meetings',      10),
  ('Training',      20),
  ('Fee proposals', 30),
  ('Marketing',     40),
  ('Admin',         50)
ON CONFLICT DO NOTHING;