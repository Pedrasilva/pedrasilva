ALTER TABLE public.crm_email_lead_drafts ADD COLUMN IF NOT EXISTS mentioned_date date;
COMMENT ON COLUMN public.crm_email_lead_drafts.mentioned_date IS 'Original date mentioned in the email when it was already past at import (follow-up replaced by +2 working days).';

UPDATE public.crm_email_lead_drafts d
SET mentioned_date = d.suggested_next_action_date,
    suggested_next_action_date = (
      SELECT g::date FROM generate_series(current_date + 1, current_date + 14, interval '1 day') g
      WHERE extract(isodow FROM g) < 6
      ORDER BY g OFFSET 1 LIMIT 1)
WHERE d.status = 'pending' AND d.suggested_next_action_date < current_date;

SELECT cron.unschedule('crm-email-intake-every-10-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-email-intake-every-10-min');

SELECT cron.schedule(
  'crm-email-intake-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/crm-email-intake',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intake-secret', (SELECT token FROM public.crm_email_intake_gate WHERE id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);