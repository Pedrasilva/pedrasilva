-- Disposable rows only. Every decision and notification is rolled back.
BEGIN;
DO $$
DECLARE actor uuid; person uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); remote uuid:=gen_random_uuid(); sick uuid:=gen_random_uuid(); change_id uuid:=gen_random_uuid(); denied boolean; before_hash text;
BEGIN
SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
IF actor IS NULL THEN RAISE EXCEPTION 'admin_fixture_required'; END IF;
SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) INTO before_hash FROM public.pm_time_entries e;
INSERT INTO public.collaborators(id,nome,email) VALUES(person,'QA Approval rollback','qa-approval-'||person||'@example.invalid');
INSERT INTO public.vacation_requests(id,collaborator_id,data_inicio,data_fim,dias_uteis,tipo) VALUES(req,person,'2099-01-05','2099-01-05',1,'autorizada_paga'),(sick,person,'2099-01-12','2099-01-12',1,'baixa_medica');
INSERT INTO public.remote_work_requests(id,collaborator_id,data) VALUES(remote,person,'2099-01-06');
PERFORM set_config('request.jwt.claims','{}',true);
denied:=false; BEGIN PERFORM public.hr_inbox_remote_decide(remote,true,''); EXCEPTION WHEN OTHERS THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'anonymous_remote_allowed'; END IF;
denied:=false; BEGIN PERFORM public.hr_approval_actor_name(remote,'remote'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'anonymous_actor_allowed'; END IF;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
denied:=false; BEGIN PERFORM public.leave_decide_pending(req,false,''); EXCEPTION WHEN OTHERS THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'blank_rejection_allowed'; END IF;
denied:=false; BEGIN PERFORM public.leave_decide_pending(sick,true,''); EXCEPTION WHEN check_violation THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'uncertified_sick_approved'; END IF;
PERFORM public.leave_decide_pending(req,true,'');
IF (SELECT estado FROM public.vacation_requests WHERE id=req)<>'aprovada' THEN RAISE EXCEPTION 'leave_not_approved'; END IF;
INSERT INTO public.vacation_change_requests(id,request_id,requested_by,recipient_id,kind,explanation) VALUES(change_id,req,gen_random_uuid(),actor,'cancel','QA rollback cancel');
denied:=false; BEGIN PERFORM public.leave_change_decide(change_id,false,''); EXCEPTION WHEN OTHERS THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'blank_change_rejection_allowed'; END IF;
PERFORM public.leave_change_decide(change_id,false,'QA rejection');
IF (SELECT status FROM public.vacation_change_requests WHERE id=change_id)<>'recusada' THEN RAISE EXCEPTION 'change_not_rejected'; END IF;
PERFORM public.hr_inbox_remote_decide(remote,true,'');
IF (SELECT estado FROM public.remote_work_requests WHERE id=remote)<>'aprovada' THEN RAISE EXCEPTION 'remote_not_approved'; END IF;
IF public.hr_approval_actor_name(remote,'remote') IS NULL THEN RAISE EXCEPTION 'actor_name_missing'; END IF;
denied:=false; BEGIN PERFORM public.hr_inbox_remote_decide(remote,false,''); EXCEPTION WHEN OTHERS THEN denied:=true; END;
IF NOT denied THEN RAISE EXCEPTION 'double_decision_allowed'; END IF;
IF before_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) FROM public.pm_time_entries e) THEN RAISE EXCEPTION 'real_timesheets_changed'; END IF;
END $$;
SELECT 'PASS: anonymous checks, required reasons, certificate, leave/change/remote decisions, actor name, double-decision guard and timesheet preservation';
ROLLBACK;