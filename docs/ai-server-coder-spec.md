# AI Server + Pipeline Alignment — Coder Spec

## Overview
Align Preach CRM's Traffic Analytics with Tom's proven architecture. This adds:
1. New DB tables: `patterns`, `ai_jobs`, `ai_costs`
2. Updated Traffic Analytics page: pattern library, virality_ratio display, "Reproduce" button, better reel cards
3. `trigger-analysis` Edge Function (separate from scraping)
4. AI Server skeleton (Express + Claude Agent SDK)

Reference files (Coder MUST read):
- `docs/tom-winning-patterns-export.md` — Tom's complete schema, types, API, components
- `docs/tom-ai-server-pipeline.md` — Tom's AI server, pipeline, Edge Functions, architecture
- `docs/reel-analysis-skill.md` — Reel analysis JSON output format

## Working Directory
/Users/jarvis/.openclaw/workspace/projects/preach-crm

---

## Part 1: Database Migration

Create `supabase/migrations/009_ai_pipeline.sql`

### Table: `patterns` (Global Pattern Library)
```sql
CREATE TABLE IF NOT EXISTS public.patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'proven',  -- 'proven' | 'exploration' | 'retired'
  avg_views INTEGER DEFAULT 0,
  total_reels INTEGER DEFAULT 0,
  total_own_reels INTEGER DEFAULT 0,
  avg_own_views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patterns_read" ON public.patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "patterns_admin_write" ON public.patterns FOR ALL TO authenticated
  USING (public.crm_current_role() = 'admin') WITH CHECK (public.crm_current_role() = 'admin');
CREATE POLICY "patterns_service_write" ON public.patterns FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `ai_jobs` (Job Queue)
```sql
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,              -- 'analyze-reel'
  source TEXT NOT NULL,            -- 'watchlist_reels' | 'own_reels' (for us: 'competitor_reels' | 'ig_reels')
  source_id UUID NOT NULL,         -- ID of the reel being analyzed
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'completed' | 'failed'
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

CREATE INDEX idx_ai_jobs_status ON public.ai_jobs(status);
CREATE INDEX idx_ai_jobs_source ON public.ai_jobs(source, source_id);

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_jobs_read" ON public.ai_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_jobs_service_write" ON public.ai_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Table: `ai_costs` (Cost Tracking)
```sql
CREATE TABLE IF NOT EXISTS public.ai_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  reel_id TEXT DEFAULT '',
  service TEXT NOT NULL,           -- 'rapidapi' | 'anthropic'
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
CREATE POLICY "ai_costs_read" ON public.ai_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_costs_service_write" ON public.ai_costs FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Add columns to `crm_competitor_reels`
```sql
ALTER TABLE public.crm_competitor_reels
  ADD COLUMN IF NOT EXISTS virality_ratio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matched_pattern_id UUID REFERENCES public.patterns(id),
  ADD COLUMN IF NOT EXISTS pattern_type TEXT DEFAULT 'unprocessed';
```

### Add columns to `crm_ig_reels` (own reels)
```sql
ALTER TABLE public.crm_ig_reels
  ADD COLUMN IF NOT EXISTS performance_ratio NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_avg_views NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matched_pattern_id UUID REFERENCES public.patterns(id);
```

---

## Part 2: Frontend Updates to Traffic Analytics Page

Modify `app/(crm)/traffic-analytics/page.tsx`:

### 2a. Winning Patterns Tab — Match Tom's design
- Show **performance_ratio** (views / account avg) as a multiplier badge (e.g., "3.2x")
- Color code: >3x green, >2x amber, <2x red
- Show **WINNER** badge for `is_winner = true` reels
- Show **analysis_status** badge: "Analyzed ✅" | "Awaiting Analysis ⏳" | "Analyzing 🔄"
- Add **"Reproduce"** button on analyzed reels (placeholder — logs to console for now)
- Sort by performance_ratio descending (not raw views)

### 2b. Competitor Analysis Tab — Match Tom's design  
- Show **virality_ratio** as multiplier badge with color coding
- Show **OUTLIER** badge for `is_outlier = true`
- Show analysis_status badge
- Add "Reproduce" button on analyzed reels
- Sort by virality_ratio descending

### 2c. New: Pattern Library section
Add a collapsible "Pattern Library" section at top of Winning Patterns tab:
- Shows all patterns from `patterns` table
- Each pattern card: name, status badge (SCALE/OPTIMIZE/TEST/PIVOT), avg_views, total_reels
- Pattern status logic (from Tom):
  - `TEST`: reelCount < 3
  - `SCALE`: avgViews > globalAvg AND winnerCount >= 1
  - `PIVOT`: winnerCount === 0 AND avgViews < globalAvg
  - `OPTIMIZE`: everything else
- Clicking a pattern filters the reels below to only show reels matched to that pattern

### 2d. Reel Card improvements
Update the reel card component to match Tom's `IdeaCard`:
- Left side: 9:16 video with play button overlay (click to play, not hover)
- Right side: structured analysis fields (Hook, Retention, Pattern, Triggers, Props, Performance)
- Footer: difficulty dots (1-5) + Reproduce button
- This is a horizontal card layout, NOT the thumbnail grid

For reels WITHOUT analysis (analysis_status != 'done'), show the simpler thumbnail card (current design).
For reels WITH analysis, show the full horizontal IdeaCard layout.

---

## Part 3: AI Server Skeleton

Create directory: `ai-server/` at project root

### `ai-server/package.json`
```json
{
  "name": "preach-ai-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "latest",
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.49.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.0",
    "typescript": "^5.0.0"
  }
}
```

### `ai-server/src/server.ts`
Express server with:
- `POST /api/jobs` — receive job from Edge Function, add to queue, process
- `GET /health` — health check
- `GET /api/status` — running/queued job count
- `GET /api/restart?secret=...` — remote restart
- Max 3 concurrent Claude Agent instances
- Job queue with FIFO processing
- On job completion: write structured analysis fields back to Supabase reel row + update ai_jobs status

### `ai-server/src/analyzer.ts`
The reel analysis handler:
1. Receive job params (videoUrl, metrics, reelId, source table)
2. Build prompt from `docs/reel-analysis-skill.md` format
3. Call `query()` from Claude Agent SDK:
   ```typescript
   import { query } from '@anthropic-ai/claude-agent-sdk'
   const result = query({
     prompt: analysisPrompt,
     options: {
       model: 'opus',
       permissionMode: 'bypassPermissions',
       allowDangerouslySkipPermissions: true,
       pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
       cwd: process.cwd(),
       systemPrompt: { type: 'preset', preset: 'claude_code' },
       maxTurns: 80,
     }
   })
   ```
4. Parse the JSON output from Claude
5. Write results back to the reel row in Supabase
6. Update ai_jobs status to 'completed'

### `ai-server/src/supabase.ts`
Supabase client initialized with service role key from env vars.

### `ai-server/.env.example`
```
SUPABASE_URL=https://hufcbxodgxinbvpqfaaw.supabase.co
SUPABASE_KEY=<service-role-key>
RESTART_SECRET=<random-secret>
PORT=3456
```

---

## Part 4: `trigger-analysis` Edge Function

Create `supabase/functions/trigger-analysis/index.ts`

### Logic:
```
1. Find unprocessed outlier competitor reels:
   SELECT * FROM crm_competitor_reels
   WHERE is_outlier = true
   AND (analysis_status = 'pending' OR analysis_status IS NULL)
   AND video_url IS NOT NULL AND video_url != ''
   ORDER BY play_count DESC
   LIMIT 5

2. Find unprocessed winner own reels:
   SELECT * FROM crm_ig_reels
   WHERE is_winner = true
   AND (analysis_status = 'pending' OR analysis_status IS NULL)
   AND video_url IS NOT NULL AND video_url != ''
   ORDER BY views DESC
   LIMIT 5

3. For each reel:
   a. Insert ai_jobs row (type: 'analyze-reel', source, source_id, params with metrics)
   b. Update reel analysis_status to 'queued'
   c. POST to AI Server: { jobId, type, params }

4. AI Server URL from env: AI_SERVER_URL (e.g., https://ai.preach.agency/api/jobs)
```

### Cron schedule:
```sql
-- Run 30 minutes after scraping
SELECT cron.schedule('crm-trigger-analysis', '30 2 * * *', ...);
```

---

## Files to Create:
1. `supabase/migrations/009_ai_pipeline.sql`
2. `ai-server/package.json`
3. `ai-server/src/server.ts`
4. `ai-server/src/analyzer.ts`
5. `ai-server/src/supabase.ts`
6. `ai-server/.env.example`
7. `ai-server/tsconfig.json`
8. `supabase/functions/trigger-analysis/index.ts`

## Files to Modify:
1. `app/(crm)/traffic-analytics/page.tsx` — pattern library, reel cards, reproduce button, thresholds

## Reference (read-only):
1. `docs/tom-winning-patterns-export.md` — Tom's complete system
2. `docs/tom-ai-server-pipeline.md` — Tom's AI server architecture
3. `docs/reel-analysis-skill.md` — analysis output format
4. `docs/rapidapi-ig-config.md` — RapidAPI endpoints

## Verification:
1. `npm run build` must pass clean
2. Migration SQL is valid PostgreSQL
3. AI Server builds: `cd ai-server && npm install && npx tsc --noEmit`
4. Edge Function is syntactically correct
5. Pattern library section renders on Winning Patterns tab
6. Reel cards show virality_ratio/performance_ratio badges
