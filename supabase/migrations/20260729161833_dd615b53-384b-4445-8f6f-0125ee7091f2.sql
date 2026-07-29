create or replace function public.pm_project_stage_hours(p_project_id uuid)
returns table (stage_id uuid, month text, hours numeric, billable_hours numeric, non_billable_hours numeric)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select
      public.pm_can_view_projects(auth.uid())
      or exists (
        select 1
        from public.pm_allocations a
        join public.pm_stages s on s.id = a.stage_id
        where s.project_id = p_project_id
          and a.resource_id = public.pm_get_my_resource_id()
      ) as ok
  ),
  entries as (
    select
      coalesce(te.pm_stage_id, st.id) as stage_id,
      to_char(te.entry_date, 'YYYY-MM') as month,
      te.hours,
      te.billable
    from public.pm_time_entries te
    left join public.pm_tasks t on t.id = te.task_id
    left join public.pm_allocations al on al.id = t.allocation_id
    left join public.pm_stages st on st.id = al.stage_id
    where te.entry_type = 'project'
      and (
        te.pm_stage_id in (select s.id from public.pm_stages s where s.project_id = p_project_id)
        or st.project_id = p_project_id
      )
  )
  select
    e.stage_id,
    e.month,
    sum(e.hours)::numeric as hours,
    sum(case when e.billable then e.hours else 0 end)::numeric as billable_hours,
    sum(case when e.billable then 0 else e.hours end)::numeric as non_billable_hours
  from entries e, allowed
  where allowed.ok
    and e.stage_id is not null
  group by e.stage_id, e.month
$$;

revoke all on function public.pm_project_stage_hours(uuid) from public;
grant execute on function public.pm_project_stage_hours(uuid) to authenticated;
grant execute on function public.pm_project_stage_hours(uuid) to service_role;