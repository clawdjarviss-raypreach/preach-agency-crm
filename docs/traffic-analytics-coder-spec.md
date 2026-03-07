# Traffic Analytics Page — Coder Implementation Spec

## Overview
Build a new **Traffic Analytics** page at `/traffic-analytics` in the Preach CRM. This page enables content employees and admins to analyze their own reel performance (Winning Patterns) and competitor reels (Competitor Analysis), organized by creator and content format.

## IMPORTANT: Reference Files
- Existing CRM layout: `app/(crm)/layout.tsx` — NAV_ITEMS array for sidebar
- Existing dashboard patterns: `app/(crm)/manager-dashboard/page.tsx` — follow same Supabase query patterns, dark theme, recharts usage
- Supabase config: `lib/supabase.ts`
- RapidAPI config: `docs/rapidapi-ig-config.md`
- Reel analysis skill output format: `docs/reel-analysis-skill.md`

---

## Part 1: Supabase Schema (Migration SQL)

Create migration file: `supabase/migrations/008_traffic_analytics.sql`

### Table: `crm_content_formats`
```sql
CREATE TABLE crm_content_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,        -- e.g. 'Omegle', 'Mechanic', 'Talking', 'Generic'
  description TEXT,
  icon TEXT,                         -- emoji or icon name
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default formats
INSERT INTO crm_content_formats (name, description, icon) VALUES
  ('Omegle', 'Omegle-style reaction/interaction content', '🎥'),
  ('Mechanic', 'Mechanic/workshop themed content', '🔧'),
  ('Talking', 'Talking/conversation style content', '🗣️'),
  ('Generic', 'General branding and lifestyle content', '✨');
```

### Table: `crm_competitor_watchlists`
```sql
CREATE TABLE crm_competitor_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES crm_creators(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES crm_content_formats(id) ON DELETE CASCADE,
  ig_username TEXT NOT NULL,          -- competitor IG username
  ig_user_id TEXT,                    -- IG numeric user ID (from RapidAPI pk field)
  follower_count INT,
  profile_pic_url TEXT,
  bio TEXT,
  avg_views NUMERIC,                  -- calculated from reels
  last_synced_at TIMESTAMPTZ,
  created_by UUID REFERENCES crm_chatters(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, format_id, ig_username)
);
```

### Table: `crm_competitor_reels`
```sql
CREATE TABLE crm_competitor_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES crm_competitor_watchlists(id) ON DELETE CASCADE,
  ig_media_code TEXT NOT NULL,         -- reel shortcode (e.g. 'DVbtNAbDPKS')
  ig_media_id TEXT,                    -- IG numeric media ID
  play_count INT,
  like_count INT,
  comment_count INT,
  caption TEXT,
  thumbnail_url TEXT,
  video_url TEXT,                      -- direct video URL from RapidAPI
  is_outlier BOOLEAN DEFAULT false,
  outlier_multiplier NUMERIC,          -- e.g. 2.3x avg
  posted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(watchlist_id, ig_media_code)
);
```

### Table: `crm_reel_analyses`
Stores AI analysis results for BOTH own reels and competitor reels.
```sql
CREATE TABLE crm_reel_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic: either own_reel_id OR competitor_reel_id is set
  own_reel_id UUID REFERENCES crm_ig_reels(id) ON DELETE CASCADE,
  competitor_reel_id UUID REFERENCES crm_competitor_reels(id) ON DELETE CASCADE,
  -- Analysis JSON output from reel analysis skill
  hook TEXT,
  retention TEXT,
  pattern_name TEXT,
  pattern_formula TEXT,
  triggers JSONB,                     -- string array
  props JSONB,                        -- string array
  difficulty INT,
  difficulty_note TEXT,
  performance_analysis TEXT,
  -- Meta
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  model_used TEXT DEFAULT 'opus',
  CONSTRAINT one_reel_ref CHECK (
    (own_reel_id IS NOT NULL AND competitor_reel_id IS NULL) OR
    (own_reel_id IS NULL AND competitor_reel_id IS NOT NULL)
  )
);
```

### RLS Policies
```sql
-- content_formats: readable by all authenticated
ALTER TABLE crm_content_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formats_read" ON crm_content_formats FOR SELECT TO authenticated USING (true);

-- competitor_watchlists: admin can do anything, others can read
ALTER TABLE crm_competitor_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlists_read" ON crm_competitor_watchlists FOR SELECT TO authenticated USING (true);
CREATE POLICY "watchlists_admin_write" ON crm_competitor_watchlists FOR ALL TO authenticated
  USING (crm_current_role() = 'admin');

-- competitor_reels: readable by all authenticated
ALTER TABLE crm_competitor_reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_reels_read" ON crm_competitor_reels FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_reels_service_write" ON crm_competitor_reels FOR ALL TO service_role USING (true);

-- reel_analyses: readable by all authenticated
ALTER TABLE crm_reel_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analyses_read" ON crm_reel_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyses_service_write" ON crm_reel_analyses FOR ALL TO service_role USING (true);
```

### Indexes
```sql
CREATE INDEX idx_comp_watchlists_creator ON crm_competitor_watchlists(creator_id);
CREATE INDEX idx_comp_watchlists_format ON crm_competitor_watchlists(format_id);
CREATE INDEX idx_comp_reels_watchlist ON crm_competitor_reels(watchlist_id);
CREATE INDEX idx_comp_reels_outlier ON crm_competitor_reels(is_outlier) WHERE is_outlier = true;
CREATE INDEX idx_reel_analyses_own ON crm_reel_analyses(own_reel_id) WHERE own_reel_id IS NOT NULL;
CREATE INDEX idx_reel_analyses_comp ON crm_reel_analyses(competitor_reel_id) WHERE competitor_reel_id IS NOT NULL;
```

---

## Part 2: Frontend — New Page

### 2a. Add to Sidebar
In `app/(crm)/layout.tsx`, add to `NAV_ITEMS` array AFTER the "Traffic Dashboard" entry:
```ts
{ href: "/traffic-analytics", label: "Traffic Analytics", emoji: "🔬", enabled: true, roles: ["marketing_manager", "admin"] },
```

### 2b. Create Page
Create `app/(crm)/traffic-analytics/page.tsx`

**Page Structure:**
```
┌─────────────────────────────────────────────┐
│ Traffic Analytics                    [header]│
│                                              │
│ [Creator Selector Dropdown]                  │
│                                              │
│ ┌──────┬──────────────┬────────────────────┐ │
│ │Model │ Winning      │ Competitor         │ │
│ │Info  │ Patterns     │ Analysis           │ │
│ └──────┴──────────────┴────────────────────┘ │
│                                              │
│ [Tab Content Area]                           │
│                                              │
└─────────────────────────────────────────────┘
```

### 2c. Creator Selector
- Dropdown at top of page
- Admin sees ALL creators from `crm_creators`
- Non-admin: only sees creators in their `crm_chatters.assigned_creators` array
- Selected creator persisted in state (not URL)

### 2d. Tab: Model Info
For the selected creator, show:
- Creator name, profile image
- `instagram_usernames` list (linked IG accounts)
- Placeholder sections for: "Character Reference", "Outfit Guide", "Branding Assets"
- These are empty for now with "Coming soon" — the content upload system will be built later
- Show basic stats: total IG followers (sum across mapped accounts), total reels, avg views

### 2e. Tab: Winning Patterns (Own Reels)
For the selected creator:
1. Query `crm_ig_reels` WHERE `ig_account_id` IN (accounts mapped to this creator)
2. Calculate avg views across all reels for this creator
3. Filter to outliers: `views >= 1.5 * avg_views` (use latest snapshot data)
4. Display as a grid of reel cards:
   - Thumbnail image (from `thumbnail_url`)
   - Hover: play video (from `video_url`) — same pattern as `ReelsGrid.tsx`
   - Below thumbnail: views, likes, comments, outlier multiplier (e.g. "2.3x")
   - If `crm_reel_analyses` exists for this reel → show "Analyzed ✅" badge
   - Click → expand analysis card showing: hook, retention, pattern_name, pattern_formula, triggers, props, difficulty, performance_analysis
5. If no analysis exists → show "Awaiting Analysis" badge (Claude SDK will fill these later)
6. Sort by views descending

### 2f. Tab: Competitor Analysis
For the selected creator:
1. Show format sub-tabs (from `crm_content_formats` table)
2. For each format, two sections:

**Section A: Watchlist Management**
- Show existing watchlist accounts for this creator + format
- Each account card: username, profile pic, follower count, avg views, last synced
- "Add Competitor" button → input field for IG username → insert into `crm_competitor_watchlists`
- "Remove" button per account (admin only)

**Section B: Outlier Reels**
- Query `crm_competitor_reels` WHERE `watchlist_id` in (this creator's watchlists for this format) AND `is_outlier = true`
- Same reel card grid as Winning Patterns:
  - Thumbnail, hover video, views, likes, comments, outlier multiplier
  - Analysis badge (analyzed / awaiting)
  - Click → expand analysis
- Sort by views descending

### 2g. Styling
- Follow existing dark theme from `manager-dashboard/page.tsx`
- Background: `#111` / `#1a1a1a` for cards
- Same font, spacing, color palette
- Responsive: works on mobile (single column) and desktop (grid)
- Use Tailwind classes consistent with existing pages

---

## Part 3: Supabase Edge Function — `competitor-sync`

Create `supabase/functions/competitor-sync/index.ts`

This Edge Function syncs competitor reel data from RapidAPI for all active watchlist entries.

### Logic:
```
1. Fetch all rows from crm_competitor_watchlists
2. For each watchlist entry:
   a. Call RapidAPI POST /get_ig_user_reels.php
      - username_or_url = watchlist.ig_username
      - amount = "30"
   b. Parse response: reels are at data.reels[].node.media
   c. Extract: code, play_count, like_count, comment_count, image_versions2[0].url
   d. Upsert into crm_competitor_reels (ON CONFLICT watchlist_id + ig_media_code)
   e. Calculate avg_views across all reels for this account
   f. Update crm_competitor_watchlists.avg_views and .last_synced_at
   g. Mark outliers: any reel with play_count >= 1.5 * avg_views → is_outlier = true, calculate outlier_multiplier
3. Rate limiting: max 50 req/min on RapidAPI ULTRA plan
   - Add 1.5s delay between requests
   - If rate limited (429 response), wait 60s and retry
```

### Environment Variables (already in Edge Function secrets):
```
RAPIDAPI_KEY=9a05d0ce4bmshafdc9ec10bd5d1bp1fee88jsne08a00f6bef3
RAPIDAPI_HOST=instagram-scraper-stable-api.p.rapidapi.com
```

### RapidAPI Response Structure (tested):
```json
{
  "reels": [
    {
      "node": {
        "media": {
          "code": "DVbtNAbDPKS",
          "pk": "3844865512790880914",
          "play_count": 8045,
          "like_count": 48,
          "comment_count": 6,
          "image_versions2": {
            "candidates": [{ "url": "https://..." }]
          }
        }
      }
    }
  ],
  "pagination_token": "..."
}
```

### Invocation:
- Manual: `POST /functions/v1/competitor-sync` with service role JWT
- Cron: Add pg_cron job `crm-competitor-sync-daily` at `0 2 * * *` (02:00 UTC daily)

```sql
SELECT cron.schedule(
  'crm-competitor-sync-daily',
  '0 2 * * *',
  $$SELECT net.http_post(
    url := 'https://hufcbxodgxinbvpqfaaw.supabase.co/functions/v1/competitor-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZmNieG9kZ3hpbmJ2cHFmYWF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ2OTMyOCwiZXhwIjoyMDg4MDQ1MzI4fQ.VbvTkS9CA08NTw6-Cdhov04Eyh9lAe4Fvifvf4na4T4',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

---

## Part 4: What NOT to Build (Claude SDK — separate phase)

The AI analysis pipeline (Claude SDK on Mac Mini) is NOT part of this task. The `crm_reel_analyses` table will be empty initially. The UI should gracefully handle missing analyses with "Awaiting Analysis" badges.

DO NOT:
- Build any AI analysis logic
- Call any LLM APIs
- Try to fill crm_reel_analyses programmatically

The analysis pipeline will be connected separately via Claude SDK.

---

## Files to Create/Modify

### Create:
1. `supabase/migrations/008_traffic_analytics.sql` — schema
2. `app/(crm)/traffic-analytics/page.tsx` — main page
3. `supabase/functions/competitor-sync/index.ts` — Edge Function

### Modify:
1. `app/(crm)/layout.tsx` — add nav item

### Reference (read-only):
1. `app/(crm)/manager-dashboard/page.tsx` — styling patterns, Supabase query patterns
2. `app/(crm)/manager-dashboard/ReelsGrid.tsx` — reel thumbnail grid + hover video pattern
3. `docs/rapidapi-ig-config.md` — API endpoints
4. `docs/reel-analysis-skill.md` — analysis output JSON format

---

## Verification
1. `npm run build` must pass clean
2. New sidebar item visible for admin/marketing_manager roles
3. Creator selector works (shows all creators for admin)
4. Model Info tab shows creator info + IG accounts
5. Winning Patterns tab shows outlier reels from existing `crm_ig_reels` data
6. Competitor Analysis tab shows format sub-tabs
7. Watchlist management: can add/remove competitor accounts
8. Edge Function deploys and responds to POST
