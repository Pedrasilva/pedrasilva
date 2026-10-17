CREATE OR REPLACE FUNCTION public.pm_time_entry_cost_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _res uuid; _rate numeric;
BEGIN
 IF current_setting('psa.cost_rate_write',true)='on' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.entry_date=OLD.entry_date AND NEW.user_id=OLD.user_id THEN
  NEW.cost_rate_snapshot:=OLD.cost_rate_snapshot; NEW.cost_rate_source:=OLD.cost_rate_source; RETURN NEW;
 END IF;
 IF NEW.entry_type::text='non_working' OR NEW.leave_type IS NOT NULL THEN
  NEW.cost_rate_snapshot:=NULL; NEW.cost_rate_source:=NULL; RETURN NEW;
 END IF;
 IF NEW.user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND NEW.entry_type::text='internal' AND EXISTS(SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE u.id=NEW.user_id AND c.departamento='Backoffice') THEN
  NEW.cost_rate_snapshot:=public.pm_backoffice_salary_cost(NEW.user_id,NEW.entry_date);
  NEW.cost_rate_source:=CASE WHEN NEW.cost_rate_snapshot>0 THEN 'overhead_salary' ELSE NULL END;
  RETURN NEW;
 END IF;
 _res:=public.pm_entry_resource(NEW.user_id,NEW.task_id);
 _rate:=CASE WHEN _res IS NULL THEN NULL ELSE nullif(public.pm_cost_rate_at(_res,NEW.entry_date),0) END;
 IF _rate IS NOT NULL THEN NEW.cost_rate_snapshot:=_rate; NEW.cost_rate_source:='live';
 ELSE
  _rate:=CASE WHEN _res IS NULL THEN NULL ELSE public.pm_cost_rate_fallback(_res) END;
  NEW.cost_rate_snapshot:=_rate; NEW.cost_rate_source:=CASE WHEN _rate IS NULL THEN NULL ELSE 'fallback' END;
 END IF;
 RETURN NEW;
END $$;
