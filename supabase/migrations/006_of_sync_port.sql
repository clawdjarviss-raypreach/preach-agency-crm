-- 006_of_sync_port.sql
-- Complete OF sync parity additions for Supabase Edge Functions

BEGIN;

-- Chats table for full /api/{account}/chats sync persistence.
CREATE TABLE IF NOT EXISTS public.crm_of_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  chat_id text NOT NULL,
  fan_id text,
  fan_username text,
  fan_display_name text,
  last_message_at timestamptz,
  has_unread boolean NOT NULL DEFAULT false,
  metadata jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_of_chats_account ON public.crm_of_chats(account_id);
CREATE INDEX IF NOT EXISTS idx_of_chats_last_message ON public.crm_of_chats(last_message_at DESC);

-- Daily tracking-link analytics snapshots keyed by account+link+day.
CREATE TABLE IF NOT EXISTS public.crm_of_tracking_link_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  link_id text NOT NULL,
  snapshot_date date NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  subscribers integer NOT NULL DEFAULT 0,
  conversion_rate numeric(8,6) NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  analytics_payload jsonb,
  UNIQUE(account_id, link_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_of_tracking_snapshots_account_date ON public.crm_of_tracking_link_snapshots(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_of_tracking_snapshots_link_date ON public.crm_of_tracking_link_snapshots(link_id, snapshot_date DESC);

-- Ensure OF cron cadence parity (idempotent; safely skips if db settings are missing).
DO $$
BEGIN
  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-of-sync-fans',
      '0 0 * * *',
      'of-sync',
      jsonb_build_object('job', 'fans', 'range', '24h')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-of-sync-fans schedule: %', SQLERRM;
  END;

  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-of-sync-chats',
      '0 * * * *',
      'of-sync',
      jsonb_build_object('job', 'chats', 'range', 'hourly')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-of-sync-chats schedule: %', SQLERRM;
  END;

  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-of-sync-tracking-links',
      '0 */3 * * *',
      'of-sync',
      jsonb_build_object('job', 'tracking_links', 'range', '3h')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-of-sync-tracking-links schedule: %', SQLERRM;
  END;

  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-of-daily-reconciliation',
      '0 4 * * *',
      'of-sync',
      jsonb_build_object('job', 'reconciliation', 'range', 'yesterday')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-of-daily-reconciliation schedule: %', SQLERRM;
  END;

  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-of-sync-forecast',
      '0 */6 * * *',
      'of-sync',
      jsonb_build_object('job', 'forecast', 'range', '6h')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-of-sync-forecast schedule: %', SQLERRM;
  END;
END
$$;

COMMIT;
