
alter table public.contracts
  add column if not exists parent_contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists root_contract_id   uuid references public.contracts(id) on delete set null,
  add column if not exists revision_number    integer not null default 1;

-- Backfill: every existing contract is its own root, revision 1
update public.contracts
  set root_contract_id = id
  where root_contract_id is null;

create index if not exists contracts_parent_idx on public.contracts(parent_contract_id);
create index if not exists contracts_root_idx   on public.contracts(root_contract_id);

-- Replace single-draft-per-quote rule with single-draft-per-lineage
drop index if exists public.contracts_one_draft_per_quote;
create unique index contracts_one_draft_per_root
  on public.contracts(root_contract_id)
  where status = 'draft' and root_contract_id is not null;
