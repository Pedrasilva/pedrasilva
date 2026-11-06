CREATE OR REPLACE FUNCTION public.pm_project_b1_recorded_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT coalesce((SELECT after_active FROM public.pm_project_b1_cutover_audit ORDER BY revision DESC LIMIT 1),false) $$;
REVOKE ALL ON FUNCTION public.pm_project_b1_recorded_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_b1_recorded_active() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_project_b1_header_preview() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS
$$ DECLARE h text; BEGIN
  BEGIN h:=current_setting('request.headers',true)::jsonb->>'x-psa-b1-preview'; EXCEPTION WHEN others THEN h:=NULL; END;
  RETURN coalesce(h,'')='on' AND auth.uid() IS NOT NULL AND public.is_psa_staff();
END $$;
REVOKE ALL ON FUNCTION public.pm_project_b1_header_preview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_b1_header_preview() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_project_b1_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT public.pm_project_b1_recorded_active() OR public.pm_project_b1_header_preview() $$;

CREATE OR REPLACE FUNCTION public.pm_project_b1_gate_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT jsonb_build_object('recorded',public.pm_project_b1_recorded_active(),'preview',public.pm_project_b1_header_preview(),'effective',public.pm_project_b1_active()) $$;
REVOKE ALL ON FUNCTION public.pm_project_b1_gate_state() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_b1_gate_state() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_project_b1_preview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS
$$ DECLARE m jsonb; BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; m:=public.pm_project_access_matrix(); RETURN jsonb_build_object('active',public.pm_project_b1_recorded_active(),'phase_a_active',public.pm_project_access_cutover_active(),'matrix',m,'matrix_hash',md5((m->'rows')::text)); END $$;

CREATE OR REPLACE FUNCTION public.pm_change_project_b1_cutover(_enabled boolean, _expected boolean, _matrix_hash text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS
$$ DECLARE p jsonb; r bigint; BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; IF public.pm_project_b1_header_preview() THEN RAISE EXCEPTION 'Preview requests cannot change the cutover' USING ERRCODE='42501'; END IF; IF _enabled IS NULL OR _expected IS NULL OR length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'Explicit cutover state and reason required'; END IF; PERFORM pg_advisory_xact_lock(hashtextextended('pm.project.b1.cutover',0)); p:=public.pm_project_b1_preview(); IF (p->>'active')::boolean IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Cutover state changed; reload before saving'; END IF; IF p->>'matrix_hash' IS DISTINCT FROM _matrix_hash THEN RAISE EXCEPTION 'Access matrix changed; review before cutover'; END IF; IF _enabled AND NOT public.pm_project_access_cutover_active() THEN RAISE EXCEPTION 'Phase A must remain active'; END IF; INSERT INTO public.pm_project_b1_cutover_audit(actor,reason,before_active,after_active,matrix_hash) VALUES(auth.uid(),_reason,_expected,_enabled,_matrix_hash) RETURNING revision INTO r; RETURN jsonb_build_object('revision',r,'active',public.pm_project_b1_recorded_active()); END $$;

COMMENT ON FUNCTION public.pm_project_b1_active() IS 'Effective B1 gate: audited recorded state, or the caller''s own x-psa-b1-preview: on request (PSA staff). Preview evaluates the identical gate-ON readers.';