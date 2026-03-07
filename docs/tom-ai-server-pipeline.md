# Data Pipeline & AI Server — How It All Works

Complete explanation of how data flows from Instagram scraping → AI analysis → frontend display for the Content Ideas and Winning Patterns pages.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Supabase Edge   │     │    Supabase DB    │     │   AI Server     │
│  Functions       │────▶│   (Postgres)      │◀────│  (Mac Mini)     │
│  (Deno/TypeScript│     │                   │     │  Express + SDK  │
│   on Supabase)   │     └────────┬──────────┘     └─────────────────┘
└─────────────────┘              │                        ▲
       ▲                         │                        │
       │                         ▼                        │
  pg_cron              ┌─────────────────┐          HTTP POST
  (scheduled)          │  React Frontend  │         /api/jobs
                       │  (Cloudflare     │
                       │   Worker)        │
                       └─────────────────┘
```

### Components

| Component | What it does | Where it runs |
|-----------|-------------|---------------|
| **Supabase Edge Functions** | Scrape Instagram, trigger AI jobs, scheduled tasks | Supabase cloud (Deno runtime) |
| **Supabase DB** | Stores all data (reels, accounts, patterns, jobs) | Supabase cloud (Postgres) |
| **AI Server** | Runs Claude Agent SDK to analyze reels (video → frames → AI analysis) | Mac Mini (Express + tsx) |
| **React Frontend** | Displays Content Ideas & Winning Patterns pages | Cloudflare Worker (SPA) |
| **pg_cron** | Triggers Edge Functions on schedule | Supabase (Postgres extension) |

---

## Pipeline 1: Content Ideas (Competitor Watchlist)

### Step 1: Scraping — `scrape-watchlist` Edge Function

**Trigger**: pg_cron schedule (e.g., every 12 hours) or manual trigger

**What it does**:
1. Loads all active `watchlist_accounts` from DB
2. For each account, calls RapidAPI Instagram Scraper to get latest reels
3. Upserts reels into `watchlist_reels` table (update views if existing, insert if new)
4. If follower_count is missing, fetches it via separate API call
5. **Recalculates virality_ratio** for ALL reels of each account:
   - `virality_ratio = views / avg_views_of_account`
   - Flags `is_outlier = true` if ratio > 3.0
6. Updates `last_scraped_at` on the account

**RapidAPI Integration**:
```
GET https://{RAPIDAPI_HOST}/v1.2/reels?username_or_id_or_url={username}
Headers: x-rapidapi-key, x-rapidapi-host
```

The API key and host are stored as Supabase Vault secrets, retrieved via `rpc('get_secret')`.

**Edge Function code** (Deno, runs on Supabase):

```typescript
// supabase/functions/scrape-watchlist/index.ts
import { getSupabase, getSecret, runJob, sleep } from '../_shared/supabase.ts'

async function scrapeWatchlist() {
  const apiKey = await getSecret('RAPIDAPI_KEY')
  const apiHost = await getSecret('RAPIDAPI_HOST')
  const supabase = getSupabase()

  const { data: accounts } = await supabase
    .from('watchlist_accounts')
    .select('id, username, follower_count')
    .eq('status', 'active')

  for (const account of accounts ?? []) {
    // Fetch reels via RapidAPI
    const reels = await fetchReelsForAccount(account.username, apiKey, apiHost)

    // Upsert each reel
    for (const reel of reels) {
      const existing = await supabase.from('watchlist_reels')
        .select('id').eq('shortcode', shortcode).eq('account_id', account.id).single()

      if (existing) {
        // Update views/likes on existing
        await supabase.from('watchlist_reels').update({ views, likes }).eq('id', existing.id)
      } else {
        // Insert new reel
        await supabase.from('watchlist_reels').insert({ ...reelData })
      }
    }

    // Recalculate virality_ratio for ALL reels of this account
    const allReels = await supabase.from('watchlist_reels').select('id, views').eq('account_id', account.id)
    const avgViews = totalViews / allReels.length
    for (const r of allReels) {
      const ratio = r.views / avgViews
      await supabase.from('watchlist_reels').update({
        virality_ratio: ratio,
        is_outlier: ratio > 3.0,
      }).eq('id', r.id)
    }

    await sleep(1000) // Rate limiting
  }
}

Deno.serve(() => runJob('scrape-watchlist', scrapeWatchlist))
```

### Step 2: AI Analysis Trigger — `trigger-opus-analysis` Edge Function

**Trigger**: pg_cron schedule (after scraping) or manual trigger

**What it does**:
1. Finds unprocessed outlier watchlist reels (`is_outlier = true`, `pattern_type = 'unprocessed'`, has `video_url`)
2. For each reel (max 5 per run):
   - Creates an `ai_jobs` row with `type: 'analyze-reel'` and `status: 'queued'`
   - Sends HTTP POST to AI Server (`https://ai.1clicksystems.com/api/jobs`) with the job ID and params
3. The AI Server picks up the job and processes it asynchronously

```typescript
// supabase/functions/trigger-opus-analysis/index.ts
const { data: watchlistReels } = await supabase
  .from('watchlist_reels')
  .select('id, shortcode, video_url, ..., watchlist_accounts!inner(username, follower_count)')
  .eq('pattern_type', 'unprocessed')
  .eq('is_outlier', true)
  .neq('video_url', '')
  .order('virality_ratio', { ascending: false })
  .limit(5)

for (const reel of watchlistReels) {
  // Create AI job
  const { data: job } = await supabase
    .from('ai_jobs')
    .insert({ type: 'analyze-reel', status: 'queued', params: { reelId, source: 'watchlist_reels', videoUrl, metrics } })
    .select('id').single()

  // Send to AI Server
  await fetch('https://ai.1clicksystems.com/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ jobId: job.id, type: 'analyze-reel', params }),
  })
}
```

### Step 3: AI Server Processes the Job

**The AI Server** (`ai-server/src/server.ts`) is an Express server running on a Mac Mini, exposed via Cloudflare Tunnel at `https://ai.1clicksystems.com`.

**Key dependency**: `@anthropic-ai/claude-agent-sdk` — this is the Claude Agent SDK that lets you spawn Claude Code programmatically as a subprocess.

```json
// ai-server/package.json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "latest",
    "express": "^4.21.0",
    "cors": "^2.8.5"
  }
}
```

**How it works**:

1. **Job arrives** via POST `/api/jobs` with `{ jobId, type, params }`
2. **Job enters queue** (max 3 concurrent jobs)
3. **`buildPrompt()`** generates a detailed prompt based on job type
4. **`query()` from Claude Agent SDK** spawns a Claude Code subprocess:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'

const result = query({
  prompt,
  options: {
    model: 'sonnet',                              // Claude Sonnet for analysis
    permissionMode: 'bypassPermissions',          // Full autonomy, no user prompts
    allowDangerouslySkipPermissions: true,
    pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
    cwd: '~/mission-control/mission-control',     // Working directory
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    maxTurns: 80,
    env: { ...process.env, GEMINI_API_KEY: '...', WAVESPEED_API_KEY: '...' },
  },
})

// Stream results
for await (const message of result) {
  if (message.type === 'assistant') {
    // Update progress in Supabase
    await supabaseUpdate(jobId, { progress: message.text.slice(-200) })
  }
  if (message.type === 'result') {
    if (message.subtype === 'success') {
      await supabaseUpdate(jobId, { status: 'completed', cost_usd: message.total_cost_usd })
    }
  }
}
```

5. **The Claude Agent** (running as subprocess) executes the analyze-reel prompt autonomously:

   a. **Downloads the reel video** from the stored URL
   ```bash
   curl -sL -o /tmp/reel_abc123.mp4 "https://..."
   ```

   b. **Extracts frames** with ffmpeg
   ```bash
   ffmpeg -y -i /tmp/reel_abc123.mp4 -vf "fps=1" /tmp/reel_abc123_%03d.jpg
   ```

   c. **Reads frames visually** (Claude is multimodal — it can see images)

   d. **Analyzes the reel** based on frames + metrics:
   - **Hook**: What stops the scroll in first 1-2 seconds
   - **Retention**: What keeps viewers watching
   - **Pattern Formula**: The reproducible content mechanic
   - **Triggers**: Psychological engagement drivers
   - **Props/Setting**: What's needed to reproduce
   - **Difficulty**: 1-5 how hard to reproduce with AI
   - **Performance Analysis**: Why it performed as it did

   e. **Pattern Matching**: Loads existing patterns from DB, matches or creates new one
   ```bash
   # Load patterns
   curl "$SUPABASE_URL/rest/v1/patterns?select=id,name" -H "apikey: $SUPABASE_KEY"

   # Create new pattern if needed
   curl -X POST "$SUPABASE_URL/rest/v1/patterns" -d '{"name":"POV Workplace","description":"..."}'
   ```

   f. **Saves results** back to the reel row in Supabase
   ```bash
   curl -X PATCH "$SUPABASE_URL/rest/v1/watchlist_reels?id=eq.<reelId>" \
     -d '{
       "hook": "Close-up of attractive woman in professional setting...",
       "retention": "Curiosity gap: what happens when the boss walks in?",
       "pattern_formula": "[POV Hook] + [Workplace Setting] + [Unexpected Reveal]",
       "triggers": ["Curiosity Gap", "Power Dynamic", "Thirst Trap"],
       "props": ["Office outfit", "Desk setup", "Professional lighting"],
       "difficulty": 2,
       "difficulty_note": "Simple scene, one location",
       "performance_analysis": "15x above account average. Hook is strong...",
       "suggested_pattern_name": "POV Workplace Reveal",
       "matched_pattern_id": "<uuid>",
       "pattern_type": "proven",
       "analysis_status": "done",
       "processed_at": "2026-03-05T..."
     }'
   ```

   g. **Cleans up** temp files
   ```bash
   rm -f /tmp/reel_abc123.mp4 /tmp/reel_abc123_*.jpg
   ```

### Step 4: Frontend Displays Results

The React frontend reads from Supabase using the API layer (`api/watchlist.ts`) and Zustand stores.

**Content Ideas Tab** (`ContentIdeasTab.tsx`) shows:
- Watchlist accounts assigned to this character
- Filtered reels (outliers only by default, must have `analysisStatus === 'done'`)
- Each reel as an `IdeaCard` with video player + structured analysis
- "Reproduce" button to create a production task

---

## Pipeline 2: Winning Patterns (Own Reels)

### Step 1: Scraping — `scrape-own-accounts` Edge Function

**Same RapidAPI**, but scrapes our own Instagram accounts from `device_accounts` table.

Key difference: After scraping, it **recalculates performance_ratio** for all reels per username:

```typescript
async function recalculatePerformance(supabase, username) {
  const { data: reels } = await supabase.from('own_reels').select('id, views, is_winner').eq('username', username)
  const avgViews = reels.reduce((s, r) => s + r.views, 0) / reels.length

  for (const reel of reels) {
    const ratio = reel.views / avgViews
    const newIsWinner = ratio > 2.0  // Winner = 2x above account average
    await supabase.from('own_reels').update({
      account_avg_views: avgViews,
      performance_ratio: ratio,
      is_winner: newIsWinner,
      // Track winner status changes for re-analysis
      ...(reel.is_winner !== newIsWinner ? { previous_is_winner: reel.is_winner } : {}),
    }).eq('id', reel.id)
  }
}
```

### Step 2: AI Analysis — Same Pipeline

The `trigger-opus-analysis` Edge Function also picks up own reels:

```typescript
const { data: ownReels } = await supabase
  .from('own_reels')
  .select('...')
  .eq('is_winner', true)
  .or('analysis_status.eq.pending,analysis_status.is.null')
  .is('analyzed_at', null)
  .neq('video_url', '')
  .limit(5)
```

Same AI Server flow, same analysis, but results go to `own_reels` table instead.

### Step 3: Frontend Displays Results

**Winning Patterns Board** (`WinningBoard.tsx`) shows:
- **KPIs**: Total Reach, Views per Reel, Top Pattern, Analyzed count
- **Pattern Ranking Table**: Aggregated from reels, with SCALE/OPTIMIZE/TEST/PIVOT status
- **Reel Cards** with video + analysis

---

## Database Tables — AI Pipeline

### `ai_jobs` — Job Queue

```sql
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                    -- 'analyze-reel', 'clone-reel', 'plan-stories', etc.
  params JSONB NOT NULL DEFAULT '{}'::jsonb,  -- job-specific parameters
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'completed' | 'failed'
  progress TEXT NOT NULL DEFAULT '',     -- last 200 chars of Claude output
  result TEXT,                           -- final result text
  error TEXT,                            -- error message if failed
  turns INTEGER NOT NULL DEFAULT 0,      -- Claude agent turns used
  cost_usd NUMERIC NOT NULL DEFAULT 0,   -- API cost in USD
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `ai_costs` — Cost Tracking

```sql
CREATE TABLE ai_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT DEFAULT '',
  reel_id TEXT DEFAULT '',
  service TEXT NOT NULL,                 -- 'rapidapi', 'anthropic', 'gemini', 'wavespeed'
  model TEXT DEFAULT '',
  operation TEXT DEFAULT '',
  cost_cents NUMERIC NOT NULL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `cron_jobs` — Scheduling

```sql
CREATE TABLE cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,             -- 'scrape-watchlist', 'trigger-opus-analysis', etc.
  description TEXT DEFAULT '',
  interval_ms INTEGER NOT NULL DEFAULT 86400000,
  last_run TIMESTAMPTZ,
  last_status TEXT DEFAULT 'never',      -- 'success' | 'error' | 'never'
  last_error TEXT DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true
);
```

---

## Supabase Edge Functions — Shared Helper

All Edge Functions use a shared helper for Supabase client and secret management:

```typescript
// supabase/functions/_shared/supabase.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Secrets stored in Supabase Vault, accessed via RPC
export async function getSecret(name: string): Promise<string> {
  const supabase = getSupabase()
  const { data } = await supabase.rpc('get_secret', { secret_name: name })
  return data
}

// Wraps a job handler — logs to cron_jobs table
export async function runJob(jobName: string, handler: () => Promise<unknown>): Promise<Response> {
  const supabase = getSupabase()
  try {
    const result = await handler()
    await supabase.from('cron_jobs').update({ last_run: now, last_status: 'success' }).eq('name', jobName)
    return new Response(JSON.stringify({ ok: true, result }))
  } catch (err) {
    await supabase.from('cron_jobs').update({ last_run: now, last_status: 'error', last_error: err.message }).eq('name', jobName)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 })
  }
}
```

---

## AI Server Setup — How to Run

### Requirements
- Mac with Claude Code CLI installed (`/opt/homebrew/bin/claude` or wherever it's at)
- Node.js 20+ or Bun
- ffmpeg installed (`brew install ffmpeg`)

### Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SLACK_BOT_TOKEN=xoxb-...           # Optional, for notifications
RESTART_SECRET=some-secret          # For remote restart endpoint
GEMINI_API_KEY=...                  # For image generation (used by clone-reel)
WAVESPEED_API_KEY=...               # For video generation (used by clone-reel)
```

### Start

```bash
cd ai-server
npm install
npm run dev    # Development with tsx hot-reload
# or
npm start      # Production
```

The server starts on port 3456 by default.

### API Endpoints

```
POST /api/jobs          — Submit a new job { jobId, type, params }
GET  /health            — Health check
GET  /api/status        — Running/queued job count
GET  /api/restart?secret=...  — Remote restart
GET  /api/update?secret=...&url=...  — Remote code update
```

### Job Concurrency

The AI Server runs max 3 concurrent Claude Agent instances. Additional jobs are queued.

```typescript
const MAX_CONCURRENT = 3
let runningCount = 0
const jobQueue = []

async function processQueue() {
  while (runningCount < MAX_CONCURRENT && jobQueue.length > 0) {
    const job = jobQueue.shift()
    runningCount++
    runJob(job).finally(() => {
      runningCount--
      processQueue()
    })
  }
}
```

---

## Key Thresholds

| Metric | Threshold | Effect |
|--------|-----------|--------|
| Outlier (watchlist) | `virality_ratio > 3.0` | Flags `is_outlier = true`, triggers AI analysis |
| Winner (own reels) | `performance_ratio > 2.0` | Flags `is_winner = true`, triggers AI analysis |
| Pattern Status: TEST | `reelCount < 3` | Not enough data yet |
| Pattern Status: SCALE | `avgViews > globalAvg && winnerCount >= 1` | Working, make more |
| Pattern Status: PIVOT | `winnerCount === 0 && avgViews < globalAvg` | Not working, try something else |
| Pattern Status: OPTIMIZE | Everything else | Room for improvement |

---

## End-to-End Data Flow Summary

```
1. pg_cron triggers scrape-watchlist Edge Function
2. Edge Function scrapes Instagram via RapidAPI → saves to watchlist_reels
3. Virality ratio calculated, outliers flagged (>3x average)
4. pg_cron triggers trigger-opus-analysis Edge Function
5. Edge Function finds unprocessed outliers, creates ai_jobs rows
6. Edge Function sends POST to AI Server with job details
7. AI Server spawns Claude Agent (via Claude Agent SDK)
8. Claude Agent downloads video, extracts frames with ffmpeg
9. Claude Agent visually analyzes frames + metrics
10. Claude Agent matches/creates pattern in patterns table
11. Claude Agent writes structured analysis back to watchlist_reels
12. Frontend reads from Supabase, displays in Content Ideas tab
13. User clicks "Reproduce" → creates content_task
14. Content task appears in Content Production pipeline
```

Same flow for own reels, but scrape-own-accounts → own_reels → Winning Patterns tab.
