DO $$ DECLARE body text; BEGIN SELECT pg_get_functiondef('public.pm_retainer_sync()'::regprocedure) INTO body;
 body:=replace(body,'UPDATE pm_payment_schedule_items SET expected_invoice_date=d,expected_payment_date=d WHERE id=p.id;','NULL; -- Existing operational timing follows the stage through pm_incoming_resolve; preserve stored conversion evidence.');
 EXECUTE body;
END $$;