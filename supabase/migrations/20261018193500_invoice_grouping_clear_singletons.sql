CREATE OR REPLACE FUNCTION public.pm_invoice_apply_group(_tbl text,_ids uuid[],_bases date[],_curs date[],_gids uuid[],_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target date; gid uuid; i integer;
BEGIN
  IF _enabled AND array_length(_ids,1)>=2 THEN
    SELECT max(b) INTO target FROM unnest(_bases) b;
    SELECT g INTO gid FROM unnest(_gids) g WHERE g IS NOT NULL LIMIT 1;
    gid:=coalesce(gid,gen_random_uuid());
    FOR i IN 1..array_length(_ids,1) LOOP
      EXECUTE format('UPDATE %I SET expected_invoice_date=$1, expected_payment_date=CASE WHEN expected_payment_date IS NULL THEN NULL ELSE expected_payment_date+($1-$2) END, original_invoice_date=$3, invoice_group_id=$4 WHERE id=$5 AND (expected_invoice_date IS DISTINCT FROM $1 OR original_invoice_date IS DISTINCT FROM $3 OR invoice_group_id IS DISTINCT FROM $4)',_tbl)
        USING target,_curs[i],_bases[i],gid,_ids[i];
    END LOOP;
  ELSE
    FOR i IN 1..array_length(_ids,1) LOOP
      EXECUTE format('UPDATE %I SET expected_invoice_date=$1, expected_payment_date=CASE WHEN expected_payment_date IS NULL THEN NULL ELSE expected_payment_date+($1-$2) END, original_invoice_date=NULL, invoice_group_id=NULL WHERE id=$3 AND (original_invoice_date IS NOT NULL OR invoice_group_id IS NOT NULL)',_tbl)
        USING _bases[i],_curs[i],_ids[i];
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pm_invoice_apply_group(text,uuid[],date[],date[],uuid[],boolean) FROM PUBLIC, anon, authenticated;