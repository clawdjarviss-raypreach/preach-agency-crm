-- 007_of_sync_audit_fixes.sql
-- Safety migration for OF sync audit fixes:
-- - ensure required OF sync tables exist
-- - ensure required columns exist
-- - clear stale Convex creator assignments on chatters

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_of_fans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  fan_id text NOT NULL UNIQUE,
  username text NOT NULL,
  display_name text,
  total_spend numeric(12,2) DEFAULT 0,
  subscribed_at timestamptz,
  expired_at timestamptz,
  renews_at timestamptz,
  subscription_price numeric(10,2),
  is_subscribed boolean,
  is_active boolean NOT NULL DEFAULT true,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_of_forecast_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL UNIQUE,
  forecast_data jsonb,
  generated_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_of_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  endpoint text NOT NULL,
  last_sync_at timestamptz,
  cursor text,
  status text NOT NULL DEFAULT 'idle',
  error text,
  UNIQUE(account_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.crm_of_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  account_id text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS fan_id text;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS total_spend numeric(12,2) DEFAULT 0;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS subscribed_at timestamptz;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS expired_at timestamptz;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS renews_at timestamptz;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS subscription_price numeric(10,2);
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS is_subscribed boolean;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.crm_of_fans ADD COLUMN IF NOT EXISTS last_seen timestamptz;

ALTER TABLE public.crm_of_forecast_cache ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.crm_of_forecast_cache ADD COLUMN IF NOT EXISTS forecast_data jsonb;
ALTER TABLE public.crm_of_forecast_cache ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE public.crm_of_forecast_cache ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();

ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS cursor text;
ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS status text DEFAULT 'idle';
ALTER TABLE public.crm_of_sync_state ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE public.crm_of_webhook_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.crm_of_webhook_events ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE public.crm_of_webhook_events ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.crm_of_webhook_events ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now();
ALTER TABLE public.crm_of_webhook_events ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_of_fans_account ON public.crm_of_fans(account_id);
CREATE INDEX IF NOT EXISTS idx_of_fans_last_seen ON public.crm_of_fans(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_of_forecast_account ON public.crm_of_forecast_cache(account_id);
CREATE INDEX IF NOT EXISTS idx_of_sync_state_account_endpoint ON public.crm_of_sync_state(account_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_of_webhook_events_received ON public.crm_of_webhook_events(received_at DESC);

DO $$
BEGIN
  BEGIN
    EXECUTE $sql$
      UPDATE public.crm_chatters
      SET assigned_creators = '[]'::jsonb
      WHERE assigned_creators IS NOT NULL
        AND assigned_creators != '[]'::jsonb
    $sql$;
  EXCEPTION WHEN undefined_function OR datatype_mismatch OR cannot_coerce THEN
    EXECUTE $sql$
      UPDATE public.crm_chatters
      SET assigned_creators = ARRAY[]::text[]
      WHERE assigned_creators IS NOT NULL
        AND assigned_creators != ARRAY[]::text[]
    $sql$;
  END;
END
$$;

COMMIT;
