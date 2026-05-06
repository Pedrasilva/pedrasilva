
-- Add CRM opportunity workspace fields
ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_date date,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Activity type enum
DO $$ BEGIN
  CREATE TYPE public.opportunity_activity_type AS ENUM ('call','email','meeting','note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Activities table
CREATE TABLE IF NOT EXISTS public.opportunity_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  type public.opportunity_activity_type NOT NULL DEFAULT 'note',
  content text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_activities_opp_idx
  ON public.opportunity_activities (opportunity_id, created_at DESC);

ALTER TABLE public.opportunity_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read opportunity_activities" ON public.opportunity_activities;
CREATE POLICY "Authenticated read opportunity_activities"
  ON public.opportunity_activities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert opportunity_activities" ON public.opportunity_activities;
CREATE POLICY "Authenticated insert opportunity_activities"
  ON public.opportunity_activities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authors or admins update opportunity_activities" ON public.opportunity_activities;
CREATE POLICY "Authors or admins update opportunity_activities"
  ON public.opportunity_activities FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Authors or admins delete opportunity_activities" ON public.opportunity_activities;
CREATE POLICY "Authors or admins delete opportunity_activities"
  ON public.opportunity_activities FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Trigger: bump opportunities.last_activity_at on activity insert
CREATE OR REPLACE FUNCTION public.opportunity_activities_touch_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_opportunities
    SET last_activity_at = NEW.created_at,
        updated_at = now()
    WHERE id = NEW.opportunity_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_opportunity_activities_touch_parent ON public.opportunity_activities;
CREATE TRIGGER trg_opportunity_activities_touch_parent
  AFTER INSERT ON public.opportunity_activities
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_activities_touch_parent();
