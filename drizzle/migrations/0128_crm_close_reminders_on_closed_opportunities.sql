-- My actions: CRM next actions close automatically when an opportunity is won, lost or deleted.
CREATE OR REPLACE FUNCTION public.crm_opportunity_close_reminder()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.reminders SET status = 'cancelled', completed_at = now(), updated_at = now()
     WHERE entity_type = 'crm_opportunity' AND entity_id = OLD.id AND status = 'open';
    RETURN OLD;
  END IF;
  IF NEW.stage IN ('won','lost') THEN
    UPDATE public.reminders SET status = 'cancelled', completed_at = now(), updated_at = now()
     WHERE entity_type = 'crm_opportunity' AND entity_id = NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_opportunity_close_reminder() FROM PUBLIC, anon, authenticated;

-- Runs after the existing sync trigger (alphabetical order), so a next-action edit on a closed deal stays closed.
DROP TRIGGER IF EXISTS crm_opportunity_zz_close_reminder_trg ON public.crm_opportunities;
CREATE TRIGGER crm_opportunity_zz_close_reminder_trg
  AFTER INSERT OR UPDATE OF stage, next_action, next_action_date, next_action_owner_id ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_opportunity_close_reminder();
DROP TRIGGER IF EXISTS crm_opportunity_zz_close_reminder_del_trg ON public.crm_opportunities;
CREATE TRIGGER crm_opportunity_zz_close_reminder_del_trg
  AFTER DELETE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_opportunity_close_reminder();

-- One-off cleanup of existing open actions on won/lost or missing opportunities.
UPDATE public.reminders r SET status = 'cancelled', completed_at = now(), updated_at = now()
 WHERE r.entity_type = 'crm_opportunity' AND r.status = 'open'
   AND NOT EXISTS (SELECT 1 FROM public.crm_opportunities o
                    WHERE o.id = r.entity_id AND o.stage NOT IN ('won','lost'));