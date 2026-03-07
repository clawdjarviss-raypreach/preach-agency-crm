# CODER SPEC: Unified IG Scraper + VPD Outlier Detection

## Overview
Build a standalone Node.js scraper that runs as a Render Cron Job every 6 hours.
It scrapes ALL IG accounts (own + competitors) via RapidAPI, stores snapshots,
calculates VPD metrics, flags winners/outliers/trending, and triggers AI analysis.

This replaces both the `ig-sync` Edge Function (Tom's Supabase) and the
`competitor-sync` Edge Function with a single unified pipeline.

## File Structure
Create a new directory: `render-scraper/` in the project root.

```
render-scraper/
  package.json
  tsconfig.json
  src/
    index.ts          # Entry point — orchestrates full scrape cycle
    scraper.ts        # RapidAPI calls (profile, reels, media detail)
    vpd.ts            # VPD calculation engine (median, thresholds, flags)
    storage.ts        # Supabase DB reads/writes
    ai-gate.ts        # AI analysis qualification + job creation
    utils.ts          # Helpers (sleep, retry, logging)
  .env.example
```

## Environment Variables
```
SUPABASE_URL=https://hufcbxodgxinbvpqfaaw.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZmNieG9kZ3hpbmJ2cHFmYWF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ2OTMyOCwiZXhwIjoyMDg4MDQ1MzI4fQ.VbvTkS9CA08NTw6-Cdhov04Eyh9lAe4Fvifvf4na4T4
RAPIDAPI_KEY=9a05d0ce4bmshafdc9ec10bd5d1bp1fee88jsne08a00f6bef3
RAPIDAPI_HOST=instagram-scraper-stable-api.p.rapidapi.com
AI_SERVER_URL=https://ai.clickmylinks.co
```

## package.json
```json
{
  "name": "preach-ig-scraper",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

## tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

---

## Database Migration (file: `supabase/migrations/011_vpd_outlier_detection.sql`)

Create this migration file AND include it in the scraper repo for reference.

```sql
-- ============================================================
-- Migration 011: VPD Outlier Detection System
-- ============================================================

-- 1. Competitor reel snapshots (time series for delta VPD)
CREATE TABLE IF NOT EXISTS crm_competitor_reel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_reel_id uuid NOT NULL REFERENCES crm_competitor_reels(id) ON DELETE CASCADE,
  views integer NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_reel_snapshots_reel_time
  ON crm_competitor_reel_snapshots (competitor_reel_id, scraped_at DESC);

-- 2. VPD columns on competitor reels
ALTER TABLE crm_competitor_reels
  ADD COLUMN IF NOT EXISTS lifetime_vpd numeric,
  ADD COLUMN IF NOT EXISTS delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS effective_vpd numeric,
  ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS projected_views numeric,
  ADD COLUMN IF NOT EXISTS age_days numeric;

-- 3. VPD columns on own reels
ALTER TABLE crm_ig_reels
  ADD COLUMN IF NOT EXISTS lifetime_vpd numeric,
  ADD COLUMN IF NOT EXISTS delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS effective_vpd numeric,
  ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS projected_views numeric,
  ADD COLUMN IF NOT EXISTS age_days numeric;

-- 4. Account-level VPD stats on competitor watchlists
ALTER TABLE crm_competitor_watchlists
  ADD COLUMN IF NOT EXISTS median_vpd numeric,
  ADD COLUMN IF NOT EXISTS median_delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS winner_threshold numeric,
  ADD COLUMN IF NOT EXISTS active_reel_count integer DEFAULT 0;

-- 5. Account-level VPD stats on own IG accounts
ALTER TABLE crm_ig_accounts
  ADD COLUMN IF NOT EXISTS median_vpd numeric,
  ADD COLUMN IF NOT EXISTS median_delta_vpd numeric,
  ADD COLUMN IF NOT EXISTS winner_threshold numeric,
  ADD COLUMN IF NOT EXISTS active_reel_count integer DEFAULT 0;

-- 6. Own reel snapshots table for 6-hour intervals
-- (We already have crm_ig_reel_daily_snapshots from Tom, but those are daily.
--  We need a NEW table for 6-hour snapshots from our own scraper.)
CREATE TABLE IF NOT EXISTS crm_ig_reel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_reel_id uuid NOT NULL REFERENCES crm_ig_reels(id) ON DELETE CASCADE,
  views integer NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_reel_snapshots_reel_time
  ON crm_ig_reel_snapshots (ig_reel_id, scraped_at DESC);

-- 7. Cleanup cron: delete snapshots older than 30 days (weekly on Sunday 3AM)
SELECT cron.schedule(
  'cleanup-reel-snapshots',
  '0 3 * * 0',
  $$
    DELETE FROM crm_competitor_reel_snapshots WHERE scraped_at < NOW() - INTERVAL '30 days';
    DELETE FROM crm_ig_reel_snapshots WHERE scraped_at < NOW() - INTERVAL '30 days';
  $$
);

-- 8. RLS policies for new tables (service role bypasses RLS, but add for completeness)
ALTER TABLE crm_competitor_reel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ig_reel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read competitor snapshots"
  ON crm_competitor_reel_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read own reel snapshots"
  ON crm_ig_reel_snapshots FOR SELECT TO authenticated USING (true);
```

---

## src/scraper.ts — RapidAPI Integration

### Endpoints Used

**1. Profile** — `POST /ig_get_fb_profile_v3.php`
```
Body (form-urlencoded or JSON): { username_or_url: "leniimariee06" }
Returns: { id, username, follower_count, biography, profile_pic_url, ... }
```

**2. Reels listing** — `POST /get_ig_user_reels.php`
```
Body: { username_or_url: "leniimariee06", amount: "30", pagination_token?: "..." }
Returns: { reels: [{ node: { media: { code, play_count, like_count, comment_count, caption, image_versions2, taken_at, pk } } }], pagination_token }
Note: Returns 12 per page regardless of amount. Paginate until no more pagination_token.
Note: taken_at may be available in some responses. Check media.taken_at first.
```

**3. Media detail** — `GET /get_media_data.php?reel_post_code_or_url={code}&type=reel`
```
Returns: { taken_at_timestamp, video_versions[].url OR video_url, image_versions2, ... }
Use for: getting posted_at (taken_at_timestamp) and video_url for new reels
```

### Rate Limiting
- **50 requests/minute** on ULTRA plan
- Use **1.5 second delay** between requests
- On 429: wait 60 seconds, retry up to 3 times
- Log API call count per cycle for monitoring

### Pagination Logic
```typescript
async function fetchAllReels(username: string): Promise<Reel[]> {
  const allReels: Reel[] = [];
  let paginationToken: string | undefined;
  
  do {
    const response = await fetchReelsPage(username, paginationToken);
    const reels = extractReels(response); // handles node.media nesting
    
    allReels.push(...reels);
    paginationToken = response.pagination_token;
    
    await sleep(1500);
  } while (paginationToken);
  
  return allReels;
}
```

### posted_at Strategy
1. Check `media.taken_at` from reels listing first (Unix timestamp)
2. If null: check if reel already exists in DB with `posted_at` set
3. If still null AND reel is new: fetch via `get_media_data` → `taken_at_timestamp`
4. Cache fetched timestamps to avoid re-fetching

---

## src/vpd.ts — VPD Calculation Engine

### Per-Reel Calculations
```typescript
interface ReelVPD {
  lifetime_vpd: number;       // views / max(age_days, 0.25)
  delta_vpd: number | null;   // (current - prev) * (24 / hours_between)
  effective_vpd: number;      // max(lifetime_vpd, delta_vpd ?? 0)
  age_days: number;           // (now - posted_at) / 86400, min 0.25
  projected_views: number;    // views + effective_vpd * max(14 - age_days, 0)
}

function calculateReelVPD(
  views: number,
  postedAt: Date,
  prevSnapshot: { views: number; scrapedAt: Date } | null,
  now: Date
): ReelVPD {
  const ageDays = Math.max((now.getTime() - postedAt.getTime()) / 86400000, 0.25);
  const lifetimeVpd = views / ageDays;
  
  let deltaVpd: number | null = null;
  if (prevSnapshot) {
    const hoursBetween = (now.getTime() - prevSnapshot.scrapedAt.getTime()) / 3600000;
    if (hoursBetween >= 1) { // at least 1 hour between snapshots
      deltaVpd = ((views - prevSnapshot.views) / hoursBetween) * 24;
      if (deltaVpd < 0) deltaVpd = 0; // views don't go down (usually)
    }
  }
  
  const effectiveVpd = Math.max(lifetimeVpd, deltaVpd ?? 0);
  const remainingDays = Math.max(14 - ageDays, 0);
  const projectedViews = views + effectiveVpd * remainingDays;
  
  return { lifetime_vpd: lifetimeVpd, delta_vpd: deltaVpd, effective_vpd: effectiveVpd, age_days: ageDays, projected_views: projectedViews };
}
```

### Per-Account Calculations
```typescript
interface AccountVPD {
  median_vpd: number;
  median_delta_vpd: number | null;
  winner_threshold: number;   // 5.0 | 3.0 | 2.0
  tier: 'small' | 'mid' | 'large';
  active_reel_count: number;
}

function calculateAccountVPD(reels: ReelVPD[]): AccountVPD {
  const vpds = reels.map(r => r.lifetime_vpd).sort((a, b) => a - b);
  const medianVpd = median(vpds);
  
  const deltas = reels.map(r => r.delta_vpd).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const medianDelta = deltas.length > 0 ? median(deltas) : null;
  
  let threshold: number;
  let tier: 'small' | 'mid' | 'large';
  if (medianVpd < 1000) { threshold = 5.0; tier = 'small'; }
  else if (medianVpd < 10000) { threshold = 3.0; tier = 'mid'; }
  else { threshold = 2.0; tier = 'large'; }
  
  return { median_vpd: medianVpd, median_delta_vpd: medianDelta, winner_threshold: threshold, tier, active_reel_count: reels.length };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

### Flagging Logic
```typescript
function flagReel(reel: ReelVPD, account: AccountVPD): {
  is_winner: boolean;      // for own reels
  is_outlier: boolean;     // for competitor reels
  is_trending: boolean;
  virality_ratio: number;
} {
  const ratio = reel.effective_vpd / account.median_vpd;
  
  const isWinner = ratio >= account.winner_threshold;
  
  let isTrending = false;
  if (reel.delta_vpd !== null && account.median_delta_vpd !== null && account.median_delta_vpd > 0) {
    isTrending = reel.delta_vpd / account.median_delta_vpd >= 5.0;
  }
  
  return { is_winner: isWinner, is_outlier: isWinner, is_trending: isTrending, virality_ratio: ratio };
}
```

---

## src/ai-gate.ts — AI Analysis Qualification

### Gate Logic
```typescript
const PROJECTION_THRESHOLD = 100_000;

function shouldAnalyze(
  reel: { is_winner: boolean; is_outlier: boolean; is_trending: boolean; projected_views: number; analysis_status: string | null }
): boolean {
  // Must be flagged
  if (!reel.is_winner && !reel.is_outlier && !reel.is_trending) return false;
  
  // Must project to meaningful scale
  if (reel.projected_views < PROJECTION_THRESHOLD) return false;
  
  // Must not already be analyzed or queued
  if (reel.analysis_status === 'done' || reel.analysis_status === 'queued' || reel.analysis_status === 'analyzing') return false;
  
  return true;
}
```

### Triggering AI Analysis
When a reel passes the gate:
1. Fetch video_url via `get_media_data` if not already stored
2. Set `analysis_status = 'queued'` on the reel
3. INSERT into `ai_jobs` table:
```typescript
{
  id: crypto.randomUUID(),
  type: 'reel_analysis',
  reel_type: isOwnReel ? 'own' : 'competitor',
  reel_id: reelId,
  video_url: videoUrl,
  caption: caption,
  status: 'pending',
  created_at: new Date().toISOString()
}
```
4. POST to AI server:
```typescript
await fetch(`${AI_SERVER_URL}/api/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, videoUrl, caption, reelType, reelId })
});
```

---

## src/storage.ts — Supabase Operations

### Load accounts
```typescript
async function loadOwnAccounts(): Promise<OwnAccount[]> {
  const { data } = await supabase
    .from('crm_ig_accounts')
    .select('id, username, creator_id, is_active, median_vpd')
    .eq('is_active', true);
  return data ?? [];
}

async function loadCompetitorWatchlists(): Promise<Watchlist[]> {
  const { data } = await supabase
    .from('crm_competitor_watchlists')
    .select('id, ig_username, ig_user_id, creator_id, format_id, median_vpd');
  return data ?? [];
}
```

### Upsert own reels
```typescript
async function upsertOwnReel(accountId: string, media: any): Promise<string> {
  const row = {
    ig_account_id: accountId,
    supabase_reel_id: String(media.pk || media.id),
    shortcode: media.code,
    caption: media.caption?.text ?? media.caption ?? null,
    thumbnail_url: getPosterUrl(media),
    video_url: getVideoUrl(media),
    posted_at: toIsoFromUnix(media.taken_at),
    views: toNumber(media.play_count),
    likes: toNumber(media.like_count),
    comments: toNumber(media.comment_count),
    shares: toNumber(media.share_count ?? 0),
    is_deleted: false,
    last_synced_at: new Date().toISOString()
  };
  
  const { data } = await supabase
    .from('crm_ig_reels')
    .upsert(row, { onConflict: 'ig_account_id,supabase_reel_id' })
    .select('id')
    .single();
  
  return data!.id;
}
```

### Insert snapshot (6-hour interval)
```typescript
async function insertOwnReelSnapshot(igReelId: string, views: number, likes: number, comments: number, shares: number) {
  await supabase.from('crm_ig_reel_snapshots').insert({
    ig_reel_id: igReelId,
    views, likes, comments, shares,
    scraped_at: new Date().toISOString()
  });
}

async function insertCompetitorReelSnapshot(competitorReelId: string, views: number, likes: number, comments: number) {
  await supabase.from('crm_competitor_reel_snapshots').insert({
    competitor_reel_id: competitorReelId,
    views, likes, comments,
    scraped_at: new Date().toISOString()
  });
}
```

### Get previous snapshot (for delta VPD)
```typescript
async function getPreviousSnapshot(table: string, fkColumn: string, reelId: string): Promise<{ views: number; scrapedAt: Date } | null> {
  const { data } = await supabase
    .from(table)
    .select('views, scraped_at')
    .eq(fkColumn, reelId)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!data) return null;
  return { views: data.views, scrapedAt: new Date(data.scraped_at) };
}
```

### Batch update VPD fields
After calculating VPD for all reels of an account, batch-update:
```typescript
async function updateReelVPD(table: string, reelId: string, vpd: ReelVPD & { is_winner?: boolean; is_outlier?: boolean; is_trending: boolean; virality_ratio: number }) {
  await supabase.from(table).update({
    lifetime_vpd: vpd.lifetime_vpd,
    delta_vpd: vpd.delta_vpd,
    effective_vpd: vpd.effective_vpd,
    is_trending: vpd.is_trending,
    projected_views: vpd.projected_views,
    age_days: vpd.age_days,
    // For own reels:
    is_winner: vpd.is_winner,
    performance_ratio: vpd.virality_ratio,
    // For competitor reels:
    is_outlier: vpd.is_outlier,
    virality_ratio: vpd.virality_ratio,
  }).eq('id', reelId);
}
```

---

## src/index.ts — Main Orchestrator

```typescript
import 'dotenv/config';
// ... imports

async function main() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting unified IG scrape cycle...`);
  
  const stats = { 
    ownAccounts: 0, competitorAccounts: 0,
    ownReels: 0, competitorReels: 0,
    ownSnapshots: 0, competitorSnapshots: 0,
    winners: 0, trending: 0, aiQueued: 0,
    apiCalls: 0, errors: 0
  };
  
  // 1. Load all accounts
  const ownAccounts = await loadOwnAccounts();
  const watchlists = await loadCompetitorWatchlists();
  
  console.log(`Loaded ${ownAccounts.length} own accounts, ${watchlists.length} competitor watchlists`);
  
  // 2. Process own accounts
  for (const account of ownAccounts) {
    try {
      await processOwnAccount(account, stats);
      stats.ownAccounts++;
    } catch (err) {
      console.error(`Error processing own @${account.username}:`, err);
      stats.errors++;
    }
    await sleep(1500); // rate limit between accounts
  }
  
  // 3. Process competitor accounts
  for (const watchlist of watchlists) {
    try {
      await processCompetitorAccount(watchlist, stats);
      stats.competitorAccounts++;
    } catch (err) {
      console.error(`Error processing competitor @${watchlist.ig_username}:`, err);
      stats.errors++;
    }
    await sleep(1500);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${new Date().toISOString()}] Scrape cycle complete in ${elapsed}s`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

### processOwnAccount flow:
```
1. Fetch profile → update crm_ig_accounts (follower_count, bio, avatar_url)
2. Fetch all reels (paginated)
3. For each reel with posted_at within last 14 days:
   a. Upsert into crm_ig_reels
   b. Get previous snapshot from crm_ig_reel_snapshots
   c. Insert new snapshot into crm_ig_reel_snapshots
   d. Calculate reel VPD
4. Calculate account VPD (median, threshold)
5. Update crm_ig_accounts (median_vpd, winner_threshold, active_reel_count)
6. For each reel: apply flags (is_winner, is_trending)
7. AI gate check → queue qualifying reels
```

### processCompetitorAccount flow:
Same as above but uses `crm_competitor_watchlists`, `crm_competitor_reels`, `crm_competitor_reel_snapshots`.

---

## Helper Functions (src/utils.ts)

```typescript
export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getPosterUrl(media: any): string | null {
  const candidates = media?.image_versions2?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    return candidates[0]?.url ?? null;
  }
  return media?.thumbnail_url ?? media?.display_url ?? null;
}

export function getVideoUrl(media: any): string | null {
  const versions = media?.video_versions;
  if (Array.isArray(versions) && versions.length > 0) {
    return versions[0]?.url ?? null;
  }
  return media?.video_url ?? null;
}
```

---

## CRITICAL: RapidAPI Quirks

1. **12 reels per page** — `amount` param is ignored. Always returns 12. Must paginate via `pagination_token`.
2. **`taken_at` field**: Sometimes present in reels listing as `media.taken_at` (Unix). Sometimes null. Always available via `get_media_data` → `taken_at_timestamp`.
3. **POST with JSON body** — despite some docs suggesting form-urlencoded, JSON works for all endpoints.
4. **Headers required**: `x-rapidapi-key`, `x-rapidapi-host`, `content-type: application/json`
5. **Video URLs expire** — `video_versions[].url` from RapidAPI are temporary CDN links. Must re-fetch when needed for AI analysis.
6. **Rate limit**: 50 req/min. Use 1.5s delay between ALL requests (not just between accounts).

---

## Build & Start Commands (for Render)

```
Build: npm install && npm run build
Start: npm start
```

---

## Verification Checklist

After building, verify:
- [ ] `npm run build` passes clean (no TS errors)
- [ ] `.env.example` has all required vars documented
- [ ] Migration SQL is valid and idempotent (IF NOT EXISTS everywhere)
- [ ] Pagination works (fetchAllReels returns > 12 for accounts with many reels)
- [ ] Snapshots are INSERTED (not upserted) — new row each cycle
- [ ] VPD calculations match: lifetime = views/age, delta = (curr-prev)*(24/hours), effective = max(both)
- [ ] Median uses sorted middle value, not average
- [ ] Threshold tiers: <1K → 5x, <10K → 3x, ≥10K → 2x
- [ ] AI gate: (winner OR outlier OR trending) AND projected ≥ 100K AND not already analyzed
- [ ] Rate limiting: 1.5s between ALL API calls
- [ ] Error handling: one account failure doesn't crash the whole cycle
- [ ] Final stats logged to stdout (Render captures this)
