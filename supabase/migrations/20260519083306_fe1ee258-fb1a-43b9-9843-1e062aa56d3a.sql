-- Stage 6B — additive baseline + allocation placeholder tables.

create type public.pm_allocation_placeholder_source as enum (
  'ontology_default',
  'quote_snapshot',
  'manual'
);

-- A. project commercial baseline (one active baseline per bootstrap run)
create table public.pm_project_commercial_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  bootstrap_run_id uuid not null references public.project_bootstrap_runs(id) on delete cascade,
  source_contract_id uuid references public.contracts(id) on delete set null,

  sold_fee_total numeric,
  sold_internal_fee numeric,
  sold_external_fee numeric,
  sold_consultant_fee numeric,
  sold_reimbursable_allowance numeric,

  target_chargeability_pct numeric,
  target_recoverability_pct numeric,
  target_gross_margin_pct numeric,

  planned_duration_weeks numeric,
  planned_construction_months numeric,

  baseline_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (bootstrap_run_id)
);
create index pm_project_commercial_baselines_project_idx
  on public.pm_project_commercial_baselines(project_id);
create index pm_project_commercial_baselines_contract_idx
  on public.pm_project_commercial_baselines(source_contract_id);

alter table public.pm_project_commercial_baselines enable row level security;
create policy "Authenticated can read project commercial baselines"
  on public.pm_project_commercial_baselines for select to authenticated using (true);
create policy "Authenticated can write project commercial baselines"
  on public.pm_project_commercial_baselines for all to authenticated using (true) with check (true);

create trigger pm_project_commercial_baselines_set_updated_at
  before update on public.pm_project_commercial_baselines
  for each row execute function public.update_updated_at_column();

-- B. stage commercial baseline
create table public.pm_stage_commercial_baselines (
  id uuid primary key default gen_random_uuid(),
  project_stage_id uuid not null references public.pm_stages(id) on delete cascade,
  project_id uuid not null references public.pm_projects(id) on delete cascade,
  bootstrap_run_id uuid not null references public.project_bootstrap_runs(id) on delete cascade,
  source_contract_phase_key text,

  sold_fee numeric,
  estimated_hours numeric,
  estimated_internal_cost numeric,
  estimated_external_cost numeric,

  target_margin_pct numeric,
  target_recoverability_pct numeric,

  delivery_mode text,
  phase_class text,

  baseline_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_stage_id, bootstrap_run_id)
);
create index pm_stage_commercial_baselines_project_idx
  on public.pm_stage_commercial_baselines(project_id);
create index pm_stage_commercial_baselines_run_idx
  on public.pm_stage_commercial_baselines(bootstrap_run_id);

alter table public.pm_stage_commercial_baselines enable row level security;
create policy "Authenticated can read stage commercial baselines"
  on public.pm_stage_commercial_baselines for select to authenticated using (true);
create policy "Authenticated can write stage commercial baselines"
  on public.pm_stage_commercial_baselines for all to authenticated using (true) with check (true);

create trigger pm_stage_commercial_baselines_set_updated_at
  before update on public.pm_stage_commercial_baselines
  for each row execute function public.update_updated_at_column();

-- C. allocation placeholders (NOT real allocations — no collaborator_id)
create table public.pm_stage_allocation_placeholders (
  id uuid primary key default gen_random_uuid(),
  project_stage_id uuid not null references public.pm_stages(id) on delete cascade,
  bootstrap_run_id uuid not null references public.project_bootstrap_runs(id) on delete cascade,

  discipline text,
  role text,
  expected_hours numeric,
  expected_fte numeric,
  expected_duration_weeks numeric,

  source public.pm_allocation_placeholder_source not null default 'ontology_default',
  confidence_pct numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pm_stage_allocation_placeholders_stage_idx
  on public.pm_stage_allocation_placeholders(project_stage_id);
create index pm_stage_allocation_placeholders_run_idx
  on public.pm_stage_allocation_placeholders(bootstrap_run_id);

alter table public.pm_stage_allocation_placeholders enable row level security;
create policy "Authenticated can read allocation placeholders"
  on public.pm_stage_allocation_placeholders for select to authenticated using (true);
create policy "Authenticated can write allocation placeholders"
  on public.pm_stage_allocation_placeholders for all to authenticated using (true) with check (true);

create trigger pm_stage_allocation_placeholders_set_updated_at
  before update on public.pm_stage_allocation_placeholders
  for each row execute function public.update_updated_at_column();
