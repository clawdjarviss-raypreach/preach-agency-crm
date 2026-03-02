-- 001_initial_schema.sql
-- Preach CRM Supabase Migration — Phase 1

create extension if not exists pgcrypto;

create table if not exists convex_id_map (
  convex_id text primary key,
  pg_id uuid not null,
  table_name text not null,
  created_at timestamptz not null default now()
);

-- =========================
-- AUTH / IDENTITY
-- =========================

create table if not exists crm_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text not null default '#6b7280',
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);

create table if not exists crm_chatters (
  id uuid primary key default gen_random_uuid(),
  supabase_auth_id uuid unique,
  name text not null,
  username text not null unique,
  pin_hash text not null,
  role_id uuid,
  role text not null check (role in ('admin','manager','supervisor','chatter','marketing_manager')),
  discord_id text,
  email text,
  status text not null default 'active' check (status in ('pending','active','inactive','trial','invited')),
  invite_token_id uuid,
  assigned_creators text[] not null default '{}',
  hourly_rate numeric(10,2),
  commission_pct numeric(5,2),
  joined_at timestamptz not null default now(),
  avatar_emoji text,
  profile_picture_url text,
  timezone text,
  employment_type text check (employment_type in ('employee','contractor')),
  payment_method text check (payment_method in ('stripe','bank_transfer','manual')),
  payment_details jsonb,
  preferred_currency text default 'USD',
  stripe_account_id text,
  bank_details text,
  created_at timestamptz not null default now()
);

alter table crm_roles add constraint crm_roles_created_by_fkey foreign key (created_by) references crm_chatters(id);
alter table crm_chatters add constraint crm_chatters_role_id_fkey foreign key (role_id) references crm_roles(id);

create table if not exists crm_sessions (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists crm_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  creator_id uuid not null references crm_chatters(id),
  created_by uuid references crm_chatters(id),
  email text not null,
  status text not null default 'active' check (status in ('active','used','expired','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references crm_chatters(id),
  expired_at timestamptz,
  used_at timestamptz,
  used_by uuid references crm_chatters(id),
  used_by_chatter_id uuid references crm_chatters(id)
);

create table if not exists crm_invite_link (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references crm_chatters(id)
);

-- =========================
-- CREATORS / ACCESS
-- =========================

create table if not exists crm_creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  only_fans_handle text,
  instagram_username text,
  instagram_usernames text[] default '{}',
  only_monster_id text,
  platform_account_id text,
  status text not null default 'active' check (status in ('active','archived')),
  notes text,
  avatar_url text,
  email text,
  subscribe_price numeric(10,2),
  subscription_expiry text,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('success','error')),
  last_sync_error text,
  expiry_alert_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists crm_user_creator_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references crm_chatters(id) on delete cascade,
  creator_id uuid not null references crm_creators(id) on delete cascade,
  axes jsonb not null default '{"socials":false,"revenue":false,"trackingLinks":false,"subs":false}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, creator_id)
);

-- =========================
-- OF CORE
-- =========================

create table if not exists crm_of_api_config (
  id uuid primary key default gen_random_uuid(),
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references crm_chatters(id)
);

create table if not exists crm_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique,
  creator_id uuid not null references crm_creators(id),
  display_name text,
  status text not null default 'active' check (status in ('active','disconnected','error')),
  last_sync_at timestamptz,
  sync_status text check (sync_status in ('idle','syncing','error'))
);

create table if not exists crm_of_sync_state (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  endpoint text not null check (endpoint in ('earnings','messages','chats','fans','transactions','forecast','chargebacks','tracking_links')),
  last_sync_at timestamptz,
  cursor text,
  status text not null default 'idle' check (status in ('idle','syncing','error')),
  error text,
  unique(account_id, endpoint)
);

create table if not exists crm_of_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  of_transaction_id text not null unique,
  amount numeric(12,2) not null default 0,
  type text not null check (type in ('ppv','tip','subscription','new_sub','rebill','stream')),
  fan_id text,
  fan_username text,
  timestamp timestamptz not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists crm_of_daily_earnings (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  date date not null,
  total_earnings numeric(12,2) not null default 0,
  subscription_earnings numeric(12,2) not null default 0,
  tip_earnings numeric(12,2) not null default 0,
  message_earnings numeric(12,2) not null default 0,
  stream_earnings numeric(12,2) not null default 0,
  referral_earnings numeric(12,2) not null default 0,
  transaction_count integer not null default 0,
  subscription_count integer not null default 0,
  tip_count integer not null default 0,
  message_count integer not null default 0,
  chargeback_amount numeric(12,2) not null default 0,
  chargeback_count integer not null default 0,
  net_earnings numeric(12,2) not null default 0,
  synced_at timestamptz not null default now(),
  unique(account_id, date)
);

create table if not exists crm_of_forecast_cache (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique,
  forecast_data jsonb,
  generated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table if not exists crm_of_credit_usage (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  credits_used integer not null default 1,
  account_id text not null,
  called_at timestamptz not null,
  response_status integer not null
);

create table if not exists crm_of_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  account_id text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed boolean not null default false
);

create table if not exists crm_of_fans (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  fan_id text not null unique,
  username text not null,
  display_name text,
  total_spend numeric(12,2) default 0,
  subscribed_at timestamptz,
  expired_at timestamptz,
  renews_at timestamptz,
  subscription_price numeric(10,2),
  is_subscribed boolean,
  is_active boolean not null default true,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists crm_of_chat_stats (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  chat_id text not null,
  fan_username text not null,
  fan_display_name text,
  last_message_at timestamptz,
  last_creator_reply_at timestamptz,
  avg_response_time_sec integer,
  total_messages integer not null default 0,
  total_from_fan integer not null default 0,
  total_from_creator integer not null default 0,
  has_unread boolean not null default false,
  synced_at timestamptz not null default now(),
  unique(account_id, chat_id)
);

create table if not exists crm_of_messages (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  chat_id text not null,
  message_id text not null unique,
  from_user boolean not null,
  text text,
  timestamp timestamptz not null,
  is_media boolean not null default false,
  is_ppv boolean not null default false,
  response_time_sec integer,
  is_first_in_thread boolean
);

create table if not exists crm_of_tracking_links (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  creator_id uuid references crm_creators(id),
  link_id text not null,
  name text not null,
  url text not null,
  clicks integer not null default 0,
  subscribers integer not null default 0,
  conversion_rate numeric(8,6) not null default 0,
  last_synced_at timestamptz not null default now(),
  unique(account_id, link_id)
);

create table if not exists crm_tracking_link_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references crm_chatters(id) on delete cascade,
  tracking_link_id uuid not null references crm_of_tracking_links(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references crm_chatters(id),
  unique(user_id, tracking_link_id)
);

create table if not exists crm_tracking_link_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracking_link_id uuid not null references crm_of_tracking_links(id) on delete cascade,
  account_id text not null,
  clicks integer not null default 0,
  subscribers integer not null default 0,
  conversion_rate numeric(8,6) not null default 0,
  snapshot_at timestamptz not null default now()
);

-- =========================
-- IG / SOCIAL
-- =========================

create table if not exists crm_ig_accounts (
  id uuid primary key default gen_random_uuid(),
  supabase_id text not null unique,
  creator_id uuid references crm_creators(id),
  username text not null,
  followers integer not null default 0,
  following integer not null default 0,
  media_count integer not null default 0,
  bio text,
  profile_pic_url text,
  last_synced_at timestamptz not null default now()
);

create table if not exists crm_ig_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  ig_account_id uuid not null references crm_ig_accounts(id) on delete cascade,
  date date not null,
  followers integer not null default 0,
  following integer not null default 0,
  followers_delta integer,
  views integer not null default 0,
  views_delta integer,
  likes integer not null default 0,
  likes_delta integer,
  comments integer not null default 0,
  comments_delta integer,
  reels_posted integer,
  feed_posted integer,
  stories_posted integer,
  last_synced_at timestamptz not null default now(),
  unique(ig_account_id, date)
);

create table if not exists crm_ig_reels (
  id uuid primary key default gen_random_uuid(),
  ig_account_id uuid not null references crm_ig_accounts(id) on delete cascade,
  supabase_reel_id text not null unique,
  caption text,
  thumbnail_url text,
  posted_at timestamptz,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  last_synced_at timestamptz not null default now()
);

create table if not exists crm_ig_reel_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  ig_reel_id uuid not null references crm_ig_reels(id) on delete cascade,
  supabase_reel_id text not null,
  account_id text not null,
  snapshot_date date not null,
  views integer not null default 0,
  views_delta integer,
  likes integer not null default 0,
  likes_delta integer,
  comments integer not null default 0,
  comments_delta integer,
  shares integer not null default 0,
  shares_delta integer,
  last_synced_at timestamptz not null default now(),
  unique(supabase_reel_id, snapshot_date)
);

create table if not exists crm_ig_funnels (
  id uuid primary key default gen_random_uuid(),
  ig_account_id uuid not null references crm_ig_accounts(id) on delete cascade,
  date date not null,
  link_in_bio text,
  gaml_clicks integer not null default 0,
  of_clicks integer not null default 0,
  of_subs integer not null default 0,
  conversion_rate numeric(8,6) not null default 0,
  last_synced_at timestamptz not null default now(),
  unique(ig_account_id, date)
);

-- =========================
-- SHIFTS / SCHEDULE / REPORTS
-- =========================

create table if not exists crm_shifts (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  creator_id uuid not null references crm_creators(id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  total_minutes integer,
  breaks jsonb default '[]',
  total_break_minutes integer,
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists crm_schedules (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  date date not null,
  shift_type text not null check (shift_type in ('morning','afternoon','evening','night','full')),
  start_time text,
  end_time text,
  creator_id uuid references crm_creators(id),
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','off_requested','off_approved','off_denied')),
  notes text,
  created_by uuid not null references crm_chatters(id),
  created_at timestamptz not null default now()
);

create table if not exists crm_sales_reports (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  shift_id uuid references crm_shifts(id),
  date date not null,
  sales jsonb not null default '[]',
  total_sales numeric(12,2) not null default 0,
  busyness_rating integer not null,
  spender_count integer not null default 0,
  warmed_up_subs integer not null default 0,
  warmed_up_sub_names text,
  selling_chats_from_mm integer,
  what_went_well text,
  what_didnt_go_well text,
  need_help_with text,
  content_feedback text,
  submitted_at timestamptz not null default now(),
  edited_at timestamptz,
  status text not null default 'submitted' check (status in ('submitted','reviewed','flagged')),
  reviewed_by uuid references crm_chatters(id),
  review_note text
);

-- =========================
-- GAMIFICATION / TARGETS / BONUS / PAYROLL
-- =========================

create table if not exists crm_streaks (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null unique references crm_chatters(id),
  current_streak integer not null default 0,
  streak_start_date date,
  last_work_date date,
  best_streak integer not null default 0,
  best_streak_start_date date,
  best_streak_end_date date,
  freezes_used_this_week integer not null default 0,
  freeze_week_start date,
  last_freeze_date date,
  updated_at timestamptz not null default now()
);

create table if not exists crm_achievements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  emoji text not null,
  category text not null check (category in ('streak','revenue','punctuality','ranking','growth','target')),
  tier text not null check (tier in ('bronze','silver','gold','diamond')),
  criteria_type text not null,
  criteria_value numeric not null,
  sort_order integer not null,
  is_active boolean not null default true
);

create table if not exists crm_chatter_achievements (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  achievement_id uuid not null references crm_achievements(id),
  earned_at timestamptz not null default now(),
  trigger_data text,
  notified boolean not null default false,
  unique(chatter_id, achievement_id)
);

create table if not exists crm_targets (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid references crm_chatters(id),
  period_type text not null check (period_type in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  target_amount numeric(12,2) not null,
  commission_base numeric(5,2),
  commission_above_target numeric(5,2),
  commission_above_double numeric(5,2),
  set_by uuid not null references crm_chatters(id),
  set_at timestamptz not null default now(),
  notes text
);

create table if not exists crm_weekly_targets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references crm_creators(id),
  week_start date not null,
  response_time_target integer not null,
  ppv_unlock_target numeric(5,2) not null,
  ppv_min_sent integer not null,
  weekly_bonus_amount integer not null,
  is_active boolean not null default true,
  unique(creator_id, week_start)
);

create table if not exists crm_target_progress (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  creator_id uuid not null references crm_creators(id),
  week_start date not null,
  avg_response_time integer,
  ppv_unlock_rate numeric(5,2),
  ppv_sent_count integer,
  meets_response_time boolean not null default false,
  meets_ppv_unlock boolean not null default false,
  meets_ppv_sent boolean not null default false,
  meets_all_targets boolean not null default false,
  last_updated timestamptz not null default now(),
  unique(chatter_id, creator_id, week_start)
);

create table if not exists crm_bonus_records (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  type text not null check (type in ('weekly_target','shift_500','shift_750','holiday','commission','ad_hoc')),
  amount integer not null,
  period_start date not null,
  period_end date not null,
  creator_id uuid references crm_creators(id),
  description text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  approved_by uuid references crm_chatters(id),
  approved_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  payment_ref text,
  created_at timestamptz not null default now(),
  auto_generated boolean not null default false
);

create table if not exists crm_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  hourly_multiplier numeric(4,2) not null default 2.0,
  bonus_multiplier numeric(4,2) not null default 2.0,
  commission_rate numeric(4,3) not null default 0.06,
  is_active boolean not null default true
);

create table if not exists crm_bonuses (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  type text not null check (type in ('manual','commission','achievement','streak')),
  amount numeric(12,2) not null,
  description text not null,
  period_type text check (period_type in ('weekly','monthly')),
  period_start date,
  target_id uuid references crm_targets(id),
  achievement_id uuid references crm_achievements(id),
  awarded_by uuid not null references crm_chatters(id),
  awarded_at timestamptz not null default now(),
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  approved_by uuid references crm_chatters(id),
  approved_at timestamptz
);

create table if not exists crm_shift_bonus_tracker (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  period_start date not null,
  high_shift_count_500 integer not null default 0,
  high_shift_count_750 integer not null default 0,
  qualifies_for_500_bonus boolean not null default false,
  qualifies_for_750_bonus boolean not null default false,
  last_updated timestamptz not null default now(),
  unique(chatter_id, period_start)
);

create table if not exists crm_pay_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','processing','finalized','paid')),
  created_by uuid not null references crm_chatters(id),
  finalized_at timestamptz,
  finalized_by uuid references crm_chatters(id),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists crm_pay_runs (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_gross integer not null default 0,
  total_net integer not null default 0,
  line_item_count integer not null default 0,
  created_by uuid not null references crm_chatters(id),
  created_at timestamptz not null default now(),
  notes text,
  pay_period_id uuid references crm_pay_periods(id),
  chatter_id uuid references crm_chatters(id),
  timezone text,
  hours_worked numeric(8,2),
  hourly_rate_cents integer,
  hourly_pay_cents integer,
  commission_cents integer,
  bonus_cents integer,
  gross_pay_cents integer,
  tax_withholding_cents integer,
  deductions_cents integer,
  net_pay_cents integer,
  calculated_at timestamptz,
  payment_ref text,
  payment_method text check (payment_method in ('stripe','bank_transfer','manual')),
  approved_by uuid references crm_chatters(id),
  approved_at timestamptz,
  paid_at timestamptz,
  status text not null default 'draft' check (status in ('cancelled','draft','approved','payment_initiated','payment_failed','paid','void'))
);

create table if not exists crm_pay_run_lines (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references crm_pay_runs(id) on delete cascade,
  category text not null check (category in ('hourly','commission','bonus','tax','deduction','adjustment')),
  description text not null,
  source_table text,
  source_id text,
  amount_cents integer not null,
  metadata text
);

create table if not exists crm_pay_rates (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  type text not null check (type in ('hourly','commission_pct','overtime_multiplier')),
  value_cents integer not null,
  effective_from date not null,
  effective_to date,
  created_by uuid not null references crm_chatters(id)
);

create table if not exists crm_deduction_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('tax','insurance','garnishment','other')),
  calculation_method text not null check (calculation_method in ('flat_cents','percentage')),
  value numeric not null,
  applies_to text not null check (applies_to in ('all','employees','contractors')),
  effective_from date not null,
  effective_to date,
  priority integer not null,
  is_active boolean not null default true
);

create table if not exists crm_chatter_deductions (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  deduction_rule_id uuid references crm_deduction_rules(id),
  name text not null,
  calculation_method text not null check (calculation_method in ('flat_cents','percentage')),
  value numeric not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true
);

create table if not exists crm_pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references crm_pay_runs(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('retroactive_rate','overpayment','bonus_revoked','correction','other')),
  amount_cents integer not null,
  reason text not null,
  applied_to_pay_period_id uuid references crm_pay_periods(id),
  created_by uuid not null references crm_chatters(id),
  approved_by uuid references crm_chatters(id),
  status text not null check (status in ('pending','approved','applied','rejected'))
);

create table if not exists crm_payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_id uuid not null references crm_chatters(id),
  before text,
  after text,
  ip text
);

create table if not exists crm_pay_run_items (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references crm_pay_runs(id) on delete cascade,
  chatter_id uuid not null references crm_chatters(id),
  chatter_name text not null,
  hours_worked numeric(8,2) not null,
  base_pay_rate integer not null,
  base_pay integer not null,
  bonus_record_ids uuid[] not null default '{}',
  bonus_total integer not null,
  commission_record_ids uuid[] not null default '{}',
  commission_total integer not null,
  deductions integer not null default 0,
  deduction_notes text,
  gross_pay integer not null,
  net_pay integer not null,
  breakdown jsonb,
  payment_method text,
  payment_address text,
  payment_status text not null default 'pending' check (payment_status in ('pending','processing','paid','failed')),
  payment_ref text,
  payment_date date,
  payment_notes text,
  paid_at timestamptz,
  notes text
);

create table if not exists crm_payment_preferences (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null unique references crm_chatters(id),
  preferred_method text not null,
  wallet_address text,
  wise_email text,
  bank_details text,
  updated_at timestamptz not null default now()
);

-- =========================
-- QUEUE / WARNINGS / COACHING / TRAINING / AUTOMATION
-- =========================

create table if not exists crm_message_queue (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references crm_creators(id),
  chatter_id uuid references crm_chatters(id),
  original_chatter_id uuid references crm_chatters(id),
  fan_username text not null,
  fan_display_name text,
  fan_segment text not null check (fan_segment in ('vip','whale','core','casual','new','unknown')),
  fan_spend_tier integer,
  message_preview text,
  message_type text not null check (message_type in ('dm','tip','ppv_unlock','subscription','renewal','custom_request','other')),
  priority text not null default 'normal' check (priority in ('critical','high','normal','low')),
  status text not null default 'pending' check (status in ('pending','in_progress','responded','escalated','reassigned','expired','spam')),
  received_at timestamptz not null,
  first_viewed_at timestamptz,
  responded_at timestamptz,
  wait_time_sec integer,
  handle_time_sec integer,
  escalated_at timestamptz,
  escalated_to uuid references crm_chatters(id),
  escalation_reason text,
  source text not null default 'manual' check (source in ('manual','api','import')),
  notes text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_queue_sla_config (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references crm_creators(id),
  vip_max_wait integer not null,
  whale_max_wait integer not null,
  core_max_wait integer not null,
  casual_max_wait integer not null,
  auto_escalate_enabled boolean not null default false,
  escalate_to_supervisor uuid references crm_chatters(id),
  escalation_chain_enabled boolean,
  escalate_to_admin uuid references crm_chatters(id),
  admin_escalate_after_sec integer,
  working_hours_enabled boolean not null default false,
  working_hours_start integer,
  working_hours_end integer,
  timezone text,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references crm_chatters(id)
);

create table if not exists crm_queue_routing_config (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references crm_creators(id),
  auto_routing_enabled boolean not null default false,
  vip_assignment_strategy text not null check (vip_assignment_strategy in ('top_performer','round_robin','specific_chatters')),
  vip_specific_chatter_ids uuid[] default '{}',
  whale_priority_boost_enabled boolean not null default false,
  workload_balancing_threshold integer not null,
  round_robin_cursor integer,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references crm_chatters(id)
);

create table if not exists crm_queue_stats (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references crm_creators(id),
  chatter_id uuid references crm_chatters(id),
  timestamp timestamptz not null,
  period text not null check (period in ('hourly','daily','weekly')),
  total_pending integer not null default 0,
  total_responded integer not null default 0,
  avg_wait_time_sec integer not null default 0,
  max_wait_time_sec integer not null default 0,
  sla_breaches integer not null default 0,
  escalations integer not null default 0,
  vip_pending integer not null default 0,
  whale_pending integer not null default 0,
  core_pending integer not null default 0
);

create table if not exists crm_reply_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  text text not null,
  category text,
  keywords text not null,
  chatter_id uuid references crm_chatters(id),
  creator_id uuid references crm_creators(id),
  is_active boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid not null references crm_chatters(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_alert_config (
  id uuid primary key default gen_random_uuid(),
  response_time_warning integer not null,
  response_time_critical integer not null,
  vip_queue_threshold integer not null,
  vip_queue_minutes integer not null,
  queue_overload_threshold integer not null,
  enable_response_time boolean not null default true,
  enable_vip_queue boolean not null default true,
  enable_queue_overload boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references crm_chatters(id)
);

create table if not exists crm_warnings (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  issued_at timestamptz not null,
  issued_by text,
  reason_code text not null check (reason_code in ('LATE_CLOCK_IN','MISSED_REPORT','LOW_QUALITY_SCORE','UNSCHEDULED_ABSENCE','POLICY_VIOLATION','MANUAL_ADMIN')),
  severity text not null check (severity in ('low','medium','high')),
  points integer not null,
  description text,
  evidence jsonb,
  appeal_status text not null check (appeal_status in ('none','pending','approved','rejected')),
  resolved boolean not null default false,
  internal_notes text,
  tags text[] not null default '{}'
);

create table if not exists crm_warning_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null unique,
  reason_code text not null check (reason_code in ('LATE_CLOCK_IN','MISSED_REPORT','LOW_QUALITY_SCORE','UNSCHEDULED_ABSENCE','POLICY_VIOLATION','MANUAL_ADMIN')),
  name text not null,
  description text not null,
  trigger_condition jsonb not null,
  severity text not null check (severity in ('low','medium','high')),
  points integer not null,
  escalate_on_count integer,
  escalate_on_days integer,
  escalation_action text not null check (escalation_action in ('suspend','deactivate','manager_review','none')),
  escalation_suspension_days integer,
  enabled boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  tags text[] not null default '{}'
);

create table if not exists crm_warning_appeals (
  id uuid primary key default gen_random_uuid(),
  warning_id uuid not null references crm_warnings(id) on delete cascade,
  chatter_id uuid not null references crm_chatters(id),
  appeal_reason text not null,
  appeal_evidence text,
  appealed_at timestamptz not null,
  reviewed_by text,
  reviewed_at timestamptz,
  decision text not null check (decision in ('pending','approved','rejected')),
  decision_reason text,
  if_approved_action text check (if_approved_action in ('remove_warning','reduce_points','other')),
  action_taken text
);

create table if not exists crm_chatter_warnings_summary (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null unique references crm_chatters(id),
  total_warnings integer not null default 0,
  total_points integer not null default 0,
  active_warnings integer not null default 0,
  active_points integer not null default 0,
  warnings_7d integer not null default 0,
  points_7d integer not null default 0,
  warnings_30d integer not null default 0,
  points_30d integer not null default 0,
  warnings_90d integer not null default 0,
  points_90d integer not null default 0,
  current_status text not null check (current_status in ('normal','warned','suspended','deactivated')),
  suspension_until timestamptz,
  suspension_reason text,
  last_warning_id uuid references crm_warnings(id),
  last_warning_at timestamptz,
  last_warning_reason text,
  pending_appeals integer not null default 0,
  last_updated timestamptz not null default now(),
  next_decay_at timestamptz
);

create table if not exists crm_coaching_meetings (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references crm_chatters(id),
  chatter_id uuid not null references crm_chatters(id),
  meeting_date timestamptz not null,
  meeting_type text not null check (meeting_type in ('one_on_one','performance_review','pip_checkin','onboarding','exit_interview')),
  duration integer,
  location text,
  agenda text,
  notes text not null,
  private_notes text,
  action_items jsonb not null default '[]',
  follow_up_date timestamptz,
  follow_up_notes text,
  follow_up_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_coaching_goals (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  created_by uuid not null references crm_chatters(id),
  title text not null,
  description text,
  metric text,
  target_value numeric,
  current_value numeric,
  start_value numeric,
  unit text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('active','achieved','missed','cancelled')),
  achieved_at timestamptz,
  progress_percent integer,
  check_ins jsonb not null default '[]',
  visibility text not null check (visibility in ('private','shared','team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_coaching_feedback (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  given_by uuid not null references crm_chatters(id),
  type text not null check (type in ('praise','constructive','observation','warning')),
  title text,
  content text not null,
  category text,
  related_creator_id uuid references crm_creators(id),
  related_meeting_id uuid references crm_coaching_meetings(id),
  visibility text not null check (visibility in ('private','shared','team')),
  acknowledged boolean,
  acknowledged_at timestamptz,
  chatter_response text,
  feedback_date timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_coaching_pips (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  supervisor_id uuid not null references crm_chatters(id),
  title text not null,
  reason text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null check (status in ('draft','active','completed','extended','failed','cancelled')),
  requirements jsonb not null default '[]',
  milestones jsonb not null default '[]',
  check_ins jsonb not null default '[]',
  support_provided text,
  outcome text,
  completed_at timestamptz,
  visibility text not null check (visibility in ('confidential','shared')),
  chatter_acknowledged boolean not null default false,
  chatter_acknowledged_at timestamptz,
  chatter_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_training_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null check (type in ('document','video','course','quiz','template','link')),
  url text,
  content text,
  estimated_minutes integer,
  category text not null check (category in ('onboarding','sales_techniques','fan_engagement','ppv_strategies','time_management','platform_rules','creator_specific','other')),
  tags text[],
  required_for text[],
  related_creator_id uuid references crm_creators(id),
  is_active boolean not null default true,
  created_by uuid not null references crm_chatters(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_training_assignments (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references crm_chatters(id),
  material_id uuid not null references crm_training_materials(id),
  assigned_by uuid not null references crm_chatters(id),
  due_date timestamptz,
  priority text not null check (priority in ('required','recommended','optional')),
  reason text,
  status text not null check (status in ('assigned','in_progress','completed','overdue')),
  started_at timestamptz,
  completed_at timestamptz,
  score numeric,
  passed boolean,
  attempts integer,
  chatter_notes text,
  assigned_at timestamptz not null default now()
);

create table if not exists crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('escalation','reassignment','smart_routing')),
  name text not null,
  enabled boolean not null default true,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references crm_chatters(id)
);

create table if not exists crm_automation_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references crm_automation_rules(id),
  rule_type text not null,
  rule_name text not null,
  triggered_at timestamptz not null,
  message_id text,
  chatter_id uuid references crm_chatters(id),
  chatter_name text,
  from_creator_id uuid references crm_creators(id),
  from_creator_name text,
  to_creator_id uuid references crm_creators(id),
  to_creator_name text,
  action text not null,
  reason text not null,
  metadata jsonb
);

-- =========================
-- OM LEGACY / IMPORTS
-- =========================

create table if not exists crm_om_transactions (
  id uuid primary key default gen_random_uuid(),
  om_transaction_id text not null unique,
  creator_id uuid not null references crm_creators(id),
  platform_account_id text not null,
  amount numeric(12,2) not null,
  fan_id text not null,
  type text not null,
  status text not null,
  timestamp timestamptz not null,
  revenue_category text not null check (revenue_category in ('subscription','message','tip','other')),
  synced_at timestamptz not null default now()
);

create table if not exists crm_om_chargebacks (
  id uuid primary key default gen_random_uuid(),
  om_chargeback_id text not null unique,
  creator_id uuid not null references crm_creators(id),
  platform_account_id text not null,
  amount numeric(12,2) not null,
  fan_id text not null,
  type text not null,
  status text not null,
  chargeback_timestamp timestamptz not null,
  transaction_timestamp timestamptz not null,
  synced_at timestamptz not null default now()
);

create table if not exists crm_om_daily_aggregates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  creator_id uuid not null references crm_creators(id),
  total_revenue numeric(12,2) not null default 0,
  subscription_revenue numeric(12,2) not null default 0,
  message_revenue numeric(12,2) not null default 0,
  tip_revenue numeric(12,2) not null default 0,
  other_revenue numeric(12,2) not null default 0,
  chargeback_amount numeric(12,2) not null default 0,
  chargeback_count integer not null default 0,
  net_revenue numeric(12,2) not null default 0,
  transaction_count integer not null default 0,
  unique_fan_count integer not null default 0,
  new_fan_count integer not null default 0,
  avg_transaction_value numeric(12,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique(creator_id, date)
);

create table if not exists crm_om_sync_state (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references crm_creators(id),
  platform_account_id text not null,
  last_transaction_sync_at timestamptz,
  last_transaction_timestamp text,
  transaction_sync_status text not null check (transaction_sync_status in ('idle','syncing','error')),
  transaction_sync_error text,
  total_transactions_synced integer not null default 0,
  last_chargeback_sync_at timestamptz,
  last_chargeback_timestamp text,
  chargeback_sync_status text not null check (chargeback_sync_status in ('idle','syncing','error')),
  backfill_complete boolean not null default false,
  backfill_start_date text
);

create table if not exists crm_om_imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid not null references crm_chatters(id),
  imported_at timestamptz not null default now(),
  filename text not null,
  file_type text check (file_type in ('transactions','dashboard')),
  status text check (status in ('processing','success','error')),
  error_message text,
  data jsonb,
  record_count integer not null default 0
);

create table if not exists crm_om_chatter_metrics (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references crm_om_imports(id),
  date date not null,
  period_end date,
  chatter_om_name text not null,
  chatter_id uuid references crm_chatters(id),
  creator_id uuid references crm_creators(id),
  total_sales numeric(12,2),
  ppv_sales numeric(12,2),
  tip_sales numeric(12,2),
  impact_pct numeric(8,4),
  messages_sent integer,
  avg_response_time integer,
  manually_typed integer,
  ai_replies integer,
  templates_sent integer,
  ppv_sent integer,
  ppv_sold integer,
  ppv_open_rate numeric(8,4),
  ppv_avg_price numeric(12,2),
  imported_at timestamptz not null default now()
);

-- =========================
-- INDEXES
-- =========================

create index if not exists idx_chatters_supabase_auth_id on crm_chatters(supabase_auth_id);
create index if not exists idx_chatters_username on crm_chatters(username);
create index if not exists idx_chatters_role on crm_chatters(role);
create index if not exists idx_chatters_status on crm_chatters(status);
create index if not exists idx_chatters_email on crm_chatters(email);

create index if not exists idx_sessions_token on crm_sessions(token);
create index if not exists idx_sessions_chatter on crm_sessions(chatter_id);

create index if not exists idx_invite_tokens_token on crm_invite_tokens(token);
create index if not exists idx_invite_tokens_status on crm_invite_tokens(status);

create index if not exists idx_creators_status on crm_creators(status);
create index if not exists idx_creators_name on crm_creators(name);

create index if not exists idx_uca_user on crm_user_creator_access(user_id);
create index if not exists idx_uca_creator on crm_user_creator_access(creator_id);

create index if not exists idx_of_accounts_account_id on crm_of_accounts(account_id);
create index if not exists idx_of_accounts_creator on crm_of_accounts(creator_id);
create index if not exists idx_of_accounts_status on crm_of_accounts(status);

create index if not exists idx_sync_state_account on crm_of_sync_state(account_id);

create index if not exists idx_of_tx_of_id on crm_of_transactions(of_transaction_id);
create index if not exists idx_of_tx_account_ts on crm_of_transactions(account_id, timestamp);
create index if not exists idx_of_tx_timestamp on crm_of_transactions(timestamp);
create index if not exists idx_of_tx_type on crm_of_transactions(type);

create index if not exists idx_of_earnings_date on crm_of_daily_earnings(date);
create index if not exists idx_of_earnings_account_date on crm_of_daily_earnings(account_id, date);

create index if not exists idx_credit_usage_called on crm_of_credit_usage(called_at);
create index if not exists idx_credit_usage_endpoint on crm_of_credit_usage(endpoint);

create index if not exists idx_webhook_events_type on crm_of_webhook_events(event_type);
create index if not exists idx_webhook_events_received on crm_of_webhook_events(received_at);

create index if not exists idx_fans_fan_id on crm_of_fans(fan_id);
create index if not exists idx_fans_account on crm_of_fans(account_id);
create index if not exists idx_fans_account_active on crm_of_fans(account_id, is_active);

create index if not exists idx_chat_stats_account on crm_of_chat_stats(account_id);
create index if not exists idx_chat_stats_unread on crm_of_chat_stats(account_id, has_unread);

create index if not exists idx_messages_message_id on crm_of_messages(message_id);
create index if not exists idx_messages_account_ts on crm_of_messages(account_id, timestamp);
create index if not exists idx_messages_chat_ts on crm_of_messages(chat_id, timestamp);

create index if not exists idx_tracking_links_account on crm_of_tracking_links(account_id);
create index if not exists idx_tracking_links_creator on crm_of_tracking_links(creator_id);
create index if not exists idx_tla_user on crm_tracking_link_assignments(user_id);
create index if not exists idx_tla_link on crm_tracking_link_assignments(tracking_link_id);
create index if not exists idx_tls_link_time on crm_tracking_link_snapshots(tracking_link_id, snapshot_at);
create index if not exists idx_tls_account_time on crm_tracking_link_snapshots(account_id, snapshot_at);

create index if not exists idx_ig_accounts_supabase on crm_ig_accounts(supabase_id);
create index if not exists idx_ig_accounts_creator on crm_ig_accounts(creator_id);
create index if not exists idx_ig_accounts_username on crm_ig_accounts(username);
create index if not exists idx_ig_snapshots_account_date on crm_ig_daily_snapshots(ig_account_id, date);
create index if not exists idx_ig_snapshots_date on crm_ig_daily_snapshots(date);
create index if not exists idx_ig_reels_supabase on crm_ig_reels(supabase_reel_id);
create index if not exists idx_ig_reels_account on crm_ig_reels(ig_account_id);
create index if not exists idx_ig_reels_account_views on crm_ig_reels(ig_account_id, views);
create index if not exists idx_ig_reels_account_posted on crm_ig_reels(ig_account_id, posted_at);
create index if not exists idx_reel_snapshots_reel_date on crm_ig_reel_daily_snapshots(supabase_reel_id, snapshot_date);
create index if not exists idx_reel_snapshots_date on crm_ig_reel_daily_snapshots(snapshot_date);
create index if not exists idx_ig_funnels_account_date on crm_ig_funnels(ig_account_id, date);
create index if not exists idx_ig_funnels_date on crm_ig_funnels(date);

create index if not exists idx_shifts_chatter on crm_shifts(chatter_id);
create index if not exists idx_shifts_date on crm_shifts(date);
create index if not exists idx_shifts_chatter_date on crm_shifts(chatter_id, date);
create index if not exists idx_shifts_active on crm_shifts(clock_out) where clock_out is null;

create index if not exists idx_schedules_date on crm_schedules(date);
create index if not exists idx_schedules_chatter on crm_schedules(chatter_id);
create index if not exists idx_schedules_chatter_date on crm_schedules(chatter_id, date);
create index if not exists idx_schedules_status on crm_schedules(status);

create index if not exists idx_sales_reports_chatter on crm_sales_reports(chatter_id);
create index if not exists idx_sales_reports_date on crm_sales_reports(date);
create index if not exists idx_sales_reports_chatter_date on crm_sales_reports(chatter_id, date);

create index if not exists idx_chatter_achievements_chatter on crm_chatter_achievements(chatter_id);

create index if not exists idx_bonus_records_chatter on crm_bonus_records(chatter_id);
create index if not exists idx_bonus_records_status on crm_bonus_records(status);
create index if not exists idx_bonus_records_type_period on crm_bonus_records(type, period_start);

create index if not exists idx_pay_runs_status on crm_pay_runs(status);
create index if not exists idx_pay_runs_period on crm_pay_runs(period_start);
create index if not exists idx_pay_runs_pay_period on crm_pay_runs(pay_period_id);
create index if not exists idx_pay_runs_chatter on crm_pay_runs(chatter_id);

create index if not exists idx_queue_status on crm_message_queue(status);
create index if not exists idx_queue_chatter on crm_message_queue(chatter_id, status);
create index if not exists idx_queue_creator on crm_message_queue(creator_id, status);
create index if not exists idx_queue_priority on crm_message_queue(priority, status);
create index if not exists idx_queue_received on crm_message_queue(received_at);

create index if not exists idx_automation_log_rule on crm_automation_log(rule_id);
create index if not exists idx_automation_log_time on crm_automation_log(triggered_at);

create index if not exists idx_om_tx_creator on crm_om_transactions(creator_id);
create index if not exists idx_om_tx_creator_ts on crm_om_transactions(creator_id, timestamp);
create index if not exists idx_om_chargebacks_creator_ts on crm_om_chargebacks(creator_id, chargeback_timestamp);
create index if not exists idx_om_aggregates_creator_date on crm_om_daily_aggregates(creator_id, date);
create index if not exists idx_om_metrics_import on crm_om_chatter_metrics(import_id);