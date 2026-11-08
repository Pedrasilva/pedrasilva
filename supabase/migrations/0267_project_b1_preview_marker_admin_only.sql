CREATE OR REPLACE FUNCTION public.pm_project_b1_marker_present() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS
$$ DECLARE h text; BEGIN
  BEGIN h:=current_setting('request.headers',true)::jsonb->>'x-psa-b1-preview'; EXCEPTION WHEN others THEN h:=NULL; END;
  RETURN h IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.pm_project_b1_marker_present() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_b1_marker_present() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_project_b1_header_preview() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS
$$ DECLARE h text; BEGIN
  BEGIN h:=current_setting('request.headers',true)::jsonb->>'x-psa-b1-preview'; EXCEPTION WHEN others THEN h:=NULL; END;
  RETURN coalesce(h,'')='on'
    AND auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(),'admin')
    AND current_setting('transaction_read_only')='on';
END $$;
REVOKE ALL ON FUNCTION public.pm_project_b1_header_preview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_b1_header_preview() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pm_change_project_b1_cutover(_enabled boolean, _expected boolean, _matrix_hash text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS
$$ DECLARE p jsonb; r bigint; BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; IF public.pm_project_b1_marker_present() THEN RAISE EXCEPTION 'Preview requests cannot change the cutover' USING ERRCODE='42501'; END IF; IF _enabled IS NULL OR _expected IS NULL OR length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'Explicit cutover state and reason required'; END IF; PERFORM pg_advisory_xact_lock(hashtextextended('pm.project.b1.cutover',0)); p:=public.pm_project_b1_preview(); IF (p->>'active')::boolean IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Cutover state changed; reload before saving'; END IF; IF p->>'matrix_hash' IS DISTINCT FROM _matrix_hash THEN RAISE EXCEPTION 'Access matrix changed; review before cutover'; END IF; IF _enabled AND NOT public.pm_project_access_cutover_active() THEN RAISE EXCEPTION 'Phase A must remain active'; END IF; INSERT INTO public.pm_project_b1_cutover_audit(actor,reason,before_active,after_active,matrix_hash) VALUES(auth.uid(),_reason,_expected,_enabled,_matrix_hash) RETURNING revision INTO r; RETURN jsonb_build_object('revision',r,'active',public.pm_project_b1_recorded_active()); END $$;

COMMENT ON FUNCTION public.pm_project_b1_active() IS 'Effective B1 gate: audited recorded state, or an administrator''s own x-psa-b1-preview: on request inside a read-only transaction. Ignored for everyone else and for every write.';
