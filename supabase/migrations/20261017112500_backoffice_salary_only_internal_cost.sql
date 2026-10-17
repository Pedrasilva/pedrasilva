CREATE OR REPLACE FUNCTION public.pm_backoffice_salary_cost(_user_id uuid, _date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH person AS (SELECT c.* FROM public.collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE u.id=_user_id AND c.departamento='Backoffice'),
 salary AS (SELECT s.* FROM public.salary_snapshots s JOIN person c ON c.id=s.collaborator_id WHERE coalesce(s.project_cost_effective_from,s.effective_from,s.reference_date)<=_date ORDER BY (s.effective_to IS NULL OR _date<s.effective_to) DESC, coalesce(s.project_cost_effective_from,s.effective_from,s.reference_date) DESC LIMIT 1)
 SELECT nullif(round((coalesce(s.valor_base,0)*14*(1+coalesce(s.ss_atelier_pct,0)) + coalesce(s.subsidio_alimentacao_diario,0)*coalesce(s.dias_uteis,0) + coalesce(s.ajudas_custo_anual,0)+coalesce(s.passe_anual,0)+coalesce(s.beneficio_carro,0)+coalesce(s.beneficio_ticket,0)+coalesce(s.premio_associado,0)+coalesce(s.outros_beneficios,0)+coalesce(s.plano_reforma,0)+coalesce(s.beneficio_variavel,0))/greatest(1,coalesce(b.dias_uteis,220)*coalesce(nullif(c.daily_hours,0),b.horas_dia,8)),2),0)
 FROM person c CROSS JOIN salary s CROSS JOIN (SELECT dias_uteis,horas_dia FROM public.bo_settings LIMIT 1) b
$$;
REVOKE ALL ON FUNCTION public.pm_backoffice_salary_cost(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_backoffice_salary_cost(uuid,date) TO service_role;
COMMENT ON FUNCTION public.pm_backoffice_salary_cost(uuid,date) IS 'Own salary only for internal Backoffice cost analysis; never an additional cost over overhead-loaded Projecto totals. Does not change the overhead pool or cost periods.';
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
 IF NEW.entry_type::text='internal' AND EXISTS(SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE u.id=NEW.user_id AND c.departamento='Backoffice') THEN
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
CREATE OR REPLACE FUNCTION public.pm_backfill_tatiana_internal()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; h numeric; total numeric; before_other text; before_periods text; before_resources text;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(170017,37) THEN RAISE EXCEPTION 'Cost operation in progress' USING ERRCODE='55P03'; END IF;
 LOCK TABLE public.pm_time_entries IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.pm_cost_rate_periods,public.pm_resources,public.salary_snapshots,public.collaborators,public.bo_settings IN SHARE MODE;
 SELECT count(*),sum(hours),sum(hours*public.pm_backoffice_salary_cost(user_id,entry_date)) INTO n,h,total FROM public.pm_time_entries WHERE user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_snapshot IS NULL;
 IF n<>108 OR h IS DISTINCT FROM 720::numeric OR total IS DISTINCT FROM 10117.20::numeric OR EXISTS(SELECT 1 FROM public.pm_time_entries WHERE user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_snapshot IS NULL AND coalesce(public.pm_backoffice_salary_cost(user_id,entry_date),0)<=0) THEN RAISE EXCEPTION 'Scoped backfill differs from approved 108 entries / 720 hours / 10117.20'; END IF;
 SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) INTO before_other FROM public.pm_time_entries e WHERE NOT(user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_snapshot IS NULL);
 SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) INTO before_periods FROM public.pm_cost_rate_periods e;
 SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) INTO before_resources FROM public.pm_resources e;
 PERFORM set_config('psa.cost_rate_write','on',true);
 UPDATE public.pm_time_entries SET cost_rate_snapshot=public.pm_backoffice_salary_cost(user_id,entry_date),cost_rate_source='overhead_salary' WHERE user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_snapshot IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM set_config('psa.cost_rate_write','off',true);
 IF n<>108 OR before_periods IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) FROM public.pm_cost_rate_periods e) OR before_resources IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) FROM public.pm_resources e) OR before_other IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'|' ORDER BY id)) FROM public.pm_time_entries e WHERE NOT(user_id='a5053861-594d-47fc-b955-2b0ad0b87e84' AND entry_type='internal' AND cost_rate_source='overhead_salary')) THEN RAISE EXCEPTION 'Preservation check failed'; END IF;
 INSERT INTO public.pm_cost_rate_recalc_log(run_by,kind,resource_id,entries_changed) VALUES(auth.uid(),'backfill','5e1f4d09-08ba-4d11-8ba3-e9d10c57a754',n);
 RETURN jsonb_build_object('entries',n,'hours',h,'cost',total,'periods_unchanged',true,'other_entries_unchanged',true,'resources_unchanged',true);
END $$;
REVOKE ALL ON FUNCTION public.pm_backfill_tatiana_internal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_backfill_tatiana_internal() TO service_role;