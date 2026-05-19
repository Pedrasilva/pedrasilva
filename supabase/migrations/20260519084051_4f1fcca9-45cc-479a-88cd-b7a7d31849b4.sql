-- Stage 6C — additive forecast & capacity tables.

create type public.pm_forecast_allocation_source as enum (
  'manual',
  'imported',
  'derived'
);

create type public.pm_capacity_risk_level as enum (
  'low',
  'medium',
  'high'
);

-- A. daily forecast curves
create table public.pm_resource_allocations_forecast (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  project_stage_id uuid not null references public.pm_stages(id) on delete cascade,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  resource_id uuid references public.pm_resources(id) on delete set null,
  allocation_id uuid references public.pm_allocations(id) on delete cascade,

  allocation_date date not null,
  allocated_hours numeric not null default 0,
  allocated_pct numeric,

  source public.pm_forecast_allocation_source not null default 'derived',
  bootstrap_run_id uuid references public.project_bootstrap_runs(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pm_resource_allocations_forecast_project_idx
  on public.pm_resource_allocations_forecast(project_id);
create index pm_resource_allocations_forecast_stage_idx
  on public.pm_resource_allocations_forecast(project_stage_id);
create index pm_resource_allocations_forecast_date_idx
  on public.pm_resource_allocations_forecast(allocation_date);
create index pm_resource_allocations_forecast_allocation_idx
  on public.pm_resource_allocations_forecast(allocation_id);

alter table public.pm_resource_allocations_forecast enable row level security;
create policy "Authenticated can read resource allocations forecast"
  on public.pm_resource_allocations_forecast for select to authenticated using (true);
create policy "Authenticated can write resource allocations forecast"
  on public.pm_resource_allocations_forecast for all to authenticated using (true) with check (true);

create trigger pm_resource_allocations_forecast_set_updated_at
  before update on public.pm_resource_allocations_forecast
  for each row execute function public.update_updated_at_column();

-- B. stage capacity snapshots
create table public.pm_stage_capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_stage_id uuid not null references public.pm_stages(id) on delete cascade,
  snapshot_date date not null default current_date,

  planned_hours numeric,
  allocated_hours numeric,
  remaining_hours numeric,

  planned_revenue numeric,
  planned_cost numeric,
  planned_margin_pct numeric,

  staffing_coverage_pct numeric,
  recoverability_pct numeric,

  created_at timestamptz not null default now()
);
create index pm_stage_capacity_snapshots_stage_idx
  on public.pm_stage_capacity_snapshots(project_stage_id);
create index pm_stage_capacity_snapshots_date_idx
  on public.pm_stage_capacity_snapshots(snapshot_date);

alter table public.pm_stage_capacity_snapshots enable row level security;
create policy "Authenticated can read stage capacity snapshots"
  on public.pm_stage_capacity_snapshots for select to authenticated using (true);
create policy "Authenticated can write stage capacity snapshots"
  on public.pm_stage_capacity_snapshots for all to authenticated using (true) with check (true);

-- C. project forecast metrics
create table public.pm_project_forecast_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  snapshot_date date not null default current_date,

  planned_fee numeric,
  forecast_fee numeric,
  planned_cost numeric,
  forecast_cost numeric,

  planned_margin_pct numeric,
  forecast_margin_pct numeric,

  allocated_hours numeric,
  remaining_hours numeric,

  staffing_coverage_pct numeric,
  capacity_risk_level public.pm_capacity_risk_level,

  created_at timestamptz not null default now()
);
create index pm_project_forecast_metrics_project_idx
  on public.pm_project_forecast_metrics(project_id);
create index pm_project_forecast_metrics_date_idx
  on public.pm_project_forecast_metrics(snapshot_date);

alter table public.pm_project_forecast_metrics enable row level security;
create policy "Authenticated can read project forecast metrics"
  on public.pm_project_forecast_metrics for select to authenticated using (true);
create policy "Authenticated can write project forecast metrics"
  on public.pm_project_forecast_metrics for all to authenticated using (true) with check (true);
