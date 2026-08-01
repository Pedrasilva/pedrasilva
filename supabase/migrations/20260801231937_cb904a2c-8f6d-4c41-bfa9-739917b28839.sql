CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('gmail-finance-intake')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-finance-intake');

SELECT cron.schedule(
  'gmail-finance-intake',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/gmail-intake',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xY2N1cmZzdmJ4dmRleGVoeWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzI4MDQsImV4cCI6MjA5MjAwODgwNH0.PVw7pMgN47wKV09Uit5VVp1mIJY3qzSaogSERriVm_4"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);