-- Badminton Motion Lab control plane (metadata only; no dense pose rows)
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  dominant_hand text check (dominant_hand in ('left', 'right', 'unknown')) default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  title text not null,
  session_type text not null check (session_type in ('technique', 'footwork', 'mixed')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  media_fingerprint text not null,
  storage_locator text not null,
  availability text not null default 'local' check (availability in ('local', 'missing', 'synced_proxy')),
  duration_ms integer,
  fps real,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  device_name text not null,
  device_fingerprint text not null unique,
  agent_version text,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  pairing_secret_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null references public.captures (id) on delete cascade,
  device_id uuid references public.worker_devices (id),
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled')),
  modules_requested text[] not null default '{}',
  lease_owner text,
  lease_expires_at timestamptz,
  progress real not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.analysis_jobs (id) on delete cascade,
  capture_id uuid not null references public.captures (id) on delete cascade,
  pipeline_version text not null,
  package_locator text,
  package_sha256 text,
  status text not null default 'completed'
    check (status in ('completed', 'failed', 'superseded')),
  quality_passed boolean,
  court_valid boolean,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_summaries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  module_id text not null,
  metric_id text not null,
  value double precision,
  unit text,
  confidence real,
  withheld boolean not null default false,
  rep_index integer,
  created_at timestamptz not null default now()
);

create table if not exists public.module_readiness (
  module_id text primary key,
  status text not null check (status in ('locked', 'on')),
  benchmark_report jsonb,
  unlocked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pairing_codes (
  code text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.sessions enable row level security;
alter table public.captures enable row level security;
alter table public.worker_devices enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.metric_summaries enable row level security;
alter table public.module_readiness enable row level security;
alter table public.pairing_codes enable row level security;

create policy profiles_own on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy athletes_own on public.athletes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy sessions_own on public.sessions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy captures_own on public.captures for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy devices_own on public.worker_devices for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy jobs_own on public.analysis_jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy runs_own on public.analysis_runs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy metrics_own on public.metric_summaries for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pairing_own on public.pairing_codes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Module readiness is readable by all authenticated users (product catalogue)
create policy readiness_read on public.module_readiness for select to authenticated using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create index if not exists metric_summaries_session_metric_idx
  on public.metric_summaries (session_id, metric_id, created_at);
create index if not exists analysis_jobs_status_idx on public.analysis_jobs (status, lease_expires_at);
