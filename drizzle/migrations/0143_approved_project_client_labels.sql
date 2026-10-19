-- Populate only empty displayed client names for the three approved unique identities.
BEGIN;
UPDATE public.pm_projects p SET client=c.nome FROM public.companies c
WHERE p.company_id=c.id AND (p.client IS NULL OR btrim(p.client)='')
AND (p.id,p.company_id) IN (
 ('ff0dcfe7-b4df-4d42-a680-00878952b16d'::uuid,'c9bea0a2-3851-4074-bf02-918aeb739300'::uuid),
 ('3775332d-48e7-4042-8ec2-8bde1d475d8e'::uuid,'ab6fd154-ca2e-4212-b39c-c718d756dd58'::uuid),
 ('d1cb9b14-2361-4a1b-82c2-1d3097dec8ce'::uuid,'873e9db5-2f41-41ad-ab14-03c9e36a5d81'::uuid)
);
COMMIT;
