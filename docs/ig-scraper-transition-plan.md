# IG Scraper Transition Plan: Tom → Our Own System

## Current State

### What exists today:

**Tom's Pipeline (still running):**
- Tom's scraper runs daily ~00:08-01:45 UTC
- Scrapes accounts listed in HIS `am_funneling_accounts` table (niklas@1clickcontent.de login)
- Stores: reels in `am_reels`, daily snapshots in `am_reels_daily_snapshots`, account snapshots in `am_account_daily_snapshots`
- Our `ig-sync` Edge Function (cron 02:00 UTC) copies his data → our tables:
  - `am_reels` → `crm_ig_reels` (matched by shortcode from `thumb_path`)
  - `am_reels_daily_snapshots` → `crm_ig_reel_daily_snapshots`
- **Tom only scrapes accounts HE has added.** We can't add new accounts to his system.

**Our data (from Tom):**
- `crm_ig_reel_daily_snapshots`: 114,071 rows, Dec 15 2025 → Mar 7 2026 (82 days), 5,695 unique reels
- `crm_ig_reels`: 5,740 reels (metadata)
- `crm_ig_accounts`: 78 accounts (62 active, 16 inactive)

**Our new Render scraper (just built, first successful test):**
- Scrapes via RapidAPI (our own key, independent of Tom)
- Writes to NEW table: `crm_ig_reel_snapshots` (6-hourly, not daily)
- Currently has: 6 snapshots (from 1 test account)
- Runs every 6h: `0 0,6,12,18 * * *`
- Can scrape ANY account — just needs to be in `crm_ig_accounts`

### The problems:

1. **Can't add new IG accounts** — Tom controls which accounts get scraped. New accounts we add to `crm_ig_accounts` don't exist in Tom's system → no data.
2. **Dashboard RPCs read `crm_ig_reel_daily_snapshots`** (Tom's format) — our new scraper writes to `crm_ig_reel_snapshots` (different table, different schema)
3. **If we stop Tom's feed, we lose continuity** — existing RPCs need daily snapshots
4. **If we keep both running, we have conflicting data sources**

---

## The Plan

### Phase 1: Preserve Tom's Historical Data (do nothing, it stays)

Tom's data is already in our DB:
- `crm_ig_reel_daily_snapshots` — 114K rows, 82 days of history
- `crm_ig_reels` — 5,740 reels with metadata, thumbnails, video URLs

**This data stays forever.** It's our historical baseline. No action needed.

### Phase 2: Make Our Scraper Write Daily Snapshots Too

**Problem:** Dashboard RPCs (`ig_account_reel_stats`, `ig_active_reels`, `ig_max_selectable_date`) all query `crm_ig_reel_daily_snapshots`. Our scraper writes to `crm_ig_reel_snapshots` (different table).

**Solution:** After each scrape cycle, our scraper should also UPSERT a row into `crm_ig_reel_daily_snapshots` for today's date. This way:
- Historical data (Dec 15 → today) = Tom's snapshots
- Today onwards = our scraper adds daily rows in the SAME format
- Dashboard RPCs work without changes
- VPD uses 6-hourly snapshots for real-time trending; dashboard uses daily snapshots for analytics

**Logic per reel:**
```
today = YYYY-MM-DD (UTC)
UPSERT into crm_ig_reel_daily_snapshots:
  ig_reel_id = reel.id
  supabase_reel_id = reel.supabase_reel_id  
  account_id = reel.ig_account_id
  snapshot_date = today
  views = current_views (cumulative)
  likes = current_likes
  comments = current_comments
  shares = current_shares
  views_delta = current_views - yesterday_views (or 0 if no yesterday)
  likes_delta = current_likes - yesterday_likes
  comments_delta = current_comments - yesterday_comments
  shares_delta = current_shares - yesterday_shares
  last_synced_at = NOW()
ON CONFLICT (ig_reel_id, snapshot_date) DO UPDATE
```

This is identical to what Tom's system produces. Seamless continuity.

### Phase 3: Adding New IG Accounts (the Socials page flow)

**Current flow:**
1. Admin goes to `/admin/socials`
2. Selects creator → enters IG usernames
3. Saves → creates rows in `crm_ig_accounts`
4. ig-sync copies reels from Tom's `am_reels` WHERE username matches
5. **Problem: if username isn't in Tom's system, nothing happens**

**New flow (with our scraper):**
1. Admin adds IG username on Socials page → `crm_ig_accounts` row created
2. Next scraper cycle (every 6h) picks it up automatically (queries `is_active = true`)
3. Scraper calls RapidAPI → gets profile + reels
4. Writes reels to `crm_ig_reels` + snapshots to both tables
5. Dashboard shows data within 6 hours

**No changes needed to the Socials page or scraper.** The scraper already loads all active `crm_ig_accounts`. Adding a new account on Socials = it gets scraped next cycle.

**Optional UX improvement:** Add a "Sync Now" button on Socials page that triggers an immediate scrape for that account (POST to an Edge Function that calls the Render API to trigger a job, or direct RapidAPI call).

### Phase 4: Cutover from Tom's ig-sync

**When:** After our scraper has been running successfully for 3+ days and daily snapshots are flowing.

**Steps:**
1. Disable the `ig-sync` Edge Function cron (job ID 20, 02:00 UTC)
2. Keep Tom's ig-sync code but don't run it — fallback if needed
3. Our Render scraper is now the sole source of truth

**Rollback:** Re-enable ig-sync cron if anything breaks.

### Phase 5: Member Visibility (already works)

**Current system:**
- `crm_chatters` = team members (employees)
- `crm_chatters.assigned_creators` = array of creator UUIDs they manage
- Dashboard filters data by `assigned_creators` for non-admin roles
- Admin sees everything

**Flow:**
- Member "Jacky" assigned to creators [Abby, Zoe]
- When Jacky logs in → dashboard shows IG stats for Abby + Zoe accounts only
- Pie charts, reel lists, analytics all filtered

**No changes needed.** The `creator_id` on `crm_ig_accounts` already links accounts to creators, and the dashboard already filters by role.

---

## Data Flow Diagram

```
BEFORE (Tom dependency):
  Tom's scraper → Tom's DB → ig-sync Edge Function → our crm_ig_reel_daily_snapshots → Dashboard RPCs

AFTER (fully independent):
  RapidAPI → Render scraper → crm_ig_reels (upsert by shortcode)
                             → crm_ig_reel_snapshots (6-hourly, for VPD/trending)
                             → crm_ig_reel_daily_snapshots (daily rollup, for dashboard RPCs)
                             → crm_ig_accounts (profile updates: followers, bio, pic)
```

---

## Questions for Tom (if needed)

1. **Account list:** Can you share a dump of your `am_funneling_accounts` table? We want to verify our 78 accounts match yours. If you have accounts we don't, we need to add them.
2. **Will you keep scraping?** We're building our own pipeline. Once live, we'll stop pulling from your DB. Just want to know your timeline so we don't lose any days in between.
3. **Account-level daily snapshots:** Your `am_account_daily_snapshots` table has daily follower counts per account. We're not pulling this currently. Do you have historical follower data we should grab before cutover?

---

## What Needs to Be Built

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 1 | Add daily snapshot rollup to Render scraper | Small (add upsertDailySnapshot function) | **P0 — blocks everything** |
| 2 | Verify scraper handles all 62 active accounts without errors | Test run (already in progress) | P0 |
| 3 | Backfill: run scraper once with full historical pull for new accounts | One-time script | P1 |
| 4 | Disable Tom's ig-sync cron after 3 days of successful scraper runs | Config change | P1 |
| 5 | "Sync Now" button on Socials page (optional UX) | Small | P2 |
| 6 | Pull Tom's `am_account_daily_snapshots` for follower history | One-time migration | P2 |

---

## Timeline

- **Today (Mar 7):** Fix scraper bugs, add daily snapshot rollup, full test run
- **Mar 8-10:** Scraper runs 4x/day, verify data matches Tom's for overlapping accounts
- **Mar 10:** Disable Tom's ig-sync cron, fully independent
- **Ongoing:** Any new IG account added on Socials → automatically scraped within 6h
