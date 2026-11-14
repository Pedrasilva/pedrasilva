-- D67 approved data correction; document-only values, never fee inputs.
BEGIN;
INSERT INTO public.quote_billable_hourly_rates(quote_id,role_name,sale_rate,default_inherited) SELECT 'b8a53c48-e55a-4c5b-8a91-92a1e8e02e70'::uuid,code,rate,false FROM (VALUES ('partner',239::numeric),('director',200::numeric),('senior_architect',180::numeric),('architect',130::numeric),('lead_designer',92::numeric),('junior_architect',70::numeric)) v(code,rate) ON CONFLICT(quote_id,role_name) DO UPDATE SET sale_rate=excluded.sale_rate,default_inherited=false;
UPDATE public.proposal_roles SET default_sale_rate=v.rate FROM (VALUES ('partner',239::numeric),('director',200::numeric),('senior_architect',180::numeric),('architect',130::numeric),('lead_designer',92::numeric),('junior_architect',70::numeric)) v(code,rate) WHERE proposal_roles.code=v.code;
COMMIT;
