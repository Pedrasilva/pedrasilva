-- Trigger neutro: novos utilizadores são sempre criados como 'user'.
-- O papel de admin passa a ser atribuído manualmente em /admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;