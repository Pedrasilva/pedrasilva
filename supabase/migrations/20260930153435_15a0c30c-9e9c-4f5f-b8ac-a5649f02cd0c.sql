ALTER TABLE public.marketing_nudges
  ADD COLUMN reply_tag text UNIQUE,
  ADD COLUMN answer_source_message_id text UNIQUE;

CREATE OR REPLACE FUNCTION public.marketing_nudges_set_reply_tag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.reply_tag := 'Q-' || left(replace(NEW.id::text, '-', ''), 8);
  RETURN NEW;
END $$;

CREATE TRIGGER marketing_nudges_reply_tag BEFORE INSERT ON public.marketing_nudges
FOR EACH ROW EXECUTE FUNCTION public.marketing_nudges_set_reply_tag();

UPDATE public.marketing_nudges SET reply_tag = 'Q-' || left(replace(id::text, '-', ''), 8) WHERE reply_tag IS NULL;