-- ============================================================
-- STACKD CONTENT ENGINE — Supabase Schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- ============================================================

-- Extensions ---------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums --------------------------------------------------------
do $$ begin
  create type video_status as enum ('drafting','producing','rendering','posting','live','failed','flagged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type video_format as enum ('short','medium','long');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_type as enum ('video','photo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type platform as enum ('youtube','tiktok','instagram','linkedin','facebook','twitter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_status as enum ('scheduled','posted','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type post_format as enum ('landscape','vertical','square');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum ('new','contacted','qualified','booked','converted','dead');
exception when duplicate_object then null; end $$;

do $$ begin
  create type comment_sentiment as enum ('positive','question','negative','spam','trigger');
exception when duplicate_object then null; end $$;

do $$ begin
  create type comment_response_status as enum ('pending','approved','posted','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status as enum ('active','unsubscribed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type calendar_status as enum ('planned','in_production','ready','posted','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pipeline_status as enum ('running','completed','failed');
exception when duplicate_object then null; end $$;

-- Tables -------------------------------------------------------

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text,
  script text,
  status video_status not null default 'drafting',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  duration_seconds int,
  format video_format not null default 'short',
  -- 'photo' rows skip voiceover/render entirely — see pipeline/README.md § Photo posts.
  content_type content_type not null default 'video',
  thumbnail_url text,
  video_file_path text,
  audio_file_path text,
  virality_score int check (virality_score between 1 and 10),
  hook_style text,
  content_pillar text,
  run_log jsonb default '[]'::jsonb,
  -- Stage 9 repurposing output (blog/thread/linkedin/newsletter/clips/quote cards),
  -- surfaced in the dashboard Video detail panel.
  repurposed jsonb default '{}'::jsonb,
  -- Snapshot of { strategy, files, thumbnails, platforms } captured when
  -- viralityCheck flags a video, so the dashboard's "Approve & Post" button
  -- can re-enter postToPlatforms without re-running the earlier stages.
  pending_post_payload jsonb
);

-- Idempotent add for projects created before the repurposed column existed.
alter table videos add column if not exists repurposed jsonb default '{}'::jsonb;
alter table videos add column if not exists pending_post_payload jsonb;
alter table videos add column if not exists content_type content_type not null default 'video';

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  platform platform not null,
  status post_status not null default 'scheduled',
  platform_post_id text,
  platform_url text,
  posted_at timestamptz,
  scheduled_for timestamptz,
  title text,
  caption text,
  hashtags text[] default '{}',
  utm_link text,
  format post_format not null default 'vertical',
  content_type content_type not null default 'video'
);

alter table posts add column if not exists content_type content_type not null default 'video';

create table if not exists analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  platform text,
  pulled_at timestamptz not null default now(),
  views int default 0,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  watch_time_seconds int default 0,
  click_throughs int default 0,
  followers_gained int default 0
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  source_platform text,
  source_post_id text,
  source_video_id text,
  name text,
  handle text,
  email text,
  trigger_word text,
  conversation_log jsonb default '[]'::jsonb,
  status lead_status not null default 'new',
  created_at timestamptz not null default now(),
  notes text
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  platform text,
  commenter_handle text,
  comment_text text,
  sentiment comment_sentiment,
  response_text text,
  response_status comment_response_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  subscriber_email text not null,
  first_name text,
  source_video_id text,
  source_platform text,
  subscribed_at timestamptz not null default now(),
  sequence_step int default 0,
  last_email_sent timestamptz,
  status email_status not null default 'active'
);

create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  topic text,
  content_pillar text,
  format video_format not null default 'short',
  status calendar_status not null default 'planned',
  video_id uuid references videos(id) on delete set null,
  notes text
);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  topic text,
  status pipeline_status not null default 'running',
  stages_completed text[] default '{}',
  error_message text,
  output_log jsonb default '[]'::jsonb
);

-- OAuth-connected platform credentials, replacing manually-pasted tokens in
-- pipeline/.env. `tenant_id` is a constant 'default' for now (this app is
-- single-tenant) — it exists purely so a future multi-tenant migration only
-- has to start passing a real tenant id through, not alter this schema.
create table if not exists platform_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  platform platform not null,
  access_token text not null,
  refresh_token text,      -- oauth2 only (youtube, tiktok); null for twitter
  token_secret text,       -- oauth1 only (twitter's paired secret); null for youtube/tiktok
  expires_at timestamptz,  -- oauth2 only; null for twitter (user tokens don't expire)
  scopes text[] default '{}',
  account_label text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform)
);

-- Indexes ------------------------------------------------------
create index if not exists idx_posts_video on posts(video_id);
create index if not exists idx_analytics_post on analytics(post_id);
create index if not exists idx_comments_post on comments(post_id);
create index if not exists idx_videos_status on videos(status);
create index if not exists idx_posts_platform on posts(platform);
create index if not exists idx_calendar_date on content_calendar(scheduled_date);
create index if not exists idx_pipeline_started on pipeline_runs(started_at desc);

-- Realtime -----------------------------------------------------
-- Enable realtime on the tables the dashboard subscribes to.
-- Wrapped so re-running the script is safe even if a table was
-- already added to the publication by a prior partial run.
do $$ begin
  alter publication supabase_realtime add table videos;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table posts;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table leads;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table comments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table pipeline_runs;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table content_calendar;
exception when duplicate_object then null; end $$;

-- Row Level Security --------------------------------------------
-- This section documents, rather than changes, the live security
-- posture: RLS is already enabled on every table in the Supabase
-- dashboard, default-deny with no permissive policies (verified
-- directly against the live project — anon key gets 401 on every
-- insert, and cannot read rows back even when they exist). These
-- statements just bring that config under version control.
--
-- Enabling RLS with zero permissive policies denies all access to
-- non-owner roles (anon/authenticated included) by default; the
-- explicit `as restrictive ... using (false)` policy below just
-- makes that deny-all intent visible in the schema itself, and
-- guards against someone later adding a permissive policy without
-- also scoping it. Only the service role (which bypasses RLS)
-- can read or write these tables.

alter table videos enable row level security;
create policy "deny_all" on videos as restrictive for all using (false) with check (false);

alter table posts enable row level security;
create policy "deny_all" on posts as restrictive for all using (false) with check (false);

alter table analytics enable row level security;
create policy "deny_all" on analytics as restrictive for all using (false) with check (false);

alter table leads enable row level security;
create policy "deny_all" on leads as restrictive for all using (false) with check (false);

alter table comments enable row level security;
create policy "deny_all" on comments as restrictive for all using (false) with check (false);

alter table emails enable row level security;
create policy "deny_all" on emails as restrictive for all using (false) with check (false);

alter table content_calendar enable row level security;
create policy "deny_all" on content_calendar as restrictive for all using (false) with check (false);

alter table pipeline_runs enable row level security;
create policy "deny_all" on pipeline_runs as restrictive for all using (false) with check (false);

alter table platform_credentials enable row level security;
create policy "deny_all" on platform_credentials as restrictive for all using (false) with check (false);
