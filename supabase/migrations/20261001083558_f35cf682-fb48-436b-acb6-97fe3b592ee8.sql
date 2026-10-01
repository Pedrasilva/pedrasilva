REVOKE EXECUTE ON FUNCTION public.marketing_media_delete_block(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_media_delete_block(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.marketing_compute_draft_readiness(uuid[], text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_compute_draft_readiness(uuid[], text, text[], uuid) TO service_role;