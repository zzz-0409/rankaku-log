create table if not exists public.rankaku_accounts (
  id uuid primary key,
  name text not null,
  name_key text not null unique,
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rankaku_records (
  account_id uuid primary key references public.rankaku_accounts(id) on delete cascade,
  records jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rankaku_accounts enable row level security;
alter table public.rankaku_records enable row level security;
