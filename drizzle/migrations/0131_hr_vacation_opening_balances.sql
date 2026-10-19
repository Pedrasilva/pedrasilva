CREATE TABLE public.hr_vacation_opening_balances (
 collaborator_id uuid NOT NULL REFERENCES public.collaborators(id),
 year integer NOT NULL,
 reference_date date NOT NULL,
 adjustment numeric NOT NULL DEFAULT 0,
 base_days numeric NOT NULL DEFAULT 22,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 history jsonb NOT NULL DEFAULT '[]'::jsonb,
 PRIMARY KEY (collaborator_id,year),
 CONSTRAINT opening_reference_year CHECK (extract(year from reference_date)=year)
);
GRANT SELECT,INSERT ON public.hr_vacation_opening_balances TO authenticated;
GRANT UPDATE (adjustment,reference_date) ON public.hr_vacation_opening_balances TO authenticated;
GRANT ALL ON public.hr_vacation_opening_balances TO service_role;
REVOKE TRUNCATE ON public.hr_vacation_opening_balances FROM anon,authenticated;
ALTER TABLE public.hr_vacation_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY opening_read ON public.hr_vacation_opening_balances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.collaborators c WHERE c.id=collaborator_id));
CREATE POLICY opening_insert ON public.hr_vacation_opening_balances FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_psa_staff());
CREATE POLICY opening_update ON public.hr_vacation_opening_balances FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') AND public.is_psa_staff()) WITH CHECK (public.has_role(auth.uid(),'admin') AND public.is_psa_staff());
CREATE FUNCTION public.hr_opening_balance_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN NEW.history=OLD.history || jsonb_build_array(jsonb_build_object('before',jsonb_build_object('adjustment',OLD.adjustment,'reference_date',OLD.reference_date),'at',now(),'by',auth.uid())); END IF;
 NEW.updated_at=now(); NEW.updated_by=auth.uid(); RETURN NEW;
END $$;
CREATE TRIGGER hr_opening_balance_audit_trg BEFORE INSERT OR UPDATE ON public.hr_vacation_opening_balances FOR EACH ROW EXECUTE FUNCTION public.hr_opening_balance_audit();
CREATE FUNCTION public.hr_leave_balances(_year integer) RETURNS TABLE(collaborator_id uuid,allowance numeric,extra numeric,carry_over numeric,reference_date date,total numeric,approved numeric,pending numeric,balance numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH RECURSIVE years AS (
 SELECT c.id,c.dias_ferias_anuais,c.dias_ferias_extra,c.saldo_ferias_anterior,coalesce(min(o.year) FILTER(WHERE o.year<=_year),_year) start_year FROM public.collaborators c LEFT JOIN public.hr_vacation_opening_balances o ON o.collaborator_id=c.id GROUP BY c.id
), amounts AS (
 SELECT c.id,y.y::integer yr,CASE WHEN o.year IS NOT NULL THEN o.base_days ELSE coalesce(c.dias_ferias_anuais,0) END::numeric annual,
 CASE WHEN o.year IS NOT NULL THEN 0 ELSE coalesce(c.dias_ferias_extra,0) END::numeric ex,
 CASE WHEN o.year IS NOT NULL THEN o.adjustment ELSE coalesce(c.saldo_ferias_anterior,0) END::numeric carried,
 o.reference_date ref,o.year IS NOT NULL opening,
 coalesce(sum(v.dias_uteis) FILTER(WHERE v.estado='aprovada'),0)::numeric used,
 coalesce(sum(v.dias_uteis) FILTER(WHERE v.estado='pendente'),0)::numeric booked
 FROM years c CROSS JOIN LATERAL generate_series(c.start_year,_year) y(y)
 LEFT JOIN public.hr_vacation_opening_balances o ON o.collaborator_id=c.id AND o.year=y.y
 LEFT JOIN public.vacation_requests v ON v.collaborator_id=c.id AND v.tipo='ferias' AND v.estado IN ('aprovada','pendente') AND v.data_inicio>=coalesce(o.reference_date,make_date(y.y,1,1)) AND v.data_inicio<=make_date(y.y,12,31)
 GROUP BY c.id,y.y,o.year,o.base_days,o.adjustment,o.reference_date,c.dias_ferias_anuais,c.dias_ferias_extra,c.saldo_ferias_anterior
), result AS (
 SELECT a.*,a.carried effective_carry,a.annual+a.ex+a.carried-a.used-a.booked remaining FROM amounts a JOIN years y ON y.id=a.id AND y.start_year=a.yr
 UNION ALL
 SELECT a.*,CASE WHEN a.opening THEN a.carried ELSE r.remaining END effective_carry,a.annual+a.ex+CASE WHEN a.opening THEN a.carried ELSE r.remaining END-a.used-a.booked remaining FROM result r JOIN amounts a ON a.id=r.id AND a.yr=r.yr+1
)
SELECT id,annual,ex,effective_carry,ref,annual+ex+effective_carry,used,booked,remaining FROM result WHERE yr=_year;
$$;
REVOKE ALL ON FUNCTION public.hr_leave_balances(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balances(integer) TO authenticated,service_role;