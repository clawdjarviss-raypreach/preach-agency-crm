-- ============================================================
-- Migration 011: VPD Outlier Detection System
-- ============================================================

BEGIN;

-- 1. Competitor reel snapshots (time series for delta VPD)
CREATE TABLE IF NOT EXISTS public.crm_competitor_reel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_reel_id uuid NOT NULL REFERENCES public.crm_competitor_reels(id) ON DELETE CASCADE,
  views integer NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_reel_snapshots_reel_time
  ON public.crm_competitor_reel_snapshots (competitor_reel_id, scraped_at DESC);

-- 2. VPD columns on competitor reels
ALTER TABLE public.crm_competitor_reels
  ADD COLUMN IF NOT EXISTS lifetime_vpd numeric,
  ADD COLUMN IF NOT EXISTS delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS effective_vpd numeric,
  ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS projected_views numeric,
  ADD COLUMN IF NOT EXISTS age_days numeric;

-- 3. VPD columns on own reels
ALTER TABLE public.crm_ig_reels
  ADD COLUMN IF NOT EXISTS lifetime_vpd numeric,
  ADD COLUMN IF NOT EXISTS delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS effective_vpd numeric,
  ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS projected_views numeric,
  ADD COLUMN IF NOT EXISTS age_days numeric;

-- 4. Account-level VPD stats on competitor watchlists
ALTER TABLE public.crm_competitor_watchlists
  ADD COLUMN IF NOT EXISTS median_vpd numeric,
  ADD COLUMN IF NOT EXISTS median_delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS winner_threshold numeric,
  ADD COLUMN IF NOT EXISTS active_reel_count integer DEFAULT 0;

-- 5. Account-level VPD stats on own IG accounts
ALTER TABLE public.crm_ig_accounts
  ADD COLUMN IF NOT EXISTS median_vpd numeric,
  ADD COLUMN IF NOT EXISTS median_delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS winner_threshold numeric,
  ADD COLUMN IF NOT EXISTS active_reel_count integer DEFAULT 0;

-- 6. Own reel snapshots table for 6-hour intervals
CREATE TABLE IF NOT EXISTS public.crm_ig_reel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_reel_id uuid NOT NULL REFERENCES public.crm_ig_reels(id) ON DELETE CASCADE,
  views integer NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_reel_snapshots_reel_time
  ON public.crm_ig_reel_snapshots (ig_reel_id, scraped_at DESC);

-- 7. Cleanup cron: delete snapshots older than 30 days (weekly on Sunday 3AM)
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-reel-snapshots');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'cleanup-reel-snapshots',
      '0 3 * * 0',
      $cleanup$
        DELETE FROM public.crm_competitor_reel_snapshots WHERE scraped_at < NOW() - INTERVAL '30 days';
        DELETE FROM public.crm_ig_reel_snapshots WHERE scraped_at < NOW() - INTERVAL '30 days';
      $cleanup$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping cleanup-reel-snapshots schedule: %', SQLERRM;
  END;
END
$$;

-- 8. RLS policies for new tables
ALTER TABLE public.crm_competitor_reel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ig_reel_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_reel_snapshots' AND policyname = 'competitor_snapshots_read'
  ) THEN
    CREATE POLICY "competitor_snapshots_read"
      ON public.crm_competitor_reel_snapshots
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_reel_snapshots' AND policyname = 'competitor_snapshots_service_write'
  ) THEN
    CREATE POLICY "competitor_snapshots_service_write"
      ON public.crm_competitor_reel_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_ig_reel_snapshots' AND policyname = 'ig_snapshots_read'
  ) THEN
    CREATE POLICY "ig_snapshots_read"
      ON public.crm_ig_reel_snapshots
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_ig_reel_snapshots' AND policyname = 'ig_snapshots_service_write'
  ) THEN
    CREATE POLICY "ig_snapshots_service_write"
      ON public.crm_ig_reel_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

COMMIT;
