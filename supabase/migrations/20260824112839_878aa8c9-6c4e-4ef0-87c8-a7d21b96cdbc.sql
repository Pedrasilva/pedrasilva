create or replace function public.fee_proposal_resolved_value(_quote_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
with q as (
  select coalesce(nullif(pricing_multiplier, 0), 1) as m,
         coalesce(fee_source_mode, 'allocation') as mode,
         coalesce(valor, 0) as valor
  from fee_proposals where id = _quote_id
),
st as (
  select s.id, s.budget, s.parent_stage_id,
         coalesce(nullif(s.sale_source, ''), (select mode from q)) as src
  from quote_stages s
  where s.quote_id = _quote_id
    and coalesce(s.stage_role, '') <> 'client'
),
par as (select distinct parent_stage_id as id from st where parent_stage_id is not null),
leaf as (select s.* from st s where not exists (select 1 from par p where p.id = s.id)),
budget_fee as (
  select coalesce(sum(coalesce(l.budget, 0)), 0) as v from leaf l where l.src = 'budget'
),
alloc_fee as (
  select coalesce(sum(
    (select count(*) from generate_series(a.start_date::timestamp, a.end_date::timestamp, interval '1 day') d
      where extract(isodow from d) < 6)
    * coalesce(a.hours_per_day, 8) * coalesce(a.sale_rate_snapshot, 0)
  ), 0) as v
  from quote_allocations a
  where a.quote_id = _quote_id
    and a.start_date is not null and a.end_date is not null
    and (
      a.stage_id is null and not exists (select 1 from st)
      or exists (select 1 from leaf l where l.id = a.stage_id and l.src <> 'budget')
    )
),
ext as (
  select coalesce(sum(coalesce(sale_price, 0) * coalesce(quantity, 1)), 0) as v
  from quote_external_services where quote_id = _quote_id
)
select greatest(
  (select valor from q),
  round(((select v from budget_fee) + (select v from alloc_fee) + (select v from ext)) * (select m from q), 2)
);
$$;

grant execute on function public.fee_proposal_resolved_value(uuid) to authenticated, anon, service_role;

create or replace view public.fee_proposal_values
with (security_invoker = on) as
select fp.id as quote_id,
       fp.opportunity_id,
       fp.archived_at,
       fp.deleted_at,
       public.fee_proposal_resolved_value(fp.id) as resolved_value
from public.fee_proposals fp;

grant select on public.fee_proposal_values to authenticated, service_role;