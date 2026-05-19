-- Stage 6A — Project Bootstrap Foundation

create type public.project_bootstrap_status as enum ('preview','applied','failed','void');

create table public.project_bootstrap_runs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_quote_id uuid references public.fee_proposals(id) on delete set null,
  target_project_id uuid references public.pm_projects(id) on delete set null,
  status public.project_bootstrap_status not null default 'preview',
  resolver_version text not null default 'project-bootstrap.v1',
  snapshot_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_json jsonb,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_bootstrap_runs_contract_idx on public.project_bootstrap_runs(contract_id);
create index project_bootstrap_runs_target_project_idx on public.project_bootstrap_runs(target_project_id);
create index project_bootstrap_runs_status_idx on public.project_bootstrap_runs(status);

-- Only one applied bootstrap per contract.
create unique index project_bootstrap_runs_one_applied_per_contract
  on public.project_bootstrap_runs(contract_id)
  where status = 'applied';

create trigger trg_project_bootstrap_runs_updated_at
  before update on public.project_bootstrap_runs
  for each row execute function public.update_updated_at_column();

alter table public.project_bootstrap_runs enable row level security;

create policy "project_bootstrap_runs admin all"
  on public.project_bootstrap_runs
  for all
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "project_bootstrap_runs read by crm/projects"
  on public.project_bootstrap_runs
  for select
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_permission(auth.uid(), 'crm.dashboard'::text)
    or has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- Provenance columns (all nullable, additive)
alter table public.pm_projects
  add column if not exists source_contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists bootstrap_run_id uuid references public.project_bootstrap_runs(id) on delete set null;

create index if not exists pm_projects_source_contract_idx on public.pm_projects(source_contract_id);
create index if not exists pm_projects_bootstrap_run_idx on public.pm_projects(bootstrap_run_id);

alter table public.pm_stages
  add column if not exists source_contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists bootstrap_run_id uuid references public.project_bootstrap_runs(id) on delete set null,
  add column if not exists source_contract_phase_key text;

create index if not exists pm_stages_source_contract_idx on public.pm_stages(source_contract_id);
create index if not exists pm_stages_bootstrap_run_idx on public.pm_stages(bootstrap_run_id);

alter table public.pm_stage_dependencies
  add column if not exists source_contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists bootstrap_run_id uuid references public.project_bootstrap_runs(id) on delete set null;

create index if not exists pm_stage_dep_source_contract_idx on public.pm_stage_dependencies(source_contract_id);
create index if not exists pm_stage_dep_bootstrap_run_idx on public.pm_stage_dependencies(bootstrap_run_id);