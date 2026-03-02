-- 003_pg_cron.sql
-- Phase 1 scheduled jobs: CRM cron parity via pg_cron + Edge Functions

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
AS $body$
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
    $sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Authorization', %L,
        'Content-Type', 'application/json'
      ),
      body := %L::jsonb
    );
    $sql$,
    v_url || '/functions/v1/' || p_function_name,
    'Bearer ' || v_jwt,
    p_payload::text
  );

  PERFORM cron.schedule(p_job_name, p_cron, v_sql);
END;
$body$;

-- 01 evaluate-streaks
SELECT public.crm_schedule_edge_job(
  'crm-evaluate-streaks',
  '0 6 * * *',
  'analytics',
  jsonb_build_object('job', 'evaluate_streaks')
);

-- 02 reset-freezes
SELECT public.crm_schedule_edge_job(
  'crm-reset-freezes',
  '0 0 * * 1',
  'analytics',
  jsonb_build_object('job', 'reset_freezes')
);

-- 03 evaluate-achievements
SELECT public.crm_schedule_edge_job(
  'crm-evaluate-achievements',
  '0 2 * * *',
  'analytics',
  jsonb_build_object('job', 'evaluate_achievements')
);

-- 04 update-target-progress
SELECT public.crm_schedule_edge_job(
  'crm-update-target-progress',
  '0 6 * * *',
  'analytics',
  jsonb_build_object('job', 'update_target_progress')
);

-- 05 evaluate-weekly-bonuses
SELECT public.crm_schedule_edge_job(
  'crm-evaluate-weekly-bonuses',
  '0 0 * * 1',
  'payroll-rollup',
  jsonb_build_object('job', 'evaluate_weekly_bonuses')
);

-- 06 compute-sales-commission
SELECT public.crm_schedule_edge_job(
  'crm-compute-sales-commission',
  '5 6 * * *',
  'payroll-rollup',
  jsonb_build_object('job', 'compute_sales_commission')
);

-- 07 warnings-late-clock-in-check
SELECT public.crm_schedule_edge_job(
  'crm-warnings-late-clockin',
  '*/5 * * * *',
  'analytics',
  jsonb_build_object('job', 'warnings_late_clockin')
);

-- 08 warnings-missed-report-check
SELECT public.crm_schedule_edge_job(
  'crm-warnings-missed-report',
  '*/5 * * * *',
  'analytics',
  jsonb_build_object('job', 'warnings_missed_report')
);

-- 09 check-queue-sla
SELECT public.crm_schedule_edge_job(
  'crm-queue-sla-check',
  '*/2 * * * *',
  'queue-sla',
  jsonb_build_object('job', 'check_sla')
);

-- 10 snapshot-queue-stats
SELECT public.crm_schedule_edge_job(
  'crm-queue-snapshot-stats',
  '0 * * * *',
  'queue-sla',
  jsonb_build_object('job', 'snapshot_stats')
);

-- 11 of-daily-reconciliation
SELECT public.crm_schedule_edge_job(
  'crm-of-daily-reconciliation',
  '0 4 * * *',
  'of-sync',
  jsonb_build_object('job', 'reconciliation', 'range', 'yesterday')
);

-- 12 of-sync-fans
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-fans',
  '0 0 * * *',
  'of-sync',
  jsonb_build_object('job', 'fans', 'range', '24h')
);

-- 13 of-sync-chats
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-chats',
  '0 * * * *',
  'of-sync',
  jsonb_build_object('job', 'chats', 'range', 'hourly')
);

-- 14 of-sync-forecast
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-forecast',
  '0 */6 * * *',
  'of-sync',
  jsonb_build_object('job', 'forecast', 'range', '6h')
);

-- 15 of-sync-tracking-links
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-tracking-links',
  '0 */3 * * *',
  'of-sync',
  jsonb_build_object('job', 'tracking_links', 'range', '3h')
);

-- 16 of-sync-transactions-hourly
SELECT public.crm_schedule_edge_job(
  'crm-of-sync-transactions-hourly',
  '0 * * * *',
  'of-sync',
  jsonb_build_object('job', 'transactions', 'range', 'hourly')
);

-- 17 om-revenue-sync
SELECT public.crm_schedule_edge_job(
  'crm-om-revenue-sync',
  '*/30 * * * *',
  'analytics',
  jsonb_build_object('job', 'om_revenue_sync')
);

-- 18 om-aggregate-recompute
SELECT public.crm_schedule_edge_job(
  'crm-om-aggregate-recompute',
  '2,32 * * * *',
  'analytics',
  jsonb_build_object('job', 'om_aggregate_recompute')
);

-- SQL-only maintenance: expire invite tokens
SELECT cron.unschedule(jobid)
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
