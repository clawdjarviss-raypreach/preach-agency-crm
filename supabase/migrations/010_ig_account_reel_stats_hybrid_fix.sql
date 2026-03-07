-- 010_ig_account_reel_stats_hybrid_fix.sql
-- Fix undercounting in ig_account_reel_stats by combining:
-- 1) established reels (start+end snapshots => delta)
-- 2) new reels in-range (end snapshot only => full end value)
-- while excluding old reels with no start snapshot.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_ig_reel_daily_snapshots_reel_date
  ON public.crm_ig_reel_daily_snapshots (ig_reel_id, snapshot_date);

CREATE OR REPLACE FUNCTION public.ig_account_reel_stats(
  p_account_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  ig_account_id uuid,
  total_views bigint,
  total_likes bigint,
  total_comments bigint,
  total_shares bigint,
  video_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date := p_start_date;
  v_end_date date := p_end_date;
  v_end_snapshot_date date;
BEGIN
  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required';
  END IF;

  IF v_end_date < v_start_date THEN
    RAISE EXCEPTION 'p_end_date (%) must be >= p_start_date (%)', v_end_date, v_start_date;
  END IF;

  -- Snapshot rows represent end-of-day values, so for an inclusive date range
  -- [start_date, end_date], compare start_date against end_date + 1.
  v_end_snapshot_date := (v_end_date + INTERVAL '1 day')::date;

  RETURN QUERY
  WITH reel_rows AS (
    SELECT
      r.id AS reel_id,
      r.ig_account_id,
      (r.posted_at AT TIME ZONE 'UTC')::date AS posted_date,
      s0.views AS start_views,
      s0.likes AS start_likes,
      s0.comments AS start_comments,
      s0.shares AS start_shares,
      s1.views AS end_views,
      s1.likes AS end_likes,
      s1.comments AS end_comments,
      s1.shares AS end_shares
    FROM public.crm_ig_reels r
    LEFT JOIN public.crm_ig_reel_daily_snapshots s0
      ON s0.ig_reel_id = r.id
     AND s0.snapshot_date = v_start_date
    LEFT JOIN public.crm_ig_reel_daily_snapshots s1
      ON s1.ig_reel_id = r.id
     AND s1.snapshot_date = v_end_snapshot_date
    WHERE (p_account_id IS NULL OR r.ig_account_id = p_account_id)
      AND r.posted_at IS NOT NULL
  ), qualified AS (
    SELECT
      rr.ig_account_id,
      CASE
        -- Established reel: true delta
        WHEN rr.start_views IS NOT NULL AND rr.end_views IS NOT NULL
          THEN GREATEST(0, rr.end_views - rr.start_views)
        -- New in-range reel: no start snapshot, so count full end value
        WHEN rr.start_views IS NULL
          AND rr.end_views IS NOT NULL
          AND rr.posted_date >= v_start_date
          AND rr.posted_date <= v_end_date
          THEN GREATEST(0, rr.end_views)
        ELSE 0
      END::bigint AS gained_views,
      CASE
        WHEN rr.start_likes IS NOT NULL AND rr.end_likes IS NOT NULL
          THEN GREATEST(0, rr.end_likes - rr.start_likes)
        WHEN rr.start_likes IS NULL
          AND rr.end_likes IS NOT NULL
          AND rr.posted_date >= v_start_date
          AND rr.posted_date <= v_end_date
          THEN GREATEST(0, rr.end_likes)
        ELSE 0
      END::bigint AS gained_likes,
      CASE
        WHEN rr.start_comments IS NOT NULL AND rr.end_comments IS NOT NULL
          THEN GREATEST(0, rr.end_comments - rr.start_comments)
        WHEN rr.start_comments IS NULL
          AND rr.end_comments IS NOT NULL
          AND rr.posted_date >= v_start_date
          AND rr.posted_date <= v_end_date
          THEN GREATEST(0, rr.end_comments)
        ELSE 0
      END::bigint AS gained_comments,
      CASE
        WHEN rr.start_shares IS NOT NULL AND rr.end_shares IS NOT NULL
          THEN GREATEST(0, rr.end_shares - rr.start_shares)
        WHEN rr.start_shares IS NULL
          AND rr.end_shares IS NOT NULL
          AND rr.posted_date >= v_start_date
          AND rr.posted_date <= v_end_date
          THEN GREATEST(0, rr.end_shares)
        ELSE 0
      END::bigint AS gained_shares,
      CASE
        WHEN rr.end_views IS NOT NULL
         AND (
           rr.start_views IS NOT NULL
           OR (
             rr.start_views IS NULL
             AND rr.posted_date >= v_start_date
             AND rr.posted_date <= v_end_date
           )
         )
          THEN 1
        ELSE 0
      END AS counted_video
    FROM reel_rows rr
    WHERE rr.end_views IS NOT NULL
      AND (
        rr.start_views IS NOT NULL
        OR (rr.posted_date >= v_start_date AND rr.posted_date <= v_end_date)
      )
  )
  SELECT
    q.ig_account_id,
    SUM(q.gained_views)::bigint AS total_views,
    SUM(q.gained_likes)::bigint AS total_likes,
    SUM(q.gained_comments)::bigint AS total_comments,
    SUM(q.gained_shares)::bigint AS total_shares,
    SUM(q.counted_video)::integer AS video_count
  FROM qualified q
  GROUP BY q.ig_account_id;
END;
$$;

-- Backward-compatible overload for existing callers that pass only start/end.
CREATE OR REPLACE FUNCTION public.ig_account_reel_stats(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  ig_account_id uuid,
  total_views bigint,
  total_likes bigint,
  total_comments bigint,
  total_shares bigint,
  video_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.ig_account_reel_stats(
    p_account_id := NULL,
    p_start_date := p_start_date,
    p_end_date := p_end_date
  );
$$;

GRANT EXECUTE ON FUNCTION public.ig_account_reel_stats(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ig_account_reel_stats(date, date) TO authenticated, service_role;

COMMIT;
