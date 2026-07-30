CREATE OR REPLACE FUNCTION public.pm_stages_set_origin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_origin text;
  v_parent_origin text;
BEGIN
  IF NEW.origin IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT origin INTO v_project_origin FROM public.pm_projects WHERE id = NEW.project_id;

  IF v_project_origin = 'quote_conversion' THEN
    IF NEW.source_quote_stage_id IS NOT NULL THEN
      NEW.origin := 'original_baseline';
    ELSIF NEW.parent_stage_id IS NOT NULL THEN
      SELECT origin INTO v_parent_origin FROM public.pm_stages WHERE id = NEW.parent_stage_id;
      NEW.origin := COALESCE(v_parent_origin, 'added_post_conversion');
    ELSE
      NEW.origin := 'added_post_conversion';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;