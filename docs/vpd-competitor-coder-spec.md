# Coder Spec: Add VPD to Competitor Reels + UI

## Summary
Add VPD columns to `crm_competitor_reels`, update the scraper's `processCompetitorAccount` to calculate VPD, and update the Competitor Analysis tab in Traffic Analytics to show VPD/trending badges.

## Part 1: Database Migration SQL

Create file `supabase/migrations/012_competitor_vpd.sql`:

```sql
-- Add VPD columns to competitor reels (matching own reels structure)
ALTER TABLE crm_competitor_reels
  ADD COLUMN IF NOT EXISTS lifetime_vpd double precision,
  ADD COLUMN IF NOT EXISTS effective_vpd double precision,
  ADD COLUMN IF NOT EXISTS delta_vpd double precision,
  ADD COLUMN IF NOT EXISTS is_trending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS projected_views double precision;
```

## Part 2: Scraper — `render-scraper/src/index.ts`

### 2a. Update `processCompetitorAccount` to calculate VPD

Currently competitor reels use `virality_ratio` (views / avg). Replace with VPD.

After upserting the competitor reel and inserting a snapshot, add VPD calculation:

```typescript
// After: await deps.storage.insertCompetitorSnapshot(upserted.id, reel);

const finalPostedAt = upserted.posted_at ?? postedAtIso;
if (finalPostedAt) {
  const vpd = calculateReelVPD(reel.views, new Date(finalPostedAt), prevSnapshot, now);
  processed.push({
    reelId: upserted.id,
    code: sourceCode(reel),
    // ... same as own reels
    vpd,
    flags: { is_winner: false, is_outlier: false, is_trending: false, virality_ratio: 0 },
  });
}
```

Then after collecting all processed competitor reels, calculate account stats and update flags — same logic as own reels:
1. Calculate `accountMedianVpd` from all processed reels
2. Apply sliding thresholds (5x small / 3x mid / 2x large) — but use **3x minimum** for competitors per spec
3. Set `is_trending` based on delta_vpd
4. Call `storage.updateCompetitorReelVPD(...)` to persist

### 2b. Add `storage.updateCompetitorReelVPD` to `render-scraper/src/storage.ts`

```typescript
async updateCompetitorReelVPD(
  reelId: string,
  data: {
    lifetime_vpd: number;
    effective_vpd: number;
    delta_vpd: number | null;
    performance_ratio: number;
    is_trending: boolean;
    projected_views: number;
  }
): Promise<void> {
  await this.supabase
    .from('crm_competitor_reels')
    .update({
      lifetime_vpd: data.lifetime_vpd,
      effective_vpd: data.effective_vpd,
      delta_vpd: data.delta_vpd,
      virality_ratio: data.performance_ratio,
      is_outlier: data.performance_ratio >= 3.0 && data.projected_views >= 100000,
      is_trending: data.is_trending,
      projected_views: data.projected_views,
    })
    .eq('id', reelId);
}
```

### 2c. Add `getPreviousCompetitorSnapshot` to `render-scraper/src/storage.ts`

Same pattern as `getPreviousOwnSnapshot` but for `crm_competitor_reel_snapshots`:
```typescript
async getPreviousCompetitorSnapshot(competitorReelId: string): Promise<{ views: number; scraped_at: string } | null> {
  const { data } = await this.supabase
    .from('crm_competitor_reel_snapshots')
    .select('views,scraped_at')
    .eq('competitor_reel_id', competitorReelId)
    .order('scraped_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}
```

## Part 3: Traffic Analytics UI — `app/(crm)/traffic-analytics/page.tsx`

### 3a. Update `CompetitorReel` type
Add VPD fields:
```typescript
type CompetitorReel = {
  // ... existing fields ...
  lifetime_vpd?: number | null;
  effective_vpd?: number | null;
  delta_vpd?: number | null;
  is_trending?: boolean | null;
  projected_views?: number | null;
};
```

### 3b. Update competitor reels Supabase query
Add VPD fields to the select, sort by `effective_vpd` desc:
```typescript
.select("id,watchlist_id,play_count,like_count,comment_count,caption,virality_ratio,is_outlier,analysis_status,matched_pattern_id,ig_media_code,thumbnail_url,video_url,posted_at,lifetime_vpd,effective_vpd,delta_vpd,is_trending,projected_views")
.order("effective_vpd", { ascending: false, nullsFirst: false })
```

### 3c. Update competitor IdeaCard rendering
Pass VPD props to IdeaCard for competitor reels (same as own reels):
```tsx
<IdeaCard
  // ... existing props ...
  vpd={reel.effective_vpd}
  projectedViews={reel.projected_views}
  isTrending={reel.is_trending}
/>
```

### 3d. Update competitor ThumbnailCard rendering
Same — pass `vpd` and `isTrending` props.

### 3e. Add trending filter to competitor tab
Add a "🔥 Trending" toggle button in the competitor tab filter area (same styling as winning tab).

## Test
1. `cd render-scraper && npm run build` — must pass
2. `cd .. && npm run build` — must pass (frontend)
3. Verify migration SQL is valid
4. Check competitor IdeaCard shows VPD badge, projected views, trending

## DO NOT
- Change the own reels (Winning Patterns) tab — already done
- Remove existing virality_ratio — keep it, just also calculate VPD
- Change the IdeaCard/ThumbnailCard component signatures that already have vpd/isTrending props (those were added in the previous task)
