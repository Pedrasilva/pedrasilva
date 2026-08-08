ALTER TABLE public.email_sync_state
  DROP COLUMN IF EXISTS oauth_refresh_token;

ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS connector_secret_name text NOT NULL DEFAULT 'GOOGLE_MAIL_API_KEY',
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- The connector secret name is not a credential: it is only the name of the
-- environment variable that holds the Lovable-managed connector key.
COMMENT ON COLUMN public.email_sync_state.connector_secret_name IS
  'Name of the environment variable holding the Lovable connector key for this inbox (e.g. GOOGLE_MAIL_API_KEY, GOOGLE_MAIL_API_KEY_2). Never a token value.';

CREATE OR REPLACE FUNCTION public.email_sync_state_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sync_state_touch ON public.email_sync_state;
CREATE TRIGGER trg_email_sync_state_touch
  BEFORE UPDATE ON public.email_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.email_sync_state_touch_updated_at();

-- Admins may now manage inbox registrations from the settings screen; the row
-- no longer contains any secret material.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sync_state TO authenticated;
GRANT ALL ON public.email_sync_state TO service_role;

DROP POLICY IF EXISTS "Admins manage email sync state" ON public.email_sync_state;
CREATE POLICY "Admins manage email sync state"
  ON public.email_sync_state FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));