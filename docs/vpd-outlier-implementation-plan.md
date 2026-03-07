# VPD Outlier Detection — Implementation Plan
## Updated: Mar 7, 2026 — Unified Scraper (no Tom dependency)

## What We're Building

Replace the current static outlier detection (fixed 50K floor + simple average ratio) with:
- **VPD normalization** (views per day, adjusted for reel age)
- **Median baseline** (robust against skew from one viral hit)
- **Sliding thresholds** (5x small / 3x mid / 2x large accounts)
- **Projected views gate** (only send to Claude if projected > 100K)
- **Trending detection** (delta VPD from 6-hour snapshots, `is_trending` flag)
- **4x/day scrape cycle** (every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC)
- **Own scraper on Render** — no more dependency on Tom's Supabase

## Architecture Change: Unified Scraper

**Before**: Tom's scraper → Tom's Supabase → ig-sync Edge Function → our Supabase
**After**: Our Render cron job → RapidAPI → our Supabase (direct)

### Why
- No dependency on Tom's scraper timing or uptime
- Same API (RapidAPI) already used for competitors — one pipeline for everything
- 6-hour snapshots for own reels (Tom only did 1x/day)
- Own + competitor accounts in unified scraper = same VPD logic everywhere

### API Budget
- Own accounts: 78 × 4 cycles/day = ~1,260 calls/day
- Competitor accounts: ~85 × 4 cycles/day = ~1,400 calls/day  
- Total: ~2,660/day = ~80K/month (40% of 200K quota) ✅

## What Stays the Same

- RapidAPI provider + endpoints (same API, same credits)
- AI analysis pipeline (Claude watches video, returns hook/retention/pattern/triggers/props)
- AI server on Mac Mini (localhost:3456)
- Existing data in our Supabase (historical snapshots preserved)
- `crm_ig_accounts` table (accounts stay, just scraped by us now)

## What Gets Retired
- `ig-sync` Edge Function (no longer pulls from Tom)
- `crm-ig-sync-daily` pg_cron job (replaced by Render cron)
- Any read access to Tom's Supabase tables

## Current State

### Tables
- `crm_competitor_watchlists` — accounts to track (has ig_username, follower_count, avg_views, format_id, creator_id)
- `crm_competitor_reels` — scraped reels (has play_count, is_outlier, outlier_multiplier, virality_ratio, posted_at, video_url, analysis_status)
- `crm_ig_reels` — own reels from Tom (has views, performance_ratio, is_winner, account_avg_views, analysis_status)
- `crm_ig_reel_daily_snapshots` — daily snapshots for own reels (from Tom's scraper)
- **NO competitor reel snapshots table yet**

### Edge Functions
- `competitor-sync` — fetches first page of reels (12/page), calculates average-based outlier, upserts. Only runs manually (no cron).
- `trigger-analysis` — scans for reels with analysis_status='pending', creates ai_jobs, POSTs to AI server

### Issues with Current competitor-sync
- Only fetches FIRST page (12 reels max, no pagination)
- No snapshot history (overwrites on upsert)
- Uses average, not median
- Fixed 3x threshold, no account-size tiering
- No posted_at from reels endpoint (need get_media_data for that)
- No trending detection
- content-type header sends JSON but API expects form-urlencoded

---

## Implementation Phases

### Phase 1: Database Migration
**New table**: `crm_competitor_reel_snapshots`
```sql
CREATE TABLE crm_competitor_reel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_reel_id uuid NOT NULL REFERENCES crm_competitor_reels(id) ON DELETE CASCADE,
  views integer NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comp_reel_snapshots_reel_time
  ON crm_competitor_reel_snapshots (competitor_reel_id, scraped_at DESC);
```

**New columns on `crm_competitor_reels`**:
```sql
ALTER TABLE crm_competitor_reels
  ADD COLUMN lifetime_vpd numeric,
  ADD COLUMN delta_vpd numeric,
  ADD COLUMN effective_vpd numeric,
  ADD COLUMN is_trending boolean,
  ADD COLUMN projected_views numeric,
  ADD COLUMN age_days numeric;
```

**New columns on `crm_competitor_watchlists`**:
```sql
ALTER TABLE crm_competitor_watchlists
  ADD COLUMN median_vpd numeric,
  ADD COLUMN median_delta_vpd numeric,
  ADD COLUMN winner_threshold numeric,
  ADD COLUMN active_reel_count integer DEFAULT 0;
```

**Add unique constraint for upsert**:
```sql
ALTER TABLE crm_competitor_reels
  ADD CONSTRAINT uq_competitor_reels_wl_code
  UNIQUE (watchlist_id, ig_media_code);
```

**Same columns on `crm_ig_reels`** (for own reels):
```sql
ALTER TABLE crm_ig_reels
  ADD COLUMN lifetime_vpd numeric,
  ADD COLUMN delta_vpd numeric,
  ADD COLUMN effective_vpd numeric,
  ADD COLUMN is_trending boolean,
  ADD COLUMN projected_views numeric,
  ADD COLUMN age_days numeric;
```

**Cleanup cron** (weekly, delete snapshots > 14 days):
```sql
SELECT cron.schedule('cleanup-competitor-snapshots', '0 3 * * 0',
  $$DELETE FROM crm_competitor_reel_snapshots WHERE scraped_at < NOW() - INTERVAL '14 days'$$
);
```

### Phase 2: Rewrite `competitor-sync` Edge Function

Complete rewrite. The new function does this per cycle:

```
For each watchlist account:
  1. Fetch profile (ig_get_fb_profile_v3) → update follower_count, bio
  2. Fetch ALL reels with pagination (get_ig_user_reels, 12/page)
     - Filter: only reels < 14 days old (by posted_at)
     - Note: reels endpoint doesn't return taken_at, so fetch posted_at
       from get_media_data for new reels only (1 call per new reel)
  3. For each reel:
     a. UPSERT into crm_competitor_reels (update play_count, like_count, comment_count)
     b. INSERT snapshot into crm_competitor_reel_snapshots (always new row)
  4. Calculate per-reel:
     - age_days = (NOW - posted_at) in days, min 0.25
     - lifetime_vpd = play_count / age_days
     - delta_vpd = (current_views - prev_snapshot_views) × (24 / hours_between)
       → NULL if no previous snapshot
     - effective_vpd = MAX(lifetime_vpd, COALESCE(delta_vpd, 0))
  5. Calculate per-account:
     - median_vpd = MEDIAN of all reels' lifetime_vpd (need >= 5 reels)
     - median_delta_vpd = MEDIAN of all reels' delta_vpd (where not NULL)
     - winner_threshold = median < 1K → 5.0 | median < 10K → 3.0 | else → 2.0
  6. Flag per-reel:
     - is_outlier = (lifetime_vpd / median_vpd) >= threshold
     - is_trending = delta_vpd IS NOT NULL AND median_delta_vpd > 0
                     AND (delta_vpd / median_delta_vpd) >= 5.0
     - virality_ratio = effective_vpd / median_vpd
     - projected_views = play_count + (effective_vpd × (14 - age_days))
  7. AI gate:
     - Send to Claude IF:
       (is_outlier OR is_trending)
       AND projected_views >= 100,000
       AND analysis_status IS NULL or 'pending'
     - Fetch video_url via get_media_data (if not already stored)
     - Create ai_job + POST to AI server
  8. Update watchlist: median_vpd, median_delta_vpd, winner_threshold,
     active_reel_count, last_synced_at
```

**API cost per cycle** (~85 accounts):
- 85 profile calls
- 85 × ~3 reel pages = 255 calls
- ~5-10 video URL fetches (new outliers only)
- Total: ~350 calls/cycle × 4/day = ~1,400/day = ~42K/month (21% of 200K quota)

### Phase 3: Unified Render Cron Scraper

**This replaces both `ig-sync` and `competitor-sync`.**

A single Node.js script running on Render Cron (`0 0,6,12,18 * * *`):

```
1. Load ALL accounts to scrape:
   a. Own accounts: SELECT from crm_ig_accounts WHERE is_active = true
   b. Competitor accounts: SELECT from crm_competitor_watchlists

2. For each account (own + competitor):
   a. Fetch profile (ig_get_fb_profile_v3) → update followers, bio
   b. Fetch ALL reels with pagination (12/page)
   c. Filter to < 14 days old
   d. For new reels: fetch posted_at via get_media_data (1 call per new reel)
   e. Upsert reels into crm_ig_reels (own) or crm_competitor_reels (competitor)
   f. INSERT snapshot row (crm_ig_reel_daily_snapshots or crm_competitor_reel_snapshots)
   g. Calculate VPD per reel (lifetime + delta from previous snapshot)

3. Per account: calculate median_vpd, median_delta_vpd, threshold tier

4. Per reel: set is_winner/is_outlier, is_trending, projected_views

5. AI gate: (flagged) AND projected >= 100K AND not already analyzed
   → fetch video_url if missing → create ai_job → POST to AI server

6. Update account metadata (median_vpd, last_synced_at, active_reel_count)
```

**Why Render, not Edge Function:**
- Edge Functions have 60s timeout — too short for 160+ accounts with pagination
- Render Cron can run for minutes with no timeout pressure
- Better logging, retry logic, and error handling

**Render setup:**
- Render workspace: `tea-d6m1sh5actks73fptvog` (Preach Agency, rayan@preachagency.com)
- Render API key: `rnd_DeYWHDVUAPLfar51cvJrOoBThBsZ`
- Cron Job (Node.js runtime, Frankfurt region)
- Environment vars: RAPIDAPI_KEY, RAPIDAPI_HOST, SUPABASE_URL, SUPABASE_SERVICE_KEY, AI_SERVER_URL
- Schedule: `0 0,6,12,18 * * *` (every 6 hours)
- Source: GitHub repo or inline code

### Phase 4: Retire Tom Dependencies

1. **Disable** `crm-ig-sync-daily` pg_cron job (ID 20)
2. **Keep** `ig-sync` Edge Function code but don't call it (backup)
3. **Keep** existing snapshot data (historical reference)
4. **Remove** Tom's Supabase credentials from Edge Function secrets (after validation)
5. **Update** frontend to not depend on Tom's storage URLs for thumbnails
   - Thumbnails from RapidAPI: `image_versions2.candidates[0].url`
   - These are CDN URLs, may expire — consider storing in our own Supabase Storage

### Phase 5: Frontend Updates

**Traffic Analytics page** (`/traffic-analytics`):
- Replace current outlier logic display with VPD-based columns
- Show `lifetime_vpd`, `effective_vpd`, `virality_ratio` on reel cards
- Add **TRENDING** badge (orange, pulsing) alongside existing OUTLIER badge
- Show `projected_views` on hover or in detail view
- Sort/filter by effective_vpd instead of raw views
- Account tier indicator (small/mid/large) next to account name

**Reel cards show**:
- Views + VPD (e.g., "45K views • 18K/day")
- Ratio badge (e.g., "45x median")
- WINNER / TRENDING / WINNER+TRENDING badges
- Projected views if < 14 days old

### Phase 6: "Add Competitor" Workflow

When a user adds a new competitor username via the UI:

1. **Insert** into `crm_competitor_watchlists` (ig_username, creator_id, format_id)
2. **Immediate first sync** (triggered by the UI, not waiting for cron):
   a. Fetch profile → save follower_count, bio, profile_pic
   b. Fetch ALL reels with pagination (all pages)
   c. For each reel: try to get posted_at via get_media_data (1 call per reel that needs it)
   d. Upsert reels + create first snapshots
   e. Calculate VPD + median + thresholds
   f. Flag outliers → queue for AI if they pass the projection gate
3. **From next cycle onward**: the cron picks them up automatically every 6h

First sync is the most expensive (fetches all reels + individual dates). After that, each 6h cycle only checks < 14-day reels.

**"Sync Now" button** in the UI: Triggers the same full sync as adding a new account. Useful after manual changes or to force a refresh.

---

## Summary

| Step | What | Depends On |
|------|------|------------|
| Phase 1 | DB migration (new table, columns, constraint) | Nothing |
| Phase 2 | Rewrite competitor-sync Edge Function | Phase 1 |
| Phase 3 | Own reel VPD calculation (RPC or Edge Function) | Phase 1 |
| Phase 4 | Cron schedule (4x/day competitor, 1x/day own) | Phase 2 + 3 |
| Phase 5 | Frontend updates (badges, VPD display, sorting) | Phase 1 |
| Phase 6 | "Add Competitor" immediate sync workflow | Phase 2 |

Phase 1 is DB migration (Jarvis applies directly).
Phases 2-3 are the Render scraper (one Coder task — biggest piece).
Phase 4 is cleanup (Jarvis does directly).
Phase 5 is frontend (second Coder task).
Phase 6 is wiring (part of Phase 2 or 5).

**Total Coder tasks**: 2
1. **Backend**: Render scraper + DB migration + VPD calculation engine
2. **Frontend**: Badges, VPD display, "Add Competitor" flow, account tier UI

**Deployment order**: DB migration → Render scraper → validate data → frontend → retire Tom deps
