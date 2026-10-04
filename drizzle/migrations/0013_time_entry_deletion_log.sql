CREATE TABLE public.pm_time_entry_deletion_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  entry_user_id uuid,
  entry jsonb not null,
  reason text not null,
  deleted_by text not null,
  deleted_at timestamptz not null default now()
);
GRANT SELECT ON public.pm_time_entry_deletion_log TO authenticated;
GRANT ALL ON public.pm_time_entry_deletion_log TO service_role;
ALTER TABLE public.pm_time_entry_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read time entry deletion log" ON public.pm_time_entry_deletion_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));