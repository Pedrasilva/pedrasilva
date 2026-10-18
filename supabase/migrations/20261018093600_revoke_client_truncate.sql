-- No other table privileges or privileged maintenance roles are changed.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
-- The supabase_admin creator defaults require platform-owner privileges unavailable
-- to this migration connection and remain a separately reported blocker.