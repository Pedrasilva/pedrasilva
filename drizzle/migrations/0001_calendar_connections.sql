-- Per-person Google Calendar connection. Server-only: RLS on, no policies for anon/authenticated.
-- refresh_token_enc is AES-GCM encrypted by server code with a key held outside the database.
CREATE TABLE public.user_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  refresh_token_enc text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
REVOKE ALL ON public.user_calendar_connections FROM anon, authenticated;
GRANT ALL ON public.user_calendar_connections TO service_role;
ALTER TABLE public.user_calendar_connections ENABLE ROW LEVEL SECURITY;

-- Dismissed calendar events: ids only, owner-only.
CREATE TABLE public.calendar_dismissed_events (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
GRANT SELECT, INSERT, DELETE ON public.calendar_dismissed_events TO authenticated;
GRANT ALL ON public.calendar_dismissed_events TO service_role;
ALTER TABLE public.calendar_dismissed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own dismissed events - read" ON public.calendar_dismissed_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own dismissed events - add" ON public.calendar_dismissed_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own dismissed events - remove" ON public.calendar_dismissed_events FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Calendar events saved into a time entry. One timesheet cell can merge several events,
-- and external_id is single-valued and uniquely indexed for imports, so a separate column.
ALTER TABLE public.pm_time_entries ADD COLUMN IF NOT EXISTS calendar_event_ids text[];