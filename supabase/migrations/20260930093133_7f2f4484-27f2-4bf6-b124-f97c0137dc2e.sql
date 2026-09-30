ALTER FUNCTION public.marketing_post_drafts_guard() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.marketing_post_drafts_guard() FROM PUBLIC, anon, authenticated;