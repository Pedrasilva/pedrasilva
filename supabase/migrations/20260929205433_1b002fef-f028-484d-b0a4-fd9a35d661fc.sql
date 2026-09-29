-- lovable-cron-fallback-reviewed: Gmail push needs Pub/Sub setup; user specified 5-minute polling like existing intake hooks.
CREATE TABLE public.marketing_email_ignored (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  capture_id uuid NULL REFERENCES public.marketing_captures(id) ON DELETE CASCADE,
  from_address text,
  subject text,
  attachment_filename text NULL,
  reason text NOT NULL CHECK (reason IN ('external_sender','unsupported_type','attachment_too_large','inline_image','empty')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_email_ignored_message_idx ON public.marketing_email_ignored(message_id);
CREATE INDEX marketing_email_ignored_capture_idx ON public.marketing_email_ignored(capture_id);
GRANT SELECT ON public.marketing_email_ignored TO authenticated;
GRANT ALL ON public.marketing_email_ignored TO service_role;
ALTER TABLE public.marketing_email_ignored ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_email_ignored_select ON public.marketing_email_ignored
  FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));

-- Intake secret lives only in Vault; value generated here, never written in this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'marketing_intake_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'marketing_intake_secret',
      'Shared secret for /api/public/hooks/marketing-intake'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_intake_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT coalesce(p_secret, '') <> '' AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'marketing_intake_secret' AND decrypted_secret = p_secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_intake_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_intake_secret_matches(text) TO service_role;

SELECT cron.unschedule('marketing-intake-every-5-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-intake-every-5-min');

SELECT cron.schedule(
  'marketing-intake-every-5-min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/marketing-intake',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intake-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_intake_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);