
-- Stage 5A: Contract Generator Foundation (additive only)

create type public.contract_status as enum ('draft','issued','signed','superseded','void');
create type public.contract_kind   as enum ('standalone','umbrella','sub_contract','retainer','addendum');

create table public.contracts (
  id                          uuid primary key default gen_random_uuid(),
  contract_number             text,
  title                       text not null,
  status                      public.contract_status not null default 'draft',
  contract_kind               public.contract_kind   not null default 'standalone',
  language                    text not null default 'pt-PT',
  currency                    text not null default 'EUR',

  source_quote_id             uuid references public.fee_proposals(id)    on delete set null,
  source_opportunity_id       uuid references public.crm_opportunities(id) on delete set null,
  source_company_id           uuid references public.companies(id)         on delete set null,
  source_project_id           uuid references public.pm_projects(id)       on delete set null,

  -- Sealed snapshots at draft creation. Upstream proposal edits MUST NOT mutate these.
  snapshot_json               jsonb not null default '{}'::jsonb,
  ontology_snapshot_json      jsonb not null default '{}'::jsonb,
  commercial_snapshot_json    jsonb not null default '{}'::jsonb,
  proposal_snapshot_json      jsonb not null default '{}'::jsonb,

  resolver_version            text not null default 'contracts.v1',

  generated_at                timestamptz not null default now(),
  issued_at                   timestamptz,
  signed_at                   timestamptz,
  superseded_by_contract_id   uuid references public.contracts(id) on delete set null,

  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index contracts_source_quote_idx       on public.contracts(source_quote_id);
create index contracts_source_opportunity_idx on public.contracts(source_opportunity_id);
create index contracts_source_company_idx     on public.contracts(source_company_id);
create index contracts_status_idx             on public.contracts(status);

-- Only one DRAFT contract per source quote. Issued/signed/superseded/void don't block new drafts.
create unique index contracts_one_draft_per_quote
  on public.contracts(source_quote_id)
  where status = 'draft' and source_quote_id is not null;

create table public.contract_clauses (
  id                       uuid primary key default gen_random_uuid(),
  contract_id              uuid not null references public.contracts(id) on delete cascade,
  clause_key               text not null,
  title                    text not null,
  content                  text not null default '',
  sort_order               int  not null default 0,
  source_resolver          text,
  source_ontology_component text,
  is_generated             boolean not null default true,
  manual_override          boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index contract_clauses_contract_idx on public.contract_clauses(contract_id, sort_order);
create unique index contract_clauses_unique_key on public.contract_clauses(contract_id, clause_key);

create table public.contract_exhibits (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  exhibit_key  text not null,
  title        text not null,
  content_json jsonb not null default '{}'::jsonb,
  sort_order   int not null default 0,
  source_type  text,
  source_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index contract_exhibits_contract_idx on public.contract_exhibits(contract_id, sort_order);
create unique index contract_exhibits_unique_key on public.contract_exhibits(contract_id, exhibit_key);

create table public.contract_events (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  event_type  text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index contract_events_contract_idx on public.contract_events(contract_id, created_at desc);

-- Touch triggers
create trigger contracts_touch
  before update on public.contracts
  for each row execute function public.update_updated_at_column();

create trigger contract_clauses_touch
  before update on public.contract_clauses
  for each row execute function public.update_updated_at_column();

create trigger contract_exhibits_touch
  before update on public.contract_exhibits
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.contracts          enable row level security;
alter table public.contract_clauses   enable row level security;
alter table public.contract_exhibits  enable row level security;
alter table public.contract_events    enable row level security;

-- contracts policies
create policy "contracts admin all"
  on public.contracts for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create policy "contracts read by crm/finance"
  on public.contracts for select
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_permission(auth.uid(),'crm.dashboard')
    or public.has_permission(auth.uid(),'finance.dashboard')
  );

-- clauses policies
create policy "contract_clauses admin all"
  on public.contract_clauses for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create policy "contract_clauses read by crm/finance"
  on public.contract_clauses for select
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_permission(auth.uid(),'crm.dashboard')
    or public.has_permission(auth.uid(),'finance.dashboard')
  );

-- exhibits policies
create policy "contract_exhibits admin all"
  on public.contract_exhibits for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create policy "contract_exhibits read by crm/finance"
  on public.contract_exhibits for select
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_permission(auth.uid(),'crm.dashboard')
    or public.has_permission(auth.uid(),'finance.dashboard')
  );

-- events policies
create policy "contract_events admin all"
  on public.contract_events for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create policy "contract_events read by crm/finance"
  on public.contract_events for select
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_permission(auth.uid(),'crm.dashboard')
    or public.has_permission(auth.uid(),'finance.dashboard')
  );
