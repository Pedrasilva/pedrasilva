-- Local isolated PostgreSQL only. Minimal dependencies model calendar shifts;
-- the function under test is loaded verbatim from migration 0215.
CREATE TABLE quote_payment_schedule_items(id uuid,quote_id uuid,stage_id uuid,trigger_type text,manual_override boolean,expected_invoice_date date,expected_payment_date date,payment_offset_days integer,sort_order integer,direction text);
CREATE TABLE quote_relative_schedules(quote_id uuid,original_dates jsonb);
CREATE TABLE quote_stages(id uuid,quote_id uuid,start_date date);
CREATE TABLE fixture_non_working_days(day date);
INSERT INTO fixture_non_working_days VALUES('2026-12-01'),('2027-01-01');
CREATE FUNCTION pm_calendar_shift(d date,n integer) RETURNS date LANGUAGE plpgsql AS $$ BEGIN WHILE extract(isodow from d)>5 OR EXISTS(SELECT 1 FROM fixture_non_working_days WHERE day=d) LOOP d:=d+1; END LOOP; RETURN d; END $$;
CREATE FUNCTION pm_quote_payment_date(uuid,date,date,boolean) RETURNS date LANGUAGE sql AS $$ SELECT $3 $$;
\ir ../supabase/migrations/0215_quote_relative_construction_month_payment_dates.sql
BEGIN;
DO $$
DECLARE q uuid:='00000000-0000-4000-a000-000000000111'; s uuid:='00000000-0000-4000-a000-000000000112'; p uuid; i integer; dates jsonb; expected date[]:=ARRAY['2026-12-02'::date,'2027-01-04'::date,'2027-02-01'::date,'2027-03-01'::date];
BEGIN
dates:=jsonb_build_array(jsonb_build_object('id',s,'stage_kind','retainer_monthly','start_date','2026-12-01','end_date','2027-03-31'));
FOR i IN 0..3 LOOP
 p:=('00000000-0000-4000-a000-'||lpad((200+i)::text,12,'0'))::uuid;
 INSERT INTO quote_payment_schedule_items VALUES(p,q,s,'monthly',false,('2027-04-01'::date+make_interval(months=>i))::date,null,30,4+i,'inflow');
END LOOP;
FOR i IN 0..3 LOOP
 p:=('00000000-0000-4000-a000-'||lpad((200+i)::text,12,'0'))::uuid;
 IF pm_quote_preview_payment_date(q,'2026-11-02',p,dates,false) IS DISTINCT FROM expected[i+1] THEN RAISE EXCEPTION 'Construction month % did not map to live stage/calendar',i+1; END IF;
 IF pm_quote_preview_payment_date(q,'2026-11-02',p,dates,true) IS DISTINCT FROM expected[i+1]+30 THEN RAISE EXCEPTION 'Payment offset applied incorrectly'; END IF;
END LOOP;
RAISE NOTICE 'PASS: four construction months derive from live stage; holidays, closures/weekends and payment offsets respected';
END $$;
ROLLBACK;