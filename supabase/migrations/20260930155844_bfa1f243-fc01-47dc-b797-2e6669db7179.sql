REVOKE EXECUTE ON FUNCTION public.marketing_captures_guard_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marketing_capture_delete_block(uuid) FROM PUBLIC, anon;