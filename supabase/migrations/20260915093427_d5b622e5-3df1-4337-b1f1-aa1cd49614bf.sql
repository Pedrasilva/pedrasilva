ALTER TABLE public.remote_work_requests
  ADD COLUMN IF NOT EXISTS is_late_request boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reason text;

COMMENT ON COLUMN public.remote_work_requests.is_late_request IS 'True when the entry was created inside the policy notice window (e.g. same-day). Allowed, but flagged for monitoring.';
COMMENT ON COLUMN public.remote_work_requests.late_reason IS 'Optional justification given by the collaborator for a late (out-of-policy) remote work entry.';