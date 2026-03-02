-- 003_pg_cron.sql
-- Phase 1 scheduled jobs: OF sync + reconciliation + maintenance

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configure these in DB settings before running schedules:
--   app.settings.supabase_url
--   app.settings.service_role_jwt
-- Example:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_jwt = 'eyJ...';

CREATE OR REPLACE FUNCTION public.crm_schedule_edge_job(
  p_job_name TEXT,
  p_cron TEXT,
  p_function_name TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_jwt TEXT;
  v_sql TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_jwt := current_setting('app.settings.service_role_jwt', true);

  IF v_url IS NULL OR v_url = '' THEN
    RAISE EXCEPTION 'Missing app.settings.supabase_url';
  END IF;

  IF v_jwt IS NULL OR v_jwt = '' THEN
    RAISE EXCEPTION 'Missing app.settings.service_role_jwt';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = p_job_name;

  v_sql := format(
    $$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Authorization', 'Bearer %s',
        'Content-Type', 'application/json'
      ),
      body := %L::jsonb
    );
    $$,
    v_url || '/functions/v1/' || p_function_name,
    v_jwt,
    p_payload::text
  );

  PERFORM cron.schedule(p_job_name, p_cron, v_sql);
END;
$$;

-- Daily OF earnings sync (02:00 UTC)
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-earnings-daily',
  '0 2 * * *',
  'of-sync',
  jsonb_build_object('job', 'earnings', 'range', 'yesterday')
);

-- Transactions sync every hour
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-transactions-hourly',
  '0 * * * *',
  'of-sync',
  jsonb_build_object('job', 'transactions', 'range', 'hourly')
);

-- Chargebacks sync every 6h
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-chargebacks-6h',
  '0 */6 * * *',
  'of-sync',
  jsonb_build_object('job', 'chargebacks', 'range', '6h')
);

-- Reconciliation daily (04:00 UTC)
SELECT public.crm_schedule_edge_job(
  'crm-of-reconciliation-daily',
  '0 4 * * *',
  'of-sync',
  jsonb_build_object('job', 'reconciliation', 'range', 'yesterday')
);

-- Analytics materialization / warm cache (every 30 min)
SELECT public.crm_schedule_edge_job(
  'crm-analytics-refresh-30m',
  '*/30 * * * *',
  'analytics',
  jsonb_build_object('job', 'refresh_cache')
);

-- Invite token expiration (daily 03:00 UTC, SQL-native)
PERFORM cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'crm-expire-invite-tokens';

SELECT cron.schedule(
  'crm-expire-invite-tokens',
  '0 3 * * *',
  $$
  UPDATE public.crm_invite_tokens
  SET status = 'expired', expired_at = now()
  WHERE status = 'active' AND expires_at < now();
  $$
);

COMMIT;