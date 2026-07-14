
-- Approval status enum
DO $$ BEGIN
  CREATE TYPE public.pm_time_entry_approval_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pm_time_entries
  ADD COLUMN IF NOT EXISTS approval_status public.pm_time_entry_approval_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_rate_override numeric(10,2),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Backfill existing entries as approved to preserve past earned value.
UPDATE public.pm_time_entries
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, updated_at)
 WHERE approval_status = 'pending'
   AND created_at < now();

CREATE INDEX IF NOT EXISTS pm_time_entries_approval_status_idx
  ON public.pm_time_entries (approval_status)
  WHERE approval_status <> 'approved';

-- Helper: can current user approve hours (admin or projects.all permission holder).
CREATE OR REPLACE FUNCTION public.pm_can_approve_hours(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(_user_id, 'admin'::app_role)
      OR has_permission(_user_id, 'projects.all');
$$;

-- Allow approvers to UPDATE any time entry (approval + adjustments).
DROP POLICY IF EXISTS "Approvers can update time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers can update time entries"
  ON public.pm_time_entries
  FOR UPDATE
  TO authenticated
  USING (public.pm_can_approve_hours(auth.uid()))
  WITH CHECK (public.pm_can_approve_hours(auth.uid()));

-- Approvers can also see any entry (bypasses retainer-only visibility rule for review).
DROP POLICY IF EXISTS "Approvers read all time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers read all time entries"
  ON public.pm_time_entries
  FOR SELECT
  TO authenticated
  USING (public.pm_can_approve_hours(auth.uid()));

-- Owner update policy: allow only while pending (approved/rejected entries are locked to owner).
DROP POLICY IF EXISTS "Users update own pending time entries" ON public.pm_time_entries;
CREATE POLICY "Users update own pending time entries"
  ON public.pm_time_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND approval_status = 'pending')
  WITH CHECK (user_id = auth.uid() AND approval_status = 'pending');
