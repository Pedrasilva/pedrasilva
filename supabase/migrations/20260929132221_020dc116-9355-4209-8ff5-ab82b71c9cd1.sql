CREATE OR REPLACE FUNCTION public.marketing_captures_set_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE u record;
BEGIN
  IF NEW.channel = 'hub' THEN
    SELECT email, raw_user_meta_data INTO u FROM auth.users WHERE id = auth.uid();
    NEW.created_by := auth.uid();
    NEW.received_at := now();
    NEW.sender_email := u.email;
    NEW.sender_name := COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), u.email);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_captures_set_sender() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_captures_set_sender BEFORE INSERT ON public.marketing_captures
FOR EACH ROW EXECUTE FUNCTION public.marketing_captures_set_sender();