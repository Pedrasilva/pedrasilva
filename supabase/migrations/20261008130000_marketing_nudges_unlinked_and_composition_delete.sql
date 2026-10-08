ALTER TABLE public.marketing_nudges DROP CONSTRAINT marketing_nudges_capture_kind_check;
ALTER TABLE public.marketing_nudges ADD CONSTRAINT marketing_nudges_capture_kind_check
  CHECK (kind = 'briefing' OR capture_id IS NOT NULL OR composition_id IS NOT NULL OR status <> 'pending');

CREATE OR REPLACE FUNCTION public.marketing_composition_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE entity_type = 'marketing_nudge'
     AND entity_id IN (SELECT id FROM public.marketing_nudges WHERE composition_id = OLD.id AND status = 'pending');
  DELETE FROM public.marketing_nudges WHERE composition_id = OLD.id AND status = 'pending';
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.marketing_composition_before_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER marketing_composition_before_delete_trg
  BEFORE DELETE ON public.marketing_compositions
  FOR EACH ROW EXECUTE FUNCTION public.marketing_composition_before_delete();