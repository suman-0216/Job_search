-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique,
  full_name text not null,
  password_hash text not null,
  email_verified boolean not null default false,
  verification_code text,
  verification_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_username_lower check (username = lower(username)),
  constraint app_users_email_lower check (email = lower(email))
);

alter table public.app_users add column if not exists email text;
alter table public.app_users add column if not exists email_verified boolean not null default false;
alter table public.app_users add column if not exists verification_code text;
alter table public.app_users add column if not exists verification_expires_at timestamptz;
update public.app_users set email = lower(username || '@local.app') where email is null;
alter table public.app_users alter column email set not null;
create unique index if not exists idx_app_users_email_unique on public.app_users(email);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  scraped_at timestamptz not null,
  timestamp text not null,
  jobs jsonb not null default '[]'::jsonb,
  funded jsonb not null default '[]'::jsonb,
  stealth jsonb not null default '[]'::jsonb,
  source_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applied_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  job_key text not null,
  title text not null default '',
  company text not null default '',
  link text not null default '',
  source_date date,
  applied_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'applied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applied_jobs_status_check check (status in ('applied', 'assessment', 'interviewing', 'offer', 'declined')),
  unique (user_id, job_key)
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  apify_token text not null default '',
  llm_provider text not null default 'openai',
  llm_api_key text not null default '',
  llm_model text not null default '',
  workflow_enabled boolean not null default true,
  timezone text not null default 'America/Los_Angeles',
  run_times jsonb not null default '["06:30","09:00","12:00"]'::jsonb,
  target_roles jsonb not null default '[]'::jsonb,
  target_locations jsonb not null default '["United States","California","San Francisco Bay Area"]'::jsonb,
  experience_min int not null default 0,
  experience_max int not null default 3,
  requirements text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_llm_provider_check check (llm_provider in ('openai', 'claude', 'gemini'))
);

create table if not exists public.user_run_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  status text not null default 'queued',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  settings_snapshot jsonb not null default '{}'::jsonb,
  constraint user_run_requests_status_check check (status in ('queued', 'running', 'completed', 'failed'))
);

create index if not exists idx_app_sessions_token_hash on public.app_sessions(token_hash);
create index if not exists idx_app_sessions_user_expires on public.app_sessions(user_id, expires_at);
create index if not exists idx_applied_jobs_user_status on public.applied_jobs(user_id, status);
create index if not exists idx_job_snapshots_date on public.job_snapshots(snapshot_date desc);
create index if not exists idx_user_run_requests_user_requested on public.user_run_requests(user_id, requested_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_app_users on public.app_users;
create trigger trg_touch_app_users
before update on public.app_users
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_applied_jobs on public.applied_jobs;
create trigger trg_touch_applied_jobs
before update on public.applied_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_job_snapshots on public.job_snapshots;
create trigger trg_touch_job_snapshots
before update on public.job_snapshots
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_user_settings on public.user_settings;
create trigger trg_touch_user_settings
before update on public.user_settings
for each row execute function public.touch_updated_at();

-- Optional hardening:
-- Revoke direct public access in production if you only use server-side service role.
-- revoke all on public.app_users from anon, authenticated;
-- revoke all on public.app_sessions from anon, authenticated;
-- revoke all on public.applied_jobs from anon, authenticated;
-- revoke all on public.job_snapshots from anon, authenticated;