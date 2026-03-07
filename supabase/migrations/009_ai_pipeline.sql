-- 009_ai_pipeline.sql
-- AI Pipeline: patterns, ai_jobs, ai_costs + reel alignment columns

BEGIN;

CREATE TABLE IF NOT EXISTS public.patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'proven',
  avg_views INTEGER DEFAULT 0,
  total_reels INTEGER DEFAULT 0,
  total_own_reels INTEGER DEFAULT 0,
  avg_own_views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patterns' AND policyname = 'patterns_read'
  ) THEN
    CREATE POLICY "patterns_read"
      ON public.patterns
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patterns' AND policyname = 'patterns_admin_write'
  ) THEN
    CREATE POLICY "patterns_admin_write"
      ON public.patterns
      FOR ALL
      TO authenticated
      USING (public.crm_current_role() = 'admin')
      WITH CHECK (public.crm_current_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patterns' AND policyname = 'patterns_service_write'
  ) THEN
    CREATE POLICY "patterns_service_write"
      ON public.patterns
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id UUID NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  progress TEXT DEFAULT '',
  result JSONB,
  error TEXT,
  turns INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON public.ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_source ON public.ai_jobs(source, source_id);

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_jobs' AND policyname = 'ai_jobs_read'
  ) THEN
    CREATE POLICY "ai_jobs_read"
      ON public.ai_jobs
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_jobs' AND policyname = 'ai_jobs_service_write'
  ) THEN
    CREATE POLICY "ai_jobs_service_write"
      ON public.ai_jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.ai_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  reel_id TEXT DEFAULT '',
  service TEXT NOT NULL,
  model TEXT DEFAULT '',
  operation TEXT DEFAULT '',
  cost_cents NUMERIC NOT NULL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_costs' AND policyname = 'ai_costs_read'
  ) THEN
    CREATE POLICY "ai_costs_read"
      ON public.ai_costs
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_costs' AND policyname = 'ai_costs_service_write'
  ) THEN
    CREATE POLICY "ai_costs_service_write"
      ON public.ai_costs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

ALTER TABLE public.crm_competitor_reels
  ADD COLUMN IF NOT EXISTS virality_ratio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matched_pattern_id UUID REFERENCES public.patterns(id),
  ADD COLUMN IF NOT EXISTS pattern_type TEXT DEFAULT 'unprocessed';

ALTER TABLE public.crm_ig_reels
  ADD COLUMN IF NOT EXISTS performance_ratio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_avg_views NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matched_pattern_id UUID REFERENCES public.patterns(id);

COMMIT;
