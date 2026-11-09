BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.psa_master_page_defaults) THEN RAISE EXCEPTION 'Test requires empty practice default'; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO public.psa_master_page_defaults(template) VALUES('{"version":1}');
  RAISE EXCEPTION 'Nonadmin unexpectedly saved master';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}',true);
INSERT INTO public.psa_master_page_defaults(template) VALUES('{"version":1}');
DO $$ BEGIN IF (SELECT revision FROM public.psa_master_page_defaults) <> 1 THEN RAISE EXCEPTION 'Wrong initial revision'; END IF; END $$;
UPDATE public.psa_master_page_defaults SET template='{"version":1,"fixture":true}' WHERE revision=1;
DO $$ BEGIN IF (SELECT revision FROM public.psa_master_page_defaults) <> 2 THEN RAISE EXCEPTION 'Wrong updated revision'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$ DECLARE n int; BEGIN UPDATE public.psa_master_page_defaults SET template='{"version":1}'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Nonadmin update succeeded'; END IF; END $$;
ROLLBACK;
