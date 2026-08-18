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
  neppan_ical_url text, -- ねっぱん！のiCal(.ics)フィードURL（未設定ならnull=同期しない）
  theme text not null default 'coral', -- 画面の配色テーマ（coral/ocean/forest/lavender/charcoal）
  created_at timestamptz default now()
);

-- ---- プロフィール（auth.users と 1:1。氏名・役割・時給など） ----
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role text not null default 'member',        -- owner / member / cafe_manager
  hourly_rate integer not null default 0,
  receipt_name text,
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

-- 1社専用運用向け：最初の1人は会社を自動作成してオーナーに、
-- 2人目以降は既存の（最初に作られた）会社へ自動的にメンバー参加する。
-- 会社作成・招待コードの入力をユーザーに求めない。
create or replace function join_or_create_org(member_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'already has a profile';
  end if;
  select id into target_org from organizations order by created_at limit 1;
  if target_org is null then
    insert into organizations(name) values ('宿ぽっぽや') returning id into target_org;
    insert into profiles(id, org_id, name, role, email)
      values (auth.uid(), target_org, member_name, 'owner',
              (select email from auth.users where id = auth.uid()));
  else
    insert into profiles(id, org_id, name, role, email)
      values (auth.uid(), target_org, member_name, 'member',
              (select email from auth.users where id = auth.uid()));
  end if;
  return target_org;
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

create table event_approvals (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  event_id text not null, user_id text not null,
  hours real default 0, amount integer default 0, note text,
  work_amount integer, expense integer, extra_items jsonb,
  status text default 'requested', requested_at text, approved_at text
);

create table push_subscriptions (
  endpoint text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, subscription jsonb not null, created_at timestamptz default now()
);

-- 出退勤打刻
create table time_clocks (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, date text not null,
  clock_in text, clock_out text
);

-- シフト(予定)ごとの業務チェックリスト
create table shift_checklist_items (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  event_id text not null, text text not null, done boolean not null default false
);

-- 申し送り・引き継ぎメモ（日付単位）
create table handover_notes (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  date text not null, user_id text not null, text text not null, created_at text
);

-- 遅刻・欠勤の連絡
create table attendance_alerts (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id text not null, date text not null, kind text not null,
  note text default '', created_at text
);

-- 宿泊予約。予約サイトからの通知メール経由（Edge Function）と、
-- 管理者がカレンダーから手入力したもの（source='manual'）の両方が入る。
create table reservations (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  neppan_booking_id text not null, -- 「予約サイト:予約番号」の形。サイト間で番号がかぶっても衝突しない
  source text default 'other',     -- manual / neppan / rakuten / jalan / booking / airbnb / ikyu / other
  checkin_date text not null, checkout_date text not null,
  checkin_time text default '15:00',
  room_type text default '', guest_name text default '',
  address text default '',
  adults integer default 0, children integer default 0, infants integer default 0,
  past_stay_count integer default 0,
  note text default '',
  status text not null default 'confirmed', synced_at timestamptz default now(),
  unique (org_id, neppan_booking_id)
);

-- LOCOMO CAFEの営業時間（1日1件。営業する日だけ登録する）
create table cafe_hours (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  date text not null,
  open_time text default '09:00',
  close_time text default '17:00',
  note text default '',
  unique (org_id, date)
);

-- シフトのコマ（勤務パターン）。管理者が設定画面で追加・編集できる。
-- timing: checkin / every_morning / middle_day / checkout
create table shift_templates (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  timing text not null default 'checkin',
  start_time text not null default '09:00',
  end_time text not null default '17:00',
  sort_order integer not null default 0
);

-- 解析できなかった予約通知メール（書式変更の検知・後から手動対応するため保存）
create table reservation_mail_errors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  raw_body text, reason text, created_at timestamptz default now()
);

-- 通知スケジュール（毎月◯日◯時に、指定したメンバーへプッシュ通知を送る設定）。
-- 管理者が設定画面で追加・編集する。実際の送信は send-scheduled-notifications
-- Edge Function が pg_cron から定期的に呼ばれて行う（service roleでRLSをバイパス）。
create table notification_schedules (
  id text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, -- 通知の種類の名前（例: 稼働可能日の入力リマインド）
  message text not null,
  recipient_mode text not null default 'all', -- 'all' | 'selected'
  recipient_ids jsonb not null default '[]', -- recipient_mode='selected'のとき対象ユーザーIDを入れる
  day_of_month integer not null default 1, -- 1〜28（29〜31日は月によって存在しないため使わない）
  hour integer not null default 9,
  minute integer not null default 0,
  enabled boolean not null default true,
  last_sent_at timestamptz -- 二重送信防止（同じ月にもう送ったかの判定に使う）
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
-- メンバー削除はオーナーのみ（同じ組織内で、かつ自分がowner権限を持つ場合だけ許可）
create policy prof_del on profiles for delete using (
  org_id = auth_org_id()
  and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
);

-- データテーブル共通：org_id = 自組織 のみ
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_events','availability','app_requests','pay_confirmations',
    'recipients','comment_templates','event_approvals',
    'push_subscriptions',
    'time_clocks','shift_checklist_items','handover_notes','attendance_alerts',
    'shift_templates'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy s on %I for select using (org_id = auth_org_id());', t);
    execute format('create policy i on %I for insert with check (org_id = auth_org_id());', t);
    execute format('create policy u on %I for update using (org_id = auth_org_id()) with check (org_id = auth_org_id());', t);
    execute format('create policy d on %I for delete using (org_id = auth_org_id());', t);
  end loop;
end $$;

-- reservations は自組織のみ読み書き可（管理者がカレンダーから予約を手入力するため）。
-- メール連携での書き込みは Edge Function が service role で行う（RLSバイパス）。
alter table reservations enable row level security;
create policy res_sel on reservations for select using (org_id = auth_org_id());
create policy res_ins on reservations for insert with check (org_id = auth_org_id());
create policy res_upd on reservations for update using (org_id = auth_org_id()) with check (org_id = auth_org_id());
create policy res_del on reservations for delete using (org_id = auth_org_id());

alter table cafe_hours enable row level security;
create policy cafe_sel on cafe_hours for select using (org_id = auth_org_id());
create policy cafe_ins on cafe_hours for insert with check (org_id = auth_org_id());
create policy cafe_upd on cafe_hours for update using (org_id = auth_org_id()) with check (org_id = auth_org_id());
create policy cafe_del on cafe_hours for delete using (org_id = auth_org_id());

-- notification_schedules は管理者(owner)のみ読み書き可。送信自体はEdge Functionが
-- service roleで行うため、last_sent_at の更新はRLSの影響を受けない。
alter table notification_schedules enable row level security;
create policy notif_sel on notification_schedules for select using (
  org_id = auth_org_id()
  and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
);
create policy notif_ins on notification_schedules for insert with check (
  org_id = auth_org_id()
  and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
);
create policy notif_upd on notification_schedules for update using (
  org_id = auth_org_id()
  and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
) with check (org_id = auth_org_id());
create policy notif_del on notification_schedules for delete using (
  org_id = auth_org_id()
  and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
);

NOTIFY pgrst, 'reload schema';
