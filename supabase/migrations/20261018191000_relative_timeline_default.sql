-- Relative timeline by default for proposals that are not live projects.
-- Mapping preserves each stage/allocation's Mon–Fri day count exactly (the same
-- count used for quote hours and fees), so hours and fees cannot change.
CREATE OR REPLACE FUNCTION public.pm_relative_date(_n integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT date '2000-01-03' + (floor(_n::numeric/5)::integer)*7 + (_n - 5*floor(_n::numeric/5)::integer) $$;

CREATE OR REPLACE FUNCTION public.pm_weekday_snap(_d date,_forward boolean) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN extract(isodow FROM _d)<6 THEN _d
    WHEN _forward THEN _d + (8-extract(isodow FROM _d)::integer)
    ELSE _d - (extract(isodow FROM _d)::integer-5) END $$;

CREATE OR REPLACE FUNCTION public.pm_relative_from_calendar(_anchor date,_d date,_forward boolean) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN _d IS NULL THEN NULL ELSE public.pm_relative_date(
    public.pm_relative_offset(public.pm_weekday_snap(_d,_forward)) - public.pm_relative_offset(public.pm_weekday_snap(_anchor,true))) END $$;

-- Keeps any calendar date that enters a relative proposal on the relative scale.
CREATE OR REPLACE FUNCTION public.pm_relative_normalize_dates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE anchor date; od jsonb;
BEGIN
  IF NOT ((NEW.start_date IS NOT NULL AND NEW.start_date>=date '2010-01-01') OR (NEW.end_date IS NOT NULL AND NEW.end_date>=date '2010-01-01')) THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=NEW.quote_id AND pm_project_id IS NULL AND locked_project_id IS NULL) THEN RETURN NEW; END IF;
  SELECT original_dates INTO od FROM quote_relative_schedules WHERE quote_id=NEW.quote_id FOR UPDATE;
  IF od IS NULL THEN RETURN NEW; END IF;
  anchor:=(od->>'anchor')::date;
  IF anchor IS NULL THEN
    anchor:=public.pm_weekday_snap(coalesce(CASE WHEN NEW.start_date>=date '2010-01-01' THEN NEW.start_date END,NEW.end_date),true);
    UPDATE quote_relative_schedules SET original_dates=original_dates||jsonb_build_object('anchor',anchor) WHERE quote_id=NEW.quote_id;
  END IF;
  IF NEW.start_date>=date '2010-01-01' THEN NEW.start_date:=public.pm_relative_from_calendar(anchor,NEW.start_date,true); END IF;
  IF NEW.end_date>=date '2010-01-01' THEN NEW.end_date:=public.pm_relative_from_calendar(anchor,NEW.end_date,false); END IF;
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date<NEW.start_date THEN NEW.end_date:=NEW.start_date; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER quote_stage_relative_normalize BEFORE INSERT OR UPDATE OF start_date,end_date ON public.quote_stages FOR EACH ROW EXECUTE FUNCTION public.pm_relative_normalize_dates();
CREATE TRIGGER quote_allocation_relative_normalize BEFORE INSERT OR UPDATE OF start_date,end_date ON public.quote_allocations FOR EACH ROW EXECUTE FUNCTION public.pm_relative_normalize_dates();

-- New proposals start on the relative timeline.
CREATE OR REPLACE FUNCTION public.pm_relative_default_for_new_quote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.pm_project_id IS NULL AND NEW.locked_project_id IS NULL THEN
    INSERT INTO quote_relative_schedules(quote_id,original_dates,created_by)
    VALUES(NEW.id,jsonb_build_object('stages','[]'::jsonb,'allocations','[]'::jsonb,'auto',true),coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'::uuid))
    ON CONFLICT (quote_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fee_proposals_relative_default AFTER INSERT ON public.fee_proposals FOR EACH ROW EXECUTE FUNCTION public.pm_relative_default_for_new_quote();

-- One-off move of an existing proposal to the relative timeline (original dates kept for revert).
CREATE OR REPLACE FUNCTION public.pm_relative_bulk_initialize(_quote uuid,_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE anchor date; od jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=_quote AND pm_project_id IS NULL AND locked_project_id IS NULL AND locked_at IS NULL AND NOT coalesce(is_locked,false)) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
  IF EXISTS(SELECT 1 FROM quote_relative_schedules WHERE quote_id=_quote) THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
  SELECT public.pm_weekday_snap(min(d),true) INTO anchor FROM (SELECT start_date d FROM quote_stages WHERE quote_id=_quote UNION ALL SELECT start_date FROM quote_allocations WHERE quote_id=_quote) x;
  od:=jsonb_build_object('bulk',true,'anchor',anchor,
    'stages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'start_date',start_date,'end_date',end_date) ORDER BY id) FROM quote_stages WHERE quote_id=_quote),'[]'::jsonb),
    'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'start_date',start_date,'end_date',end_date) ORDER BY id) FROM quote_allocations WHERE quote_id=_quote),'[]'::jsonb));
  INSERT INTO quote_relative_schedules(quote_id,original_dates,created_by) VALUES(_quote,od,_actor);
  -- the normalize trigger maps the calendar dates using the stored anchor
  UPDATE quote_stages SET start_date=start_date+0 WHERE quote_id=_quote AND start_date IS NOT NULL;
  UPDATE quote_stages SET start_date=public.pm_relative_from_calendar(anchor,(o->>'start_date')::date,true),
    end_date=public.pm_relative_from_calendar(anchor,(o->>'end_date')::date,false)
    FROM jsonb_array_elements(od->'stages') o WHERE quote_stages.id=(o->>'id')::uuid AND quote_stages.quote_id=_quote;
  UPDATE quote_allocations SET start_date=public.pm_relative_from_calendar(anchor,(o->>'start_date')::date,true),
    end_date=public.pm_relative_from_calendar(anchor,(o->>'end_date')::date,false)
    FROM jsonb_array_elements(od->'allocations') o WHERE quote_allocations.id=(o->>'id')::uuid AND quote_allocations.quote_id=_quote;
  RETURN od;
END $$;

CREATE OR REPLACE FUNCTION public.pm_relative_bulk_revert(_quote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE od jsonb;
BEGIN
  DELETE FROM quote_relative_schedules WHERE quote_id=_quote AND (original_dates->>'bulk')::boolean RETURNING original_dates INTO od;
  IF od IS NULL THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
  UPDATE quote_stages SET start_date=(o->>'start_date')::date,end_date=(o->>'end_date')::date FROM jsonb_array_elements(od->'stages') o WHERE quote_stages.id=(o->>'id')::uuid AND quote_stages.quote_id=_quote;
  UPDATE quote_allocations SET start_date=(o->>'start_date')::date,end_date=(o->>'end_date')::date FROM jsonb_array_elements(od->'allocations') o WHERE quote_allocations.id=(o->>'id')::uuid AND quote_allocations.quote_id=_quote;
END $$;

REVOKE ALL ON FUNCTION public.pm_relative_bulk_initialize(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_relative_bulk_revert(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_relative_normalize_dates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_relative_default_for_new_quote() FROM PUBLIC, anon, authenticated;
