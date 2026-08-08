CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('inbox-poll')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-poll');

SELECT cron.schedule(
  'inbox-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/inbox-poll',
    headers := '{"Content-Type": "application/json", "x-intake-secret": "8cf87eaf2a6a8c7e00bd1fe9953f7cbe6827cba7938ece6b6e0be234e7bc1ccf"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);