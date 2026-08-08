CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text UNIQUE NOT NULL,
  thread_id text NOT NULL,
  from_address text,
  subject text,
  snippet text,
  received_at timestamptz,
  category text,
  confidence numeric,
  suggested_action text,
  draft_reply text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_events_auth_read" ON public.email_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_events_auth_write" ON public.email_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "email_events_auth_update" ON public.email_events
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "email_events_admin_delete" ON public.email_events
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_email_events_status ON public.email_events (status, received_at DESC);
CREATE INDEX idx_email_events_thread ON public.email_events (thread_id);

CREATE TABLE public.email_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  auto_action text,
  requires_review boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_rules TO authenticated;
GRANT ALL ON public.email_rules TO service_role;
ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_rules_auth_read" ON public.email_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_rules_admin_manage" ON public.email_rules
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.email_rules_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER email_rules_touch_updated_at_trg
BEFORE UPDATE ON public.email_rules
FOR EACH ROW EXECUTE FUNCTION public.email_rules_touch_updated_at();

CREATE TABLE public.email_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_address text NOT NULL UNIQUE,
  last_checked_at timestamptz,
  last_history_id text,
  oauth_refresh_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_sync_state TO service_role;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_sync_state_service_only" ON public.email_sync_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER email_sync_state_touch_updated_at_trg
BEFORE UPDATE ON public.email_sync_state
FOR EACH ROW EXECUTE FUNCTION public.email_rules_touch_updated_at();