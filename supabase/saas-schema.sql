-- =====================================================================
-- SNS Schedule SaaS版 スキーマ（マルチテナント＋Supabase Auth＋RLS）
-- 新しいSupabaseプロジェクトの SQL Editor で一度だけ実行する。
-- 既存の本番プロジェクトでは実行しないこと。
-- =====================================================================

-- ---- 組織（会社ごとのテナント） ----
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  created_at timestamptz default now()
);

-- ---- プロフィール（auth.users と 1:1。氏名・役割・時給など） ----
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role text not null default 'member',        -- owner / member
  hourly_rate integer not null default 0,
  postal_code text, address text, phone text, email text,
  stamp_text text, stamp_shape text, stamp_orientation text, stamp_font text,
  created_at timestamptz default now()
);

-- 現在ログイン中ユーザーの org_id を返す（RLSで使用。SECURITY DEFINERで再帰回避）
create or replace function auth_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

-- サインアップ時に「組織＋オーナーのプロフィール」を一括作成
create or replace function create_org_and_owner(org_name text, owner_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'already has a profile';
  end if;
  insert into organizations(name) values (org_name) returning id into new_org;
  insert into profiles(id, org_id, name, role, email)
    values (auth.uid(), new_org, owner_name, 'owner',
            (select email from auth.users where id = auth.uid()));
  return new_org;
end $$;

-- ---- データテーブル（すべて org_id を持ち、RLSで自組織のみ） ----
create table schedule_events (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  date text not null, type text not null, title text not null,
  location text default '', assignee_ids jsonb not null default '[]',
  start_time text default '', end_time text default '', note text default '',
  has_reward boolean not null default true
);

create table availability (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, date text not null,
  slots jsonb not null default '[]', comment text default '',
  primary key (user_id, date)
);

create table app_requests (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  date text not null, from_user_id text, to_user_id text,
  type text not null, title text not null, location text default '',
  start_time text default '', end_time text default '', note text default '',
  status text not null default 'pending', event_id text
);

create table pay_confirmations (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, quarter text not null,
  amount integer default 0, hours real default 0,
  work_amount integer default 0, video_amount integer default 0,
  note text, status text default 'requested',
  requested_at text, confirmed_at text, approved_at text
);

create table recipients (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, name text not null, type text not null
);

create table comment_templates (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, text text not null
);

create table video_tasks (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  from_user_id text, to_user_id text,
  title text not null, description text default '',
  deadline text, amount integer default 0,
  status text default 'pending', created_at text,
  delivery_url text, delivery_note text, submitted_at text, completed_at text
);

create table event_approvals (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  event_id text not null, user_id text not null,
  hours real default 0, amount integer default 0, note text,
  status text default 'requested', requested_at text, approved_at text
);

create table projects (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, status text default 'active', description text default '',
  assignee_ids jsonb not null default '[]', start_date text, created_at text
);

create table project_materials (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  project_id text not null, title text not null, kind text default 'link',
  url text not null, file_path text, note text, created_by text, created_at text
);

create table push_subscriptions (
  endpoint text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, subscription jsonb not null, created_at timestamptz default now()
);

-- =====================================================================
-- RLS：自分の組織のデータだけ読み書きできるようにする
-- =====================================================================
alter table organizations enable row level security;
create policy org_sel on organizations for select using (id = auth_org_id());
create policy org_ins on organizations for insert with check (true); -- サインアップ用
create policy org_upd on organizations for update using (id = auth_org_id());

alter table profiles enable row level security;
create policy prof_sel on profiles for select using (org_id = auth_org_id());
create policy prof_ins on profiles for insert with check (id = auth.uid());
create policy prof_upd on profiles for update using (id = auth.uid() or org_id = auth_org_id());

-- データテーブル共通：org_id = 自組織 のみ
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_events','availability','app_requests','pay_confirmations',
    'recipients','comment_templates','video_tasks','event_approvals',
    'projects','project_materials','push_subscriptions'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy s on %I for select using (org_id = auth_org_id());', t);
    execute format('create policy i on %I for insert with check (org_id = auth_org_id());', t);
    execute format('create policy u on %I for update using (org_id = auth_org_id()) with check (org_id = auth_org_id());', t);
    execute format('create policy d on %I for delete using (org_id = auth_org_id());', t);
  end loop;
end $$;

-- ファイル保存用ストレージ（資料）。組織フォルダで分ける運用。
insert into storage.buckets (id, name, public) values ('materials','materials', true)
on conflict (id) do nothing;
create policy materials_read on storage.objects for select using (bucket_id = 'materials');
create policy materials_insert on storage.objects for insert with check (bucket_id = 'materials' and auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
