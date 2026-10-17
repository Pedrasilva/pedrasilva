-- Run through the privileged database test connection. Always rolls back.
BEGIN;
DO $$
DECLARE v public.vacation_requests; actor uuid; failed boolean; h text;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'admin_fixture_required'; END IF;
 SELECT * INTO v FROM public.vacation_requests WHERE tipo='baixa_medica' AND estado='pendente' AND attachment_path IS NULL LIMIT 1;
 IF v.id IS NULL THEN RAISE EXCEPTION 'pending_uncertified_sick_leave_fixture_required'; END IF;
 SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) INTO h FROM public.pm_time_entries e;
 failed:=false;
 BEGIN
   PERFORM public.leave_admin_reconcile_preserving_timesheets(actor,'rollback certificate test',jsonb_build_array(jsonb_build_object('id',v.id,'before',to_jsonb(v),'after',jsonb_build_object('estado','aprovada'))));
 EXCEPTION WHEN check_violation THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'uncertified_approval_allowed'; END IF;
 IF h IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) FROM public.pm_time_entries e) THEN RAISE EXCEPTION 'timesheet_changed'; END IF;
 IF has_function_privilege('authenticated','public.leave_admin_reconcile_preserving_timesheets(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('anon','public.leave_admin_reconcile_preserving_timesheets(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'service_only_grants_failed'; END IF;
END $$;
ROLLBACK;