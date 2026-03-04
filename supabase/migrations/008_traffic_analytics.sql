-- 008_traffic_analytics.sql
-- Traffic Analytics schema + RLS + indexes + competitor sync cron

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_content_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_content_formats (name, description, icon)
VALUES
  ('Omegle', 'Omegle-style reaction/interaction content', '🎥'),
  ('Mechanic', 'Mechanic/workshop themed content', '🔧'),
  ('Talking', 'Talking/conversation style content', '🗣️'),
  ('Generic', 'General branding and lifestyle content', '✨')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_competitor_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.crm_creators(id) ON DELETE CASCADE,
  format_id uuid NOT NULL REFERENCES public.crm_content_formats(id) ON DELETE CASCADE,
  ig_username text NOT NULL,
  ig_user_id text,
  follower_count integer,
  profile_pic_url text,
  bio text,
  avg_views numeric,
  last_synced_at timestamptz,
  created_by uuid REFERENCES public.crm_chatters(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, format_id, ig_username)
);

CREATE TABLE IF NOT EXISTS public.crm_competitor_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.crm_competitor_watchlists(id) ON DELETE CASCADE,
  ig_media_code text NOT NULL,
  ig_media_id text,
  play_count integer,
  like_count integer,
  comment_count integer,
  caption text,
  thumbnail_url text,
  video_url text,
  is_outlier boolean NOT NULL DEFAULT false,
  outlier_multiplier numeric,
  posted_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, ig_media_code)
);

CREATE TABLE IF NOT EXISTS public.crm_reel_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  own_reel_id uuid REFERENCES public.crm_ig_reels(id) ON DELETE CASCADE,
  competitor_reel_id uuid REFERENCES public.crm_competitor_reels(id) ON DELETE CASCADE,
  hook text,
  retention text,
  pattern_name text,
  pattern_formula text,
  triggers jsonb,
  props jsonb,
  difficulty integer,
  difficulty_note text,
  performance_analysis text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  model_used text NOT NULL DEFAULT 'opus',
  CONSTRAINT crm_reel_analyses_one_reel_ref CHECK (
    (own_reel_id IS NOT NULL AND competitor_reel_id IS NULL)
    OR (own_reel_id IS NULL AND competitor_reel_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comp_watchlists_creator ON public.crm_competitor_watchlists(creator_id);
CREATE INDEX IF NOT EXISTS idx_comp_watchlists_format ON public.crm_competitor_watchlists(format_id);
CREATE INDEX IF NOT EXISTS idx_comp_reels_watchlist ON public.crm_competitor_reels(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_comp_reels_outlier ON public.crm_competitor_reels(is_outlier) WHERE is_outlier = true;
CREATE INDEX IF NOT EXISTS idx_reel_analyses_own ON public.crm_reel_analyses(own_reel_id) WHERE own_reel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reel_analyses_comp ON public.crm_reel_analyses(competitor_reel_id) WHERE competitor_reel_id IS NOT NULL;

ALTER TABLE public.crm_content_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_competitor_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_competitor_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_reel_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_content_formats' AND policyname = 'formats_read'
  ) THEN
    CREATE POLICY "formats_read"
      ON public.crm_content_formats
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_watchlists' AND policyname = 'watchlists_read'
  ) THEN
    CREATE POLICY "watchlists_read"
      ON public.crm_competitor_watchlists
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_watchlists' AND policyname = 'watchlists_admin_write'
  ) THEN
    CREATE POLICY "watchlists_admin_write"
      ON public.crm_competitor_watchlists
      FOR ALL
      TO authenticated
      USING (public.crm_current_role() = 'admin')
      WITH CHECK (public.crm_current_role() = 'admin');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_reels' AND policyname = 'comp_reels_read'
  ) THEN
    CREATE POLICY "comp_reels_read"
      ON public.crm_competitor_reels
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_competitor_reels' AND policyname = 'comp_reels_service_write'
  ) THEN
    CREATE POLICY "comp_reels_service_write"
      ON public.crm_competitor_reels
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
    WHERE schemaname = 'public' AND tablename = 'crm_reel_analyses' AND policyname = 'analyses_read'
  ) THEN
    CREATE POLICY "analyses_read"
      ON public.crm_reel_analyses
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_reel_analyses' AND policyname = 'analyses_service_write'
  ) THEN
    CREATE POLICY "analyses_service_write"
      ON public.crm_reel_analyses
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.crm_schedule_edge_job(
      'crm-competitor-sync-daily',
      '0 2 * * *',
      'competitor-sync',
      '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping crm-competitor-sync-daily schedule: %', SQLERRM;
  END;
END
$$;

COMMIT;
