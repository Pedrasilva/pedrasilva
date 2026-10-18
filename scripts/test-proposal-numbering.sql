-- Run through the privileged database query tool; all disposable copies roll back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','ab5a48c0-939b-4502-bd3b-db7801f0f8b8',true);
SELECT set_config('request.jwt.claims','{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}',true);
DO $$
DECLARE original public.fee_proposals; q uuid:=gen_random_uuid(); a uuid; b uuid; result text; before_hash text; after_hash text;
BEGIN
 SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY f.id)) INTO before_hash FROM public.fee_proposals f;
 SELECT * INTO original FROM public.fee_proposals WHERE proposal_number='2675';
 IF original.id IS NULL THEN RAISE EXCEPTION 'Missing source for disposable copy'; END IF;
 INSERT INTO public.fee_proposals SELECT * FROM jsonb_populate_record(NULL::public.fee_proposals,to_jsonb(original)||jsonb_build_object('id',q,'titulo','__NUMBERING_ROLLBACK_COPY__','proposal_number','9916','revision_number',1,'parent_quote_id',NULL,'opportunity_id',NULL,'pm_project_id',NULL,'locked_project_id',NULL,'locked_at',NULL,'archived_at',NULL,'deleted_at',NULL,'quote_status','draft'));
 a:=public.clone_fee_proposal_as_revision(q);
 IF (SELECT proposal_number FROM public.fee_proposals WHERE id=a)<>'9916' OR (SELECT revision_number FROM public.fee_proposals WHERE id=a)<>2 THEN RAISE EXCEPTION 'First revision must keep number, revision 2'; END IF;
 b:=public.clone_fee_proposal_as_revision(a);
 IF (SELECT proposal_number FROM public.fee_proposals WHERE id=b)<>'9916' OR (SELECT revision_number FROM public.fee_proposals WHERE id=b)<>3 THEN RAISE EXCEPTION 'Second revision must keep number, revision 3'; END IF;
 IF (SELECT parent_quote_id FROM public.fee_proposals WHERE id=b)<>q THEN RAISE EXCEPTION 'Wrong family root'; END IF;
 IF (SELECT valor FROM public.fee_proposals WHERE id=b) IS DISTINCT FROM original.valor THEN RAISE EXCEPTION 'Fee changed on copy'; END IF;
 BEGIN
  INSERT INTO public.fee_proposals(titulo,proposal_number,revision_number) VALUES('__DUPLICATE__','9916',2);
  RAISE EXCEPTION 'Duplicate pair was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO public.fee_proposal_number_counters(year_prefix,last_seq) VALUES('98',98) ON CONFLICT(year_prefix) DO UPDATE SET last_seq=98;
 result:=public.allocate_proposal_number('2098-01-01');
 IF result<>'9899' THEN RAISE EXCEPTION 'Expected 9899, got %',result; END IF;
 result:=public.allocate_proposal_number('2098-01-01');
 IF result<>'98100' THEN RAISE EXCEPTION 'Expected 98100, got %',result; END IF;
 UPDATE public.fee_proposal_number_counters SET last_seq=99 WHERE year_prefix='26';
 result:=public.allocate_proposal_number('2026-01-01');
 IF result<>'26100' THEN RAISE EXCEPTION 'Expected 26100 after 2699, got %',result; END IF;
 DELETE FROM public.fee_proposal_number_counters WHERE year_prefix='97';
 result:=public.allocate_proposal_number('2097-01-01');
 IF result<>'9701' THEN RAISE EXCEPTION 'Annual reset failed: %',result; END IF;
 SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY f.id)) INTO after_hash FROM public.fee_proposals f WHERE id NOT IN(q,a,b);
 IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'An existing proposal changed'; END IF;
 RAISE NOTICE 'PASS: same-number revisions, root, fee, unique pair, 99 to 100, annual reset, existing proposals unchanged';
END $$;
ROLLBACK;