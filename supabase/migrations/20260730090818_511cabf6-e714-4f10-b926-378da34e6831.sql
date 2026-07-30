CREATE OR REPLACE FUNCTION public.pm_stages_set_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_origin text;
BEGIN
  IF NEW.origin IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT origin INTO v_project_origin FROM public.pm_projects WHERE id = NEW.project_id;

  IF v_project_origin = 'quote_conversion' THEN
    NEW.origin := CASE
      WHEN NEW.source_quote_stage_id IS NOT NULL THEN 'original_baseline'
      ELSE 'added_post_conversion'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_stages_set_origin ON public.pm_stages;
CREATE TRIGGER trg_pm_stages_set_origin
BEFORE INSERT ON public.pm_stages
FOR EACH ROW EXECUTE FUNCTION public.pm_stages_set_origin();