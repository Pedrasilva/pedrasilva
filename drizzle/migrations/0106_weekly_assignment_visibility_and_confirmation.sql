DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('public.pm_week_board(date)'::regprocedure) INTO definition;
 original := definition;
 definition := replace(definition,'FROM public.pm_allocations a JOIN stages s ON s.id=a.stage_id JOIN resources r ON r.id=a.resource_id','FROM public.pm_allocations a JOIN public.pm_stages s ON s.id=a.stage_id JOIN projects p ON p.id=s.project_id JOIN resources r ON r.id=a.resource_id');
 IF definition=original THEN RAISE EXCEPTION 'Board allocation projection anchor missing'; END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('public.pm_apply_week_plan(uuid,text,jsonb,boolean,boolean,uuid)'::regprocedure) INTO definition;
 definition := replace(definition,'public.pm_apply_week_plan(', 'public.pm_apply_week_plan_confirmed(');
 original := definition;
 definition := replace(definition,'_publication_id uuid DEFAULT gen_random_uuid())','_publication_id uuid DEFAULT gen_random_uuid(), _ack_changes boolean DEFAULT false)');
 IF definition=original THEN RAISE EXCEPTION 'Approval signature anchor missing'; END IF;
 original := definition;
 definition := replace(definition,'PERFORM set_config(''app.pm_week_plan_apply'',''1'',true);', $guard$
IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'operations') o WHERE o->>'action' IN ('remove','change','split') AND o ? 'before') AND NOT coalesce(_ack_changes,false) THEN RAISE EXCEPTION 'Booking removal/change acknowledgement required' USING ERRCODE='22023'; END IF;
PERFORM set_config('app.pm_week_plan_apply','1',true);
$guard$);
 IF definition=original THEN RAISE EXCEPTION 'Approval acknowledgement anchor missing'; END IF;
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.pm_apply_week_plan_confirmed(uuid,text,jsonb,boolean,boolean,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_apply_week_plan_confirmed(uuid,text,jsonb,boolean,boolean,uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.pm_apply_week_plan(_plan_id uuid,_preview_token text DEFAULT NULL,_extensions jsonb DEFAULT '[]',_ack_overlap boolean DEFAULT false,_ack_baseline boolean DEFAULT false,_publication_id uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
 RETURN public.pm_apply_week_plan_confirmed(_plan_id,_preview_token,_extensions,_ack_overlap,_ack_baseline,_publication_id,false);
END $function$;
COMMENT ON FUNCTION public.pm_apply_week_plan(uuid,text,jsonb,boolean,boolean,uuid) IS 'DEPRECATED: use pm_apply_week_plan_confirmed with explicit booking-change acknowledgement. Legacy calls cannot bypass confirmation.';
CREATE OR REPLACE FUNCTION public.pm_allocation_leaf_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
 -- Publication may split an existing parent assignment outside the week; new draft slots are independently leaf-validated.
 IF coalesce(current_setting('app.pm_week_plan_apply',true),'')='1' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.pm_stages c WHERE c.parent_stage_id=NEW.stage_id) THEN RAISE EXCEPTION 'New bookings must use a leaf stage, not a parent stage' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.pm_allocation_leaf_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pm_allocation_leaf_guard BEFORE INSERT OR UPDATE OF stage_id ON public.pm_allocations FOR EACH ROW EXECUTE FUNCTION public.pm_allocation_leaf_guard();