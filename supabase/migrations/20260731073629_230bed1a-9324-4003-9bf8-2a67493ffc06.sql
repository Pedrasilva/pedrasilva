-- 1. Audit marker for parked legacy permission rows
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- 2. Two-arg approval check (scoped to the target user)
CREATE OR REPLACE FUNCTION public.pm_can_approve_hours(_user_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT has_role(_user_id, 'admin'::app_role)
      OR has_module_permission(_user_id, 'timesheets.approve', 'all')
      OR (
        has_module_permission(_user_id, 'timesheets.approve', 'team')
        AND pm_has_team_access(_user_id, _target_user_id)
      );
$function$;

-- 3. One-arg gate: "can this user approve anything at all?" (UI menus)
CREATE OR REPLACE FUNCTION public.pm_can_approve_hours(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT has_role(_user_id, 'admin'::app_role)
      OR has_module_permission(_user_id, 'timesheets.approve', 'team');
$function$;

-- 4. RLS: approver policies key off the target user, no legacy projects.all branch
DROP POLICY IF EXISTS "Approvers read all time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers read all time entries"
  ON public.pm_time_entries
  FOR SELECT
  TO authenticated
  USING (public.pm_can_approve_hours(auth.uid(), user_id));

DROP POLICY IF EXISTS "Approvers can update time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers can update time entries"
  ON public.pm_time_entries
  FOR UPDATE
  TO authenticated
  USING (public.pm_can_approve_hours(auth.uid(), user_id))
  WITH CHECK (public.pm_can_approve_hours(auth.uid(), user_id));