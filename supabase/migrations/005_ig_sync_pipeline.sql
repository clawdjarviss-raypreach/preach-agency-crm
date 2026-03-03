-- 005_ig_sync_pipeline.sql
-- IG sync pipeline state + cron schedule

BEGIN;

CREATE TABLE IF NOT EXISTS crm_ig_sync_state (
  source_table text PRIMARY KEY,
  cursor_value timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

DO $$
DECLARE
  v_url text;
  v_jwt text;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_jwt := current_setting('app.settings.service_role_jwt', true);

  IF v_url IS NOT NULL AND v_url <> '' AND v_jwt IS NOT NULL AND v_jwt <> '' THEN
    PERFORM public.crm_schedule_edge_job(
      'crm-ig-sync-6h',
      '0 */6 * * *',
      'ig-sync',
      jsonb_build_object('job', 'sync', 'mode', 'incremental')
    );
  ELSE
    RAISE NOTICE 'Skipping crm-ig-sync-6h schedule (missing app.settings.supabase_url/service_role_jwt).';
  END IF;
END;
$$;

COMMIT;
